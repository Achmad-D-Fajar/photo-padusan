const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const sharp = require("sharp");
const { loadTs } = require("./helpers/load-ts.cjs");

const moduleCache = new Map();
const core = loadTs("src/lib/watermark/core.ts", {}, moduleCache);
const dct = loadTs("src/lib/watermark/dct.ts", {}, moduleCache);
const { processImageForStorage } = loadTs("src/lib/server/image-processing.ts", {}, moduleCache);
const { embedMetadata } = loadTs("src/lib/server/exif-writer.ts", {}, moduleCache);

const userId = "11111111-1111-4111-8111-111111111111";
const uploadPath = `${userId}/44444444-4444-4444-8444-444444444444.jpg`;
const postReq = body =>
  new Request("http://localhost/api/photos/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function createTexturedRgb(width, height, seed = 88) {
  const rgb = Buffer.alloc(width * height * 3);
  let s = seed >>> 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const noise = ((s >>> 24) - 128) * 0.08;
      const off = (y * width + x) * 3;
      rgb[off] = Math.min(255, Math.max(0, Math.round(45 + (160 * x) / width + 16 * Math.sin(x / 17) + noise)));
      rgb[off + 1] = Math.min(255, Math.max(0, Math.round(55 + (150 * y) / height + 16 * Math.cos(y / 19) + noise)));
      rgb[off + 2] = Math.min(255, Math.max(0, Math.round(65 + (130 * (width - x)) / width + noise)));
    }
  }
  return rgb;
}

function makeExtractHarness({ authenticated = true, fileBytes = Buffer.from("jpeg"), storedSize } = {}) {
  const calls = [];
  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: authenticated ? { id: userId } : null },
        error: null,
      }),
    },
    from() {
      calls.push(["db"]);
      throw new Error("Extraction route must never query the database");
    },
    storage: {
      from: bucket => ({
        info: async p => {
          calls.push(["info", bucket, p]);
          return { data: { size: storedSize ?? fileBytes.byteLength }, error: null };
        },
        download: async p => {
          calls.push(["download", bucket, p]);
          return { data: new Blob([fileBytes]), error: null };
        },
        remove: async paths => {
          calls.push(["remove", bucket, paths]);
          return { error: null };
        },
      }),
    },
  };
  const route = loadTs("src/app/api/photos/extract/route.ts", {
    "@/lib/supabase/server": { createClient: async () => supabase },
  });
  return { calls, post: body => route.POST(postReq(body)) };
}

test("extract route rejects unauthenticated requests, foreign paths, and oversized staged files", async () => {
  // 1. Unauthenticated -> 401 without touching storage
  {
    const { calls, post } = makeExtractHarness({ authenticated: false });
    const res = await post({ path: uploadPath });
    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
  }

  // 2. Foreign user's staged path -> 400 without touching storage
  {
    const { calls, post } = makeExtractHarness();
    const res = await post({ path: uploadPath.replace(userId, "another-user") });
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  }

  // 3. Oversized stored file -> 413 before downloading, and cleans up staged file
  {
    const { calls, post } = makeExtractHarness({ storedSize: 50 * 1024 * 1024 + 1 });
    const res = await post({ path: uploadPath });
    assert.equal(res.status, 413);
    assert.ok(!calls.some(([name]) => name === "download"));
    assert.ok(calls.some(([name, bucket]) => name === "remove" && bucket === "photo-uploads"));
  }
});

test("extract route returns 503 JSON and cleans staging when native image loader fails", async t => {
  const logged = [];
  t.mock.method(console, "error", (...args) => logged.push(args));
  let removed = false;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    storage: {
      from: () => ({
        info: async () => ({ data: { size: 10 }, error: null }),
        download: async () => ({ data: new Blob(["jpeg"]), error: null }),
        remove: async () => {
          removed = true;
          return { error: null };
        },
      }),
    },
  };
  const stubs = { "@/lib/supabase/server": { createClient: async () => supabase } };
  Object.defineProperty(stubs, "@/lib/watermark/core", {
    get() {
      throw new Error("ERR_DLOPEN_FAILED: libvips-cpp.so");
    },
  });
  const route = loadTs("src/app/api/photos/extract/route.ts", stubs);
  const res = await route.POST(postReq({ path: uploadPath }));
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.match(body.error, /Pemroses gambar belum tersedia/);
  assert.equal(removed, true);
  assert.equal(logged[0][0], "[photo-extract:load]");
});

test("extract route recovers exact UTF-8 payloads from production previews, cleans staging, and never logs payloads", async t => {
  const logged = [];
  t.mock.method(console, "log", (...args) => logged.push(args));
  t.mock.method(console, "error", (...args) => logged.push(args));

  const sourceJpeg = await sharp(createTexturedRgb(1400, 900, 123), {
    raw: { width: 1400, height: 900, channels: 3 },
  })
    .jpeg({ quality: 94 })
    .toBuffer();

  for (const payloadText of ["PADUSTOCK-IWM-v1", "  Desa Padusan 🌿\n<script>teks</script>\t "]) {
    const { watermarkedBuffer } = await processImageForStorage(sourceJpeg, {
      invisibleWatermarkPayload: core.encodeWatermarkText(payloadText),
    });
    const finalPreview = embedMetadata(watermarkedBuffer, {
      caption: "Field | Sawah",
      tags: ["padusan"],
      artist: "Fotografer",
      copyright: "© 2026 Fotografer",
      software: "Padustock",
      photoPageUrl: "https://padustock.vercel.app/photo/test",
    });

    const { calls, post } = makeExtractHarness({ fileBytes: finalPreview });
    const res = await post({ path: uploadPath });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {
      success: true,
      data: {
        payload: payloadText,
        byteLength: Buffer.byteLength(payloadText, "utf8"),
        version: 1,
        profile: 1,
      },
    });
    assert.ok(calls.some(([name, bucket]) => name === "remove" && bucket === "photo-uploads"));
    assert.ok(!calls.some(([name]) => name === "db"));
    assert.equal(JSON.stringify(logged).includes(payloadText), false);
  }
});

test("extract route returns explicit 422 error codes and cleans staging for unmarked, invalid, tampered, unsupported, and non-UTF-8 inputs", async () => {
  const unmarkedJpeg = await sharp(createTexturedRgb(640, 480, 77), {
    raw: { width: 640, height: 480, channels: 3 },
  })
    .jpeg({ quality: 80 })
    .toBuffer();

  // Build lossless PNGs with fault-injected watermark packets to exercise every protocol error code
  const width = 400;
  const height = 400;
  const baseRgb = createTexturedRgb(width, height, 61);
  const makeCustomPng = async (version, profile, lengthField, payloadBytes, corruptDigest = false) => {
    const body = Buffer.alloc(8 + payloadBytes.length);
    body.write("PDIW", 0, "ascii");
    body[4] = version;
    body[5] = profile;
    body[6] = (lengthField >>> 8) & 0xff;
    body[7] = lengthField & 0xff;
    payloadBytes.copy(body, 8);
    const digest = crypto.createHash("sha256").update(body).digest();
    if (corruptDigest) digest[0] ^= 0xff;
    const outRgb = dct.embedPacketInRgb(baseRgb, width, height, new Uint8Array(Buffer.concat([body, digest])));
    return sharp(Buffer.from(outRgb), { raw: { width, height, channels: 3 } }).png().toBuffer();
  };

  const invalidUtf8Jpeg = await core.embedWatermark(unmarkedJpeg, new Uint8Array([0xff, 0xfe, 0x80, 0x41]));

  const cases = [
    ["unmarked", unmarkedJpeg, "NO_WATERMARK"],
    ["corrupt", Buffer.from("not an image"), "INVALID_IMAGE"],
    ["svg", Buffer.from('<svg width="400" height="400"></svg>'), "INVALID_IMAGE"],
    ["bad-version", await makeCustomPng(2, 1, 4, Buffer.from("test")), "UNSUPPORTED_VERSION"],
    ["bad-profile", await makeCustomPng(1, 2, 4, Buffer.from("test")), "UNSUPPORTED_PROFILE"],
    ["bad-length", await makeCustomPng(1, 1, 600, Buffer.from("test")), "INVALID_LENGTH"],
    ["tampered", await makeCustomPng(1, 1, 4, Buffer.from("test"), true), "INTEGRITY_FAILED"],
    ["invalid-utf8", invalidUtf8Jpeg, "INVALID_UTF8"],
  ];

  for (const [label, fileBytes, expectedCode] of cases) {
    const { calls, post } = makeExtractHarness({ fileBytes });
    const res = await post({ path: uploadPath });
    assert.equal(res.status, 422, `case ${label}`);
    const body = await res.json();
    assert.equal(body.success, false, `case ${label}`);
    assert.equal(body.code, expectedCode, `case ${label}`);
    assert.equal(typeof body.error, "string");
    assert.ok(body.error.length > 0);
    assert.ok(calls.some(([name, bucket]) => name === "remove" && bucket === "photo-uploads"), `cleanup ${label}`);
  }
});

test("extractPhotoWatermark attempts client staging cleanup after any unsuccessful extraction response", async t => {
  const stagedPath = `${userId}/55555555-5555-4555-8555-555555555555.jpg`;

  for (const scenario of [
    {
      name: "401 expired session",
      extractResponse: () => new Response(JSON.stringify({ success: false, error: "Sesi telah berakhir. Silakan login kembali." }), { status: 401, headers: { "content-type": "application/json" } }),
      deleteStatus: 401,
      expectError: /Sesi telah berakhir/,
      expectCleanup: true,
    },
    {
      name: "502 non-JSON proxy error",
      extractResponse: () => new Response("<html>Bad Gateway</html>", { status: 502, headers: { "content-type": "text/html" } }),
      deleteStatus: 200,
      expectError: /Ekstraksi gagal/,
      expectCleanup: true,
    },
    {
      name: "422 NO_WATERMARK",
      extractResponse: () => new Response(JSON.stringify({ success: false, code: "NO_WATERMARK", error: "Watermark tersembunyi yang didukung tidak terdeteksi." }), { status: 422, headers: { "content-type": "application/json" } }),
      deleteStatus: 200,
      expectError: /tidak terdeteksi/,
      expectCleanup: true,
    },
    {
      name: "200 malformed payload",
      extractResponse: () => new Response(JSON.stringify({ success: true, data: { payload: 123 } }), { status: 200, headers: { "content-type": "application/json" } }),
      deleteStatus: 200,
      expectError: /Hasil ekstraksi tidak valid/,
      expectCleanup: true,
    },
    {
      name: "200 verified success",
      extractResponse: () => new Response(JSON.stringify({ success: true, data: { payload: "PADUSTOCK-IWM-v1", byteLength: 16 } }), { status: 200, headers: { "content-type": "application/json" } }),
      deleteStatus: 200,
      expectError: null,
      expectCleanup: false,
    },
  ]) {
    const deletePaths = [];
    t.mock.method(global, "fetch", async (url, init) => {
      if (url === "/api/photos/upload" && init?.method === "POST") {
        return new Response(
          JSON.stringify({ success: true, data: { path: stagedPath, token: "tok", contentType: "image/jpeg" } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url === "/api/photos/upload" && init?.method === "DELETE") {
        deletePaths.push(JSON.parse(init.body).path);
        return new Response(JSON.stringify({ success: scenario.deleteStatus === 200 }), { status: scenario.deleteStatus });
      }
      if (url === "/api/photos/extract" && init?.method === "POST") {
        return scenario.extractResponse();
      }
      throw new Error(`Unexpected fetch: ${init?.method} ${url}`);
    });

    class ExtractFailureError extends Error {}
    const { extractPhotoWatermark } = loadTs("src/lib/watermark-extract-client.ts", {
      "@/lib/supabase/client": {
        createClient: () => ({
          storage: {
            from: () => ({
              uploadToSignedUrl: async () => ({ error: null }),
            }),
          },
        }),
      },
      "@/components/dashboard/ExtractForm": { ExtractFailureError },
    });

    const file = new File([Buffer.from("dummy")], "sample.jpg", { type: "image/jpeg" });
    if (scenario.expectError) {
      await assert.rejects(
        extractPhotoWatermark(file),
        err => err instanceof ExtractFailureError && scenario.expectError.test(err.message),
        scenario.name
      );
    } else {
      const result = await extractPhotoWatermark(file);
      assert.deepEqual(result, { payload: "PADUSTOCK-IWM-v1", byteLength: 16 });
    }
    assert.deepEqual(deletePaths, scenario.expectCleanup ? [stagedPath] : [], scenario.name);
  }
});
