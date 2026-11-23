const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./helpers/load-ts.cjs");
const userId = "11111111-1111-4111-8111-111111111111";
const uploadPath = `${userId}/22222222-2222-4222-8222-222222222222.heic`;
const request = body => new Request("http://localhost/api/photos/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

for (const authenticated of [false, true]) {
  test(`preview ${authenticated ? "returns JSON and cleans staging when libvips is missing" : "authenticates before loading native image libraries"}`, async t => {
    let loads = 0;
    let cleaned = false;
    const logged = [];
    t.mock.method(console, "error", (...args) => logged.push(args));
    const supabase = {
      auth: { getUser: async () => ({ data: { user: authenticated ? { id: userId } : null }, error: null }) },
      storage: { from: () => ({
        info: async () => ({ data: { size: 10 }, error: null }),
        download: async () => ({ data: new Blob(["jpeg bytes"]), error: null }),
        remove: async () => { cleaned = true; return { error: null }; },
      }) },
    };
    const stubs = { "@/lib/supabase/server": { createClient: async () => supabase } };
    Object.defineProperty(stubs, "sharp", { get() {
      loads++;
      throw new Error("ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file");
    } });
    const route = loadTs("src/app/api/photos/preview/route.ts", stubs);
    const response = await route.POST(request({ path: uploadPath }));
    assert.equal(response.status, authenticated ? 503 : 401);
    assert.match(response.headers.get("content-type"), /application\/json/);
    const result = await response.json();
    assert.equal(result.success, false);
    assert.match(result.error, authenticated ? /Pemroses gambar belum tersedia/ : /login kembali/);
    assert.equal(loads, authenticated ? 1 : 0);
    assert.equal(cleaned, authenticated);
    if (authenticated) assert.equal(logged[0][0], "[photo-image:load]");
  });
}

function draftHarness(failure, { userAppMetadata } = {}) {
  const calls = [];
  const cache = new Map();
  const { WatermarkError } = loadTs("src/lib/watermark/core.ts", {}, cache);
  const { LEGAL_DOCUMENTS } = loadTs("src/lib/legal-documents.ts", {}, cache);
  const resolvedAppMetadata = userAppMetadata === undefined
    ? {
        legal_acknowledgment: {
          terms_version: LEGAL_DOCUMENTS.terms.version,
          privacy_version: LEGAL_DOCUMENTS.privacy.version,
          accepted_at: "2026-11-24T00:00:00Z",
        },
      }
    : userAppMetadata;
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: userId, app_metadata: resolvedAppMetadata } }, error: null }),
      admin: {
        updateUserById: async (uid, attrs) => {
          calls.push(["admin-update-user", uid, attrs]);
          return { data: { user: { id: uid, ...attrs } }, error: null };
        },
      },
    },
    from: table => ({
      select() { return this; }, eq() { return this; }, insert(data) { calls.push(["insert", data]); return this; },
      single: async () => table === "profiles" ? { data: { display_name: "photographer" } } : { data: failure === "database" ? null : { id: "photo" }, error: failure === "database" ? new Error("Database error") : null },
    }),
    storage: { from: bucket => ({
      info: async () => ({ data: { size: failure === "oversize" ? 50 * 1024 * 1024 + 1 : 100 }, error: null }),
      download: async () => { calls.push(["download"]); return { data: new Blob(["test"]), error: null }; },
      upload: async path => {
        calls.push(["upload", bucket, path]);
        if (failure === "thumbnail" && bucket === "thumbnails") return { error: new Error("Upload failed") };
        if (failure === "download-upload" && bucket === "photo-downloads") return { error: new Error("Download upload failed") };
        return { error: null };
      },
      move: async (source, destination) => { calls.push(["move", source, destination]); return { error: null }; },
      getPublicUrl: path => ({ data: { publicUrl: `https://example.test/storage/v1/object/public/${bucket}/${path}` } }),
      remove: async paths => { calls.push(["remove", bucket, paths]); return { error: null }; },
    }) },
  };
  const route = loadTs("src/app/api/photos/draft/route.ts", {
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/supabase/admin": { createAdminClient: () => supabase },
    "@/lib/server/image-processing": {
      processImageForStorage: async (_raw, options) => {
        calls.push(["process", options]);
        if (failure === "decode") throw new Error("Decode failed");
        if (failure === "watermark-too-small") {
          throw new WatermarkError("IMAGE_TOO_SMALL", "Dimensi gambar terlalu kecil untuk watermark tersembunyi.");
        }
        if (failure === "watermark-capacity") {
          throw new WatermarkError("CAPACITY_EXCEEDED", "Payload melebihi kapasitas maksimum gambar ini.");
        }
        return { watermarkedBuffer: Buffer.from("jpeg") };
      },
      createWatermarkedDownloadCopy: async (_raw, payload) => {
        calls.push(["download-copy", payload]);
        if (failure === "download-copy-capacity") {
          throw new WatermarkError("CAPACITY_EXCEEDED", "Payload melebihi kapasitas salinan unduhan.");
        }
        return {
          downloadBuffer: Buffer.from("fullres-jpeg"),
          width: 1600,
          height: 1000,
          contentType: "image/jpeg",
          extension: "jpg",
          jpegQuality: 92,
        };
      },
    },
    "@/lib/server/exif-writer": { embedMetadata: (bytes, metadata) => { calls.push(["metadata", metadata]); return bytes; } },
  }, cache);
  return {
    calls,
    LEGAL_DOCUMENTS,
    post: (path, extra = {}) =>
      route.POST(request({ path, caption_en: "Field", caption_id: "Sawah", tags_en: [], tags_id: [], publish_directly: true, ...extra })),
  };
}

test("draft rejects other users' upload references", async () => {
  const { calls, post } = draftHarness();
  assert.equal((await post(uploadPath.replace(userId, "another-user"))).status, 400);
  assert.equal(calls.length, 0);
});

test("stored size is checked before downloading or processing", async () => {
  const { calls, post } = draftHarness("oversize");
  assert.equal((await post(uploadPath)).status, 413);
  assert.ok(!calls.some(([name]) => name === "download" || name === "process" || name === "upload"));
  assert.ok(calls.some(([name, bucket]) => name === "remove" && bucket === "photo-uploads"));
});

test("decode failures create no permanent objects", async () => {
  const { calls, post } = draftHarness("decode");
  assert.equal((await post(uploadPath)).status, 500);
  assert.ok(!calls.some(([name]) => name === "upload" || name === "move"));
  assert.ok(calls.some(([name, bucket]) => name === "remove" && bucket === "photo-uploads"));
});

test("thumbnail upload failures clean the staged original", async () => {
  const { calls, post } = draftHarness("thumbnail");
  assert.equal((await post(uploadPath)).status, 502);
  assert.ok(calls.some(([name, bucket]) => name === "remove" && bucket === "photo-uploads"));
  assert.ok(!calls.some(([name]) => name === "move"));
});

test("database failures clean staging, thumbnail, download copy, and permanent original", async () => {
  const { calls, post } = draftHarness("database");
  assert.equal((await post(uploadPath)).status, 500);
  assert.deepEqual(
    calls.filter(([name]) => name === "remove").map(([, bucket]) => bucket).sort(),
    ["originals", "photo-downloads", "photo-uploads", "thumbnails"]
  );
});

test("download copy generation or upload failures fail atomically without leaving partial files or DB rows", async () => {
  // Derivative generation failure creates zero permanent objects
  {
    const { calls, post } = draftHarness("download-copy-capacity");
    assert.equal((await post(uploadPath)).status, 422);
    assert.ok(!calls.some(([name]) => name === "upload" || name === "move" || name === "insert"));
    assert.ok(calls.some(([name, bucket]) => name === "remove" && bucket === "photo-uploads"));
  }

  // Download-copy upload failure cleans up already-uploaded thumbnail and staged file
  // (and does NOT call remove on photo-downloads since this attempt's upload failed)
  {
    const { calls, post } = draftHarness("download-upload");
    assert.equal((await post(uploadPath)).status, 502);
    assert.ok(!calls.some(([name]) => name === "move" || name === "insert"));
    assert.deepEqual(
      calls.filter(([name]) => name === "remove").map(([, bucket]) => bucket).sort(),
      ["photo-uploads", "thumbnails"]
    );
  }
});

test("POST /api/photos/draft requires current terms and privacy acceptance when creating a free-download copy", async () => {
  const { LEGAL_DOCUMENTS } = loadTs("src/lib/legal-documents.ts");
  // Missing acknowledgment, outdated terms-2, or current terms-3 with older privacy-2 all reject publish_directly: true with 409
  for (const appMetadata of [
    {},
    { legal_acknowledgment: { terms_version: "terms-2", privacy_version: "privacy-2", accepted_at: "2026-10-29T00:00:00Z" } },
    { legal_acknowledgment: { terms_version: LEGAL_DOCUMENTS.terms.version, privacy_version: "privacy-2", accepted_at: "2026-11-24T00:00:00Z" } },
  ]) {
    const { calls, post } = draftHarness(undefined, { userAppMetadata: appMetadata });
    const res = await post(uploadPath, { publish_directly: true });
    assert.equal(res.status, 409);
    assert.ok(!calls.some(([name]) => name === "download-copy" || name === "upload" || name === "insert"));
  }

  // Saving as draft (no download copy created) still succeeds for users on older terms
  {
    const { calls, post } = draftHarness(undefined, { userAppMetadata: {} });
    const res = await post(uploadPath, { publish_directly: false });
    assert.equal(res.status, 201);
    assert.ok(!calls.some(([name]) => name === "download-copy"));
  }

  // Providing valid current legalAcknowledgment records app_metadata and allows publish_directly: true
  {
    const { calls, post, LEGAL_DOCUMENTS } = draftHarness(undefined, { userAppMetadata: { existing: true } });
    const res = await post(uploadPath, {
      publish_directly: true,
      legalAcknowledgment: {
        accepted: true,
        termsVersion: LEGAL_DOCUMENTS.terms.version,
        privacyVersion: LEGAL_DOCUMENTS.privacy.version,
      },
    });
    assert.equal(res.status, 201);
    const ackCall = calls.find(([name]) => name === "admin-update-user");
    assert.ok(ackCall);
    assert.equal(ackCall[2].app_metadata.existing, true);
    assert.equal(ackCall[2].app_metadata.legal_acknowledgment.terms_version, LEGAL_DOCUMENTS.terms.version);
  }
});

test("successful free publication creates download copy while retaining private HEIC source", async () => {
  const { calls, post } = draftHarness();
  assert.equal((await post(uploadPath)).status, 201);
  const processCall = calls.find(([name]) => name === "process");
  const downloadCall = calls.find(([name]) => name === "download-copy");
  assert.equal(Buffer.from(processCall[1].invisibleWatermarkPayload).toString("utf8"), "PADUSTOCK-IWM-v1");
  assert.equal(Buffer.from(downloadCall[1]).toString("utf8"), "PADUSTOCK-IWM-v1");
  const photo = calls.find(([name]) => name === "insert")[1];
  assert.equal(photo.status, "published");
  assert.equal(photo.microstock_url, null);
  assert.equal(photo.watermark_enabled, true);
  assert.equal(photo.download_watermark_version, "iwm-v1-placeholder");
  assert.match(photo.image_url, /\.heic$/);
  assert.match(photo.download_url, /\/photo-downloads\/.+\.jpg$/);
  const metadata = calls.find(([name]) => name === "metadata")[1];
  assert.ok(metadata.photoPageUrl.endsWith(`/photo/${photo.id}`));
  assert.ok(!/All rights reserved|CC BY|creativecommons/.test(metadata.copyright));
  assert.ok(!calls.some(([name]) => name === "remove"));
});

test("draft/external upload creates watermarked preview only and no download copy", async () => {
  const { calls, post } = draftHarness();
  assert.equal((await post(uploadPath, { publish_directly: false, watermark_enabled: false })).status, 201);
  assert.ok(calls.some(([name]) => name === "process"));
  assert.ok(!calls.some(([name]) => name === "download-copy"));
  assert.ok(!calls.some(([name, bucket]) => name === "upload" && bucket === "photo-downloads"));
  const photo = calls.find(([name]) => name === "insert")[1];
  assert.equal(photo.status, "draft");
  assert.equal(photo.download_url, null);
  assert.equal(photo.watermark_enabled, false);
  assert.equal(photo.download_watermark_version, null);
});

test("draft forwards custom UTF-8 payload, respects opt-out, and rejects invalid/oversized payloads", async () => {
  // 1. Custom non-blank payload preserved verbatim
  const custom = "  Desa Padusan 🌿\nBaris 2\t ";
  {
    const { calls, post } = draftHarness();
    const res = await post(uploadPath, { watermark_enabled: true, watermark_payload: custom });
    assert.equal(res.status, 201);
    const processCall = calls.find(([name]) => name === "process");
    assert.equal(Buffer.from(processCall[1].invisibleWatermarkPayload).toString("utf8"), custom);
  }

  // 2. Blank payload resolves to default PADUSTOCK-IWM-v1
  {
    const { calls, post } = draftHarness();
    const res = await post(uploadPath, { watermark_enabled: true, watermark_payload: "  \n\t " });
    assert.equal(res.status, 201);
    const processCall = calls.find(([name]) => name === "process");
    assert.equal(Buffer.from(processCall[1].invisibleWatermarkPayload).toString("utf8"), "PADUSTOCK-IWM-v1");
  }

  // 3. Opt-out skips invisible watermark embedding
  {
    const { calls, post } = draftHarness();
    const res = await post(uploadPath, { watermark_enabled: false });
    assert.equal(res.status, 201);
    const processCall = calls.find(([name]) => name === "process");
    assert.equal(processCall[1].invisibleWatermarkPayload, null);
  }

  // 4. Invalid types or > 512 UTF-8 bytes reject with 400 before downloading or uploading
  for (const badFields of [
    { watermark_enabled: "false" },
    { watermark_enabled: true, watermark_payload: 123 },
    { watermark_enabled: true, watermark_payload: "a".repeat(513) },
    { watermark_enabled: true, watermark_payload: "🌿".repeat(129) },
  ]) {
    const { calls, post } = draftHarness();
    const res = await post(uploadPath, badFields);
    assert.equal(res.status, 400);
    assert.ok(!calls.some(([name]) => name === "download" || name === "process" || name === "upload" || name === "move"));
    assert.ok(calls.some(([name, bucket]) => name === "remove" && bucket === "photo-uploads"));
  }

  // 5. Image too small / capacity exceeded maps to 422 and cleans up staging without permanent objects
  for (const failure of ["watermark-too-small", "watermark-capacity"]) {
    const { calls, post } = draftHarness(failure);
    const res = await post(uploadPath, { watermark_enabled: true, watermark_payload: "PADUSTOCK-IWM-v1" });
    assert.equal(res.status, 422);
    assert.ok(!calls.some(([name]) => name === "upload" || name === "move"));
    assert.ok(calls.some(([name, bucket]) => name === "remove" && bucket === "photo-uploads"));
  }
});

for (const storageFailure of [false, true]) {
  test(`delete ${storageFailure ? "keeps the database row on storage error" : "removes originals, download copy, and thumbnails before the row"}`, async () => {
    const calls = [];
    const supabase = {
      auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
      from: () => ({ select() { return this; }, eq() { return this; }, delete() { calls.push("delete-row"); return this; }, single: async () => ({ data: { id: "photo", image_url: `https://example.test/storage/v1/object/public/originals/${userId}/original.heic`, download_url: `https://example.test/storage/v1/object/public/photo-downloads/${userId}/download.jpg`, thumbnail_url: `https://example.test/storage/v1/object/public/thumbnails/${userId}/preview.jpg` }, error: null }) }),
      storage: { from: bucket => ({ remove: async () => { calls.push(bucket); return { error: storageFailure ? new Error("Storage unavailable") : null }; } }) },
    };
    const route = loadTs("src/app/api/photos/[id]/route.ts", { "@/lib/supabase/server": { createClient: async () => supabase } });
    const response = await route.DELETE(new Request("http://localhost/api/photos/photo", { method: "DELETE" }), { params: Promise.resolve({ id: "photo" }) });
    assert.equal(response.status, storageFailure ? 500 : 200);
    assert.deepEqual(calls, storageFailure ? ["originals"] : ["originals", "photo-downloads", "thumbnails", "delete-row"]);
  });
}

test("free downloads redirect to photo-downloads signed URL and never expose private originals", async () => {
  let signed;
  const admin = {
    from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { download_url: `https://example.test/storage/v1/object/public/photo-downloads/${userId}/download_photo.jpg`, microstock_url: null } }) }),
    storage: { from: bucket => ({ createSignedUrl: async (path, seconds, options) => { signed = { bucket, path, seconds, options }; return { data: { signedUrl: "https://example.test/download" }, error: null }; } }) },
  };
  const route = loadTs("src/app/api/photos/download/[id]/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { id: "photo", user_id: userId, caption_id: "Sawah", microstock_url: null }, error: null }) }) }) },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
  });
  const response = await route.GET(new Request("http://localhost"), { params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }) });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://example.test/download");
  assert.equal(signed.bucket, "photo-downloads");
  assert.equal(signed.options.download, "sawah-padustock.jpg");
  assert.equal(response.headers.get("cache-control"), "no-store");

  // Missing download_url must return 404 rather than falling back to private originals
  const missingAdmin = {
    from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { download_url: null, microstock_url: null } }) }),
    storage: { from: () => { throw new Error("Must not sign private originals"); } },
  };
  const missingRoute = loadTs("src/app/api/photos/download/[id]/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { id: "photo", user_id: userId, caption_id: "Sawah", microstock_url: null }, error: null }) }) }) },
    "@/lib/supabase/admin": { createAdminClient: () => missingAdmin },
  });
  assert.equal((await missingRoute.GET(new Request("http://localhost"), { params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }) })).status, 404);
});

test("new upload prepares/encrypts payload bytes once and embeds identical opaque bytes in both preview and free-download copy", async () => {
  let prepareCalls = 0;
  let previewBytes = null;
  let downloadBytes = null;
  const { LEGAL_DOCUMENTS } = loadTs("src/lib/legal-documents.ts");
  const route = loadTs("src/app/api/photos/draft/route.ts", {
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: {
                id: userId,
                app_metadata: {
                  legal_acknowledgment: {
                    terms_version: LEGAL_DOCUMENTS.terms.version,
                    privacy_version: LEGAL_DOCUMENTS.privacy.version,
                    accepted_at: "2026-11-24T00:00:00Z",
                  },
                },
              },
            },
            error: null,
          }),
        },
        from: table => table === "profiles"
          ? { select() { return this; }, eq() { return this; }, single: async () => ({ data: { display_name: "uji" } }) }
          : { insert: () => ({ select() { return this; }, single: async () => ({ data: { id: "photo-once" }, error: null }) }) },
        storage: {
          from: bucket => ({
            info: async () => ({ data: { size: 120 }, error: null }),
            download: async () => ({ data: new Blob(["raw"]), error: null }),
            upload: async () => ({ error: null }),
            getPublicUrl: p => ({ data: { publicUrl: `https://example.test/storage/v1/object/public/${bucket}/${p}` } }),
            remove: async () => ({ error: null }),
          }),
        },
      }),
    },
    "@/lib/supabase/admin": { createAdminClient: () => ({ storage: { from: () => ({ move: async () => ({ error: null }) }) } }) },
    "@/lib/server/watermark-bytes": {
      prepareWatermarkPayloadBytes: async () => {
        prepareCalls++;
        // Non-deterministic opaque bytes (simulating AES-GCM random nonce ciphertext)
        return { payloadBytes: new Uint8Array([0xde, 0xad, 0xbe, 0xef, prepareCalls, 0xff]), version: "iwm-v1-encrypted-test" };
      },
    },
    "@/lib/server/image-processing": {
      processImageForStorage: async (_raw, opts) => {
        previewBytes = opts.invisibleWatermarkPayload;
        return { watermarkedBuffer: Buffer.from("preview"), width: 1080, height: 720, contentType: "image/jpeg", extension: "jpg" };
      },
      createWatermarkedDownloadCopy: async (_raw, payload) => {
        downloadBytes = payload;
        return { downloadBuffer: Buffer.from("download"), width: 1600, height: 1000, contentType: "image/jpeg", extension: "jpg", jpegQuality: 92 };
      },
    },
    "@/lib/server/exif-writer": { embedMetadata: buffer => buffer },
  });
  const res = await route.POST(new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ path: uploadPath, caption_en: "Rice field", caption_id: "Sawah", tags_en: [], tags_id: [], publish_directly: true }),
  }));
  assert.equal(res.status, 201);
  assert.equal(prepareCalls, 1);
  assert.ok(previewBytes instanceof Uint8Array);
  assert.ok(downloadBytes instanceof Uint8Array);
  assert.deepEqual(Array.from(previewBytes), [0xde, 0xad, 0xbe, 0xef, 1, 0xff]);
  assert.deepEqual(Array.from(downloadBytes), Array.from(previewBytes));
});

test("PATCH /api/photos/[id] reuses preview payload bytes, regenerates safely when unreadable or opted out, enforces current terms, uses unique download paths, and rolls back safely", async () => {
  const makePatchHarness = ({ existingPhoto, userAppMetadata, previewWatermarkBytes = null, failure } = {}) => {
    const calls = [];
    const cache = new Map();
    const { WatermarkError, encodeWatermarkText } = loadTs("src/lib/watermark/core.ts", {}, cache);
    const { LEGAL_DOCUMENTS } = loadTs("src/lib/legal-documents.ts", {}, cache);
    const resolvedAppMetadata = userAppMetadata === undefined
      ? {
          legal_acknowledgment: {
            terms_version: LEGAL_DOCUMENTS.terms.version,
            privacy_version: LEGAL_DOCUMENTS.privacy.version,
            accepted_at: "2026-11-24T00:00:00Z",
          },
        }
      : userAppMetadata;
    const row = {
      id: "photo-1",
      user_id: userId,
      image_url: `https://example.test/storage/v1/object/public/originals/${userId}/original_photo-1.jpg`,
      thumbnail_url: `https://example.test/storage/v1/object/public/thumbnails/${userId}/old-thumb-photo-1.jpg`,
      download_url: null,
      watermark_enabled: true,
      download_watermark_version: null,
      status: "draft",
      microstock_url: null,
      ...existingPhoto,
    };
    const supabase = {
      auth: { getUser: async () => ({ data: { user: { id: userId, app_metadata: resolvedAppMetadata } }, error: null }) },
      from: table => {
        if (table === "profiles") {
          return {
            select() { return this; },
            eq() { return this; },
            single: async () => ({ data: { display_name: "fotografer", full_name: "Fotografer Uji" }, error: null }),
          };
        }
        if (table === "photo_license_history") {
          return {
            select() { return this; },
            in: async () => ({
              data: [{ photo_id: row.id, legacy_cc_possible: false, first_free_published_at: "2026-11-24T00:00:00Z" }],
              error: null,
            }),
          };
        }
        return {
          select() { return this; },
          eq() { return this; },
          update(fields) { calls.push(["update", fields]); return this; },
          single: async () => {
            const lastUpdate = calls.findLast(([name]) => name === "update");
            if (lastUpdate) {
              if (failure === "db") return { data: null, error: new Error("DB error") };
              return { data: { ...row, ...lastUpdate[1] }, error: null };
            }
            return { data: row, error: null };
          },
        };
      },
      storage: {
        from: bucket => ({
          info: async p => { calls.push(["info", bucket, p]); return { data: { size: 120 }, error: null }; },
          download: async p => { calls.push(["download", bucket, p]); return { data: new Blob([bucket === "thumbnails" ? "thumb-bytes" : "orig-bytes"]), error: null }; },
          upload: async p => { calls.push(["upload", bucket, p]); return { error: failure === "upload" ? new Error("Upload failed") : null }; },
          getPublicUrl: p => ({ data: { publicUrl: `https://example.test/storage/v1/object/public/${bucket}/${p}` } }),
          remove: async paths => { calls.push(["remove", bucket, paths]); return { error: null }; },
        }),
      },
    };
    const admin = {
      auth: {
        admin: {
          updateUserById: async (uid, attrs) => {
            calls.push(["admin-update-user", uid, attrs]);
            return { data: { user: { id: uid, ...attrs } }, error: null };
          },
        },
      },
    };
    let preparedCount = 0;
    const route = loadTs("src/app/api/photos/[id]/route.ts", {
      "@/lib/supabase/server": { createClient: async () => supabase },
      "@/lib/supabase/admin": { createAdminClient: () => admin },
      "@/lib/server/exif-writer": { embedMetadata: buffer => buffer },
      "@/lib/server/watermark-bytes": {
        prepareWatermarkPayloadBytes: async () => {
          preparedCount++;
          return { payloadBytes: encodeWatermarkText(`REGEN-ONCE-${preparedCount}`), version: "iwm-v1-placeholder" };
        },
      },
      "@/lib/watermark/core": {
        WatermarkError,
        extractWatermark: async () => {
          calls.push(["extract-preview"]);
          if (!previewWatermarkBytes) throw new WatermarkError("NO_WATERMARK", "Tidak ditemukan.");
          return { payload: previewWatermarkBytes, profile: 1, version: 1 };
        },
      },
      "@/lib/server/image-processing": {
        processImageForStorage: async (_raw, opts) => {
          calls.push(["regen-preview", opts.invisibleWatermarkPayload]);
          return { watermarkedBuffer: Buffer.from("new-preview"), width: 1080, height: 720, contentType: "image/jpeg", extension: "jpg" };
        },
        createWatermarkedDownloadCopy: async (_raw, payload) => {
          calls.push(["download-copy", payload]);
          if (failure === "capacity") throw new WatermarkError("CAPACITY_EXCEEDED", "Kapasitas tidak cukup.");
          return { downloadBuffer: Buffer.from("dl-jpeg"), width: 1600, height: 1000, contentType: "image/jpeg", extension: "jpg", jpegQuality: 92 };
        },
      },
    }, cache);
    const patch = body =>
      route.PATCH(
        new Request("http://localhost/api/photos/photo-1", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            caption_id: "Sawah",
            caption_en: "Field",
            tags_id: ["sawah"],
            tags_en: ["field"],
            microstock_url: null,
            status: "published",
            ...body,
          }),
        }),
        { params: Promise.resolve({ id: "photo-1" }) }
      );
    return { calls, patch, LEGAL_DOCUMENTS, getPreparedCount: () => preparedCount };
  };

  // 1. Draft with watermark_enabled: true -> reuses exact opaque payload bytes from existing preview without touching thumbnail
  {
    const opaquePreviewBytes = new Uint8Array([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x99]);
    const { calls, patch, getPreparedCount } = makePatchHarness({
      existingPhoto: { watermark_enabled: true },
      previewWatermarkBytes: opaquePreviewBytes,
    });
    const res = await patch({});
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.status, "published");
    assert.equal(body.data.download_watermark_version, "iwm-v1-placeholder");
    assert.equal(body.data.license_history.first_free_published_at, "2026-11-24T00:00:00Z");
    assert.equal(getPreparedCount(), 0);
    assert.ok(!calls.some(([name]) => name === "regen-preview"));
    const dlCall = calls.find(([name]) => name === "download-copy");
    assert.deepEqual(Array.from(dlCall[1]), Array.from(opaquePreviewBytes));
  }

  // 2. Draft whose existing preview has no readable watermark -> prepares ONE payload & regenerates BOTH preview + download copy, removes superseded old thumbnail
  {
    const { calls, patch, getPreparedCount } = makePatchHarness({
      existingPhoto: { watermark_enabled: true },
      previewWatermarkBytes: null,
    });
    const res = await patch({});
    assert.equal(res.status, 200);
    assert.equal(getPreparedCount(), 1);
    const previewCall = calls.find(([name]) => name === "regen-preview");
    const dlCall = calls.find(([name]) => name === "download-copy");
    assert.ok(previewCall && dlCall);
    assert.deepEqual(Array.from(previewCall[1]), Array.from(dlCall[1]));
    assert.ok(calls.some(([name, bucket, paths]) => name === "remove" && bucket === "thumbnails" && paths[0].includes("old-thumb-photo-1.jpg")));
  }

  // 3. Draft with watermark_enabled: false -> preserves opt-out even if body sends watermark_enabled: true
  {
    const { calls, patch } = makePatchHarness({ existingPhoto: { watermark_enabled: false } });
    const res = await patch({ watermark_enabled: true });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.download_watermark_version, "none");
    assert.equal(body.data.watermark_enabled, false);
    const dlCall = calls.find(([name]) => name === "download-copy");
    assert.equal(dlCall[1], null);
  }

  // 4. Legacy draft with watermark_enabled: null -> rejected with 409 when unconfirmed
  {
    const { calls, patch } = makePatchHarness({ existingPhoto: { watermark_enabled: null } });
    const res = await patch({});
    assert.equal(res.status, 409);
    assert.ok(!calls.some(([name]) => name === "download-copy" || name === "upload" || name === "update"));
  }

  // 5. Legacy draft with watermark_enabled: null + owner picks true, but only has old terms-2 -> rejected with 409
  {
    const { calls, patch } = makePatchHarness({
      existingPhoto: { watermark_enabled: null },
      userAppMetadata: { legal_acknowledgment: { terms_version: "terms-2", privacy_version: "privacy-2", accepted_at: "2026-10-29T00:00:00Z" } },
    });
    const res = await patch({ watermark_enabled: true });
    assert.equal(res.status, 409);
    assert.ok(!calls.some(([name]) => name === "download-copy" || name === "upload" || name === "update"));
  }

  // 6. Legacy draft with watermark_enabled: null + explicit owner confirmation & current terms-3 legalAcknowledgment -> succeeds, records app_metadata, regenerates both copies from one payload
  {
    const { calls, patch, LEGAL_DOCUMENTS, getPreparedCount } = makePatchHarness({
      existingPhoto: { watermark_enabled: null },
      userAppMetadata: { existing_flag: true },
      previewWatermarkBytes: null,
    });
    const res = await patch({
      watermark_enabled: true,
      legalAcknowledgment: {
        accepted: true,
        termsVersion: LEGAL_DOCUMENTS.terms.version,
        privacyVersion: LEGAL_DOCUMENTS.privacy.version,
      },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.watermark_enabled, true);
    assert.equal(body.data.has_accepted_current_terms, true);
    assert.equal(getPreparedCount(), 1);
    const adminCall = calls.find(([name]) => name === "admin-update-user");
    assert.ok(adminCall);
    assert.equal(adminCall[2].app_metadata.existing_flag, true);
    assert.equal(adminCall[2].app_metadata.legal_acknowledgment.terms_version, LEGAL_DOCUMENTS.terms.version);
    assert.equal(adminCall[2].app_metadata.legal_acknowledgment.privacy_version, LEGAL_DOCUMENTS.privacy.version);
  }

  // 7. Draft published with external microstock_url -> no download copy created
  {
    const { calls, patch } = makePatchHarness({ existingPhoto: { watermark_enabled: null } });
    const res = await patch({ microstock_url: "https://provider.example/photo" });
    assert.equal(res.status, 200);
    assert.ok(!calls.some(([name]) => name === "download-copy" || name === "upload"));
  }

  // 8. Already-free photo with existing download_url -> preserves existing download_url without regenerating
  {
    const existingUrl = `https://example.test/storage/v1/object/public/photo-downloads/${userId}/download_photo-1.jpg`;
    const { calls, patch } = makePatchHarness({
      existingPhoto: { status: "published", download_url: existingUrl, watermark_enabled: true, download_watermark_version: "iwm-v1-placeholder" },
    });
    const res = await patch({});
    assert.equal(res.status, 200);
    assert.ok(!calls.some(([name]) => name === "download-copy" || name === "upload"));
  }

  // 9. Capacity failure rejects with 422 without publishing or uploading
  {
    const { calls, patch } = makePatchHarness({ existingPhoto: { watermark_enabled: true }, failure: "capacity" });
    const res = await patch({});
    assert.equal(res.status, 422);
    assert.ok(!calls.some(([name]) => name === "upload" || name === "update"));
  }

  // 10. DB failure rolls back newly uploaded thumbnail and photo-downloads objects
  {
    const { calls, patch } = makePatchHarness({ existingPhoto: { watermark_enabled: true }, previewWatermarkBytes: null, failure: "db" });
    const res = await patch({});
    assert.equal(res.status, 500);
    assert.ok(calls.some(([name, bucket]) => name === "remove" && bucket === "photo-downloads"));
    assert.ok(calls.some(([name, bucket]) => name === "remove" && bucket === "thumbnails"));
  }

  // 11. Current terms AND privacy acceptance is enforced even when watermark_enabled was already saved earlier (prevents two-step bypass and stale privacy-2)
  for (const preset of [true, false]) {
    for (const staleAck of [
      { terms_version: "terms-2", privacy_version: "privacy-2", accepted_at: "2026-10-29T00:00:00Z" },
      { terms_version: "terms-3", privacy_version: "privacy-2", accepted_at: "2026-11-24T00:00:00Z" },
    ]) {
      const { calls, patch } = makePatchHarness({
        existingPhoto: { watermark_enabled: preset },
        userAppMetadata: { legal_acknowledgment: staleAck },
      });
      const res = await patch({});
      assert.equal(res.status, 409);
      assert.ok(!calls.some(([name]) => name === "download-copy" || name === "upload" || name === "update"));
    }
  }

  // 12. Concurrent publish protection: unique download path per attempt and failed upload does NOT delete other requests' path
  {
    const first = makePatchHarness({ existingPhoto: { watermark_enabled: true }, previewWatermarkBytes: new Uint8Array([1, 2, 3]) });
    const second = makePatchHarness({ existingPhoto: { watermark_enabled: true }, previewWatermarkBytes: new Uint8Array([1, 2, 3]) });
    assert.equal((await first.patch({})).status, 200);
    assert.equal((await second.patch({})).status, 200);
    const firstPath = first.calls.find(([name, bucket]) => name === "upload" && bucket === "photo-downloads")[2];
    const secondPath = second.calls.find(([name, bucket]) => name === "upload" && bucket === "photo-downloads")[2];
    assert.match(firstPath, /download_photo-1_[0-9a-f]{8}\.jpg$/);
    assert.match(secondPath, /download_photo-1_[0-9a-f]{8}\.jpg$/);
    assert.notEqual(firstPath, secondPath);

    const failedUpload = makePatchHarness({
      existingPhoto: { watermark_enabled: true },
      previewWatermarkBytes: new Uint8Array([1, 2, 3]),
      failure: "upload",
    });
    assert.equal((await failedUpload.patch({})).status, 502);
    assert.ok(!failedUpload.calls.some(([name, bucket]) => name === "remove" && bucket === "photo-downloads"));
  }
});

test("editing a published free photo sends PATCH /api/photos/[id] preserving public status and null purchase URL", async t => {
  let sent;
  t.mock.method(global, "fetch", async (url, init) => {
    sent = { url, method: init?.method, body: JSON.parse(init?.body) };
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: "photo",
          status: "published",
          watermark_enabled: true,
          license_history: { photo_id: "photo", legacy_cc_possible: false, first_free_published_at: "2026-10-29T00:00:00Z" },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
  const component = loadTs("src/components/dashboard/EditPhotoForm.tsx", {
    react: { useState: initial => [initial, () => {}] },
    "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }) },
  }).default;
  const tree = component({
    photo: {
      id: "photo",
      user_id: userId,
      status: "published",
      caption_id: "Sawah",
      caption_en: "Field",
      tags_id: [],
      tags_en: [],
      microstock_url: null,
      thumbnail_url: null,
      watermark_enabled: true,
    },
    hasAcceptedCurrentTerms: true,
  });
  function nodes(value) {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== "object") return [value];
    return [value, ...nodes(value.props?.children)];
  }
  const all = nodes(tree);
  assert.ok(all.includes("PUBLIK"));
  assert.ok(!all.some(node => node?.props?.["data-testid"] === "legacy-watermark-confirmation"));
  const publish = all.find(node => node?.type === "button" && node.props.children === "Publikasikan");
  assert.ok(publish);
  await publish.props.onClick();
  assert.equal(sent.url, "/api/photos/photo");
  assert.equal(sent.method, "PATCH");
  assert.equal(sent.body.status, "published");
  assert.equal(sent.body.microstock_url, null);
});

test("EditPhotoForm shows unchecked legacy owner confirmation + terms radio without pre-selecting yes and blocks free publish until confirmed", async t => {
  let fetchCalled = false;
  t.mock.method(global, "fetch", async () => {
    fetchCalled = true;
    throw new Error("Should not fetch before legacy owner confirms");
  });
  const component = loadTs("src/components/dashboard/EditPhotoForm.tsx", {
    react: { useState: initial => [initial, () => {}] },
    "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }) },
  }).default;
  const tree = component({
    photo: {
      id: "legacy-photo",
      user_id: userId,
      status: "draft",
      caption_id: "Sawah Lama",
      caption_en: "Old Field",
      tags_id: [],
      tags_en: [],
      microstock_url: null,
      thumbnail_url: null,
      watermark_enabled: null,
    },
    hasAcceptedCurrentTerms: false,
  });
  function nodes(value) {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== "object") return [value];
    return [value, ...nodes(value.props?.children)];
  }
  const all = nodes(tree);
  assert.ok(all.some(node => node?.props?.["data-testid"] === "legacy-watermark-confirmation"));
  const radios = all.filter(node => node?.type === "input" && node.props.type === "radio");
  assert.equal(radios.length, 4); // 2 watermark preference + 2 terms confirmation
  assert.ok(radios.every(radio => radio.props.checked === false));
  assert.equal(all.filter(node => node?.type === "input" && node.props.type === "checkbox").length, 0);
  const publish = all.find(node => node?.type === "button" && node.props.children === "Publikasikan");
  await publish.props.onClick();
  assert.equal(fetchCalled, false);
});

test("real JPEG draft->free PATCH extracts custom payload bytes from saved preview and embeds exact same bytes into full-resolution download copy", async () => {
  const sharp = require("sharp");
  const cache = new Map();
  const { processImageForStorage } = loadTs("src/lib/server/image-processing.ts", {}, cache);
  const { embedMetadata } = loadTs("src/lib/server/exif-writer.ts", {}, cache);
  const { encodeWatermarkText, extractWatermarkText } = loadTs("src/lib/watermark/core.ts", {}, cache);

  // Create a textured 800x600 JPEG source
  const width = 800;
  const height = 600;
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = (y * width + x) * 3;
      rgb[off] = (x * 13 + y * 5) & 255;
      rgb[off + 1] = (x * 7 + y * 11) & 255;
      rgb[off + 2] = (x * 3 + y * 17) & 255;
    }
  }
  const sourceJpeg = await sharp(rgb, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();

  // Simulate draft creation with a custom transient payload (NOT stored in DB)
  const customPayload = "DRAFT-CUSTOM-PAYLOAD-42";
  const { watermarkedBuffer } = await processImageForStorage(sourceJpeg, {
    invisibleWatermarkPayload: encodeWatermarkText(customPayload),
  });
  const savedPreview = embedMetadata(watermarkedBuffer, {
    caption: "Field | Sawah",
    tags: ["padusan"],
    artist: "Fotografer Uji",
    copyright: "© 2026 Fotografer Uji",
    software: "Padustock",
    photoPageUrl: "https://padustock.vercel.app/photo/photo-real",
  });

  let uploadedDownloadBuffer = null;
  const { LEGAL_DOCUMENTS } = loadTs("src/lib/legal-documents.ts", {}, cache);
  const supabase = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: userId,
            app_metadata: {
              legal_acknowledgment: {
                terms_version: LEGAL_DOCUMENTS.terms.version,
                privacy_version: LEGAL_DOCUMENTS.privacy.version,
                accepted_at: "2026-11-24T00:00:00Z",
              },
            },
          },
        },
        error: null,
      }),
    },
    from: table => {
      if (table === "photo_license_history") {
        return { select() { return this; }, in: async () => ({ data: [], error: null }) };
      }
      return {
        select() { return this; },
        eq() { return this; },
        update(fields) { this._fields = fields; return this; },
        single: async function () {
          if (this._fields) return { data: { id: "photo-real", status: "published", ...this._fields }, error: null };
          return {
            data: {
              id: "photo-real",
              user_id: userId,
              image_url: `https://example.test/storage/v1/object/public/originals/${userId}/orig.jpg`,
              thumbnail_url: `https://example.test/storage/v1/object/public/thumbnails/${userId}/draft-preview.jpg`,
              download_url: null,
              watermark_enabled: true,
              download_watermark_version: null,
              status: "draft",
              microstock_url: null,
            },
            error: null,
          };
        },
      };
    },
    storage: {
      from: bucket => ({
        info: async () => ({ data: { size: sourceJpeg.byteLength }, error: null }),
        download: async () => ({ data: new Blob([bucket === "thumbnails" ? savedPreview : sourceJpeg]), error: null }),
        upload: async (_p, buf) => {
          if (bucket === "photo-downloads") uploadedDownloadBuffer = Buffer.from(buf);
          return { error: null };
        },
        getPublicUrl: p => ({ data: { publicUrl: `https://example.test/storage/v1/object/public/${bucket}/${p}` } }),
        remove: async () => ({ error: null }),
      }),
    },
  };

  const route = loadTs("src/app/api/photos/[id]/route.ts", {
    "@/lib/supabase/server": { createClient: async () => supabase },
  }, cache);

  const res = await route.PATCH(
    new Request("http://localhost/api/photos/photo-real", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption_id: "Sawah",
        caption_en: "Field",
        tags_id: ["sawah"],
        tags_en: ["field"],
        microstock_url: null,
        status: "published",
      }),
    }),
    { params: Promise.resolve({ id: "photo-real" }) }
  );
  assert.equal(res.status, 200);
  assert.ok(uploadedDownloadBuffer);
  const extracted = await extractWatermarkText(uploadedDownloadBuffer);
  assert.equal(extracted.payload, customPayload);
});

test("real JPEG legacy opt-out via PATCH regenerates preview with visible watermark only so neither preview nor download copy has an invisible watermark", async () => {
  const sharp = require("sharp");
  const cache = new Map();
  const { processImageForStorage } = loadTs("src/lib/server/image-processing.ts", {}, cache);
  const { embedMetadata } = loadTs("src/lib/server/exif-writer.ts", {}, cache);
  const { encodeWatermarkText, extractWatermark, WatermarkError } = loadTs("src/lib/watermark/core.ts", {}, cache);
  const { LEGAL_DOCUMENTS } = loadTs("src/lib/legal-documents.ts", {}, cache);

  const width = 800;
  const height = 600;
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = (y * width + x) * 3;
      rgb[off] = (x * 11 + y * 7) & 255;
      rgb[off + 1] = (x * 5 + y * 13) & 255;
      rgb[off + 2] = (x * 3 + y * 19) & 255;
    }
  }
  const sourceJpeg = await sharp(rgb, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();

  // Existing preview ALREADY has an invisible watermark embedded
  const { watermarkedBuffer: oldPreviewRaw } = await processImageForStorage(sourceJpeg, {
    invisibleWatermarkPayload: encodeWatermarkText("LEGACY-HIDDEN-WM"),
  });
  const oldWatermarkedPreview = embedMetadata(oldPreviewRaw, {
    caption: "Field | Sawah",
    tags: ["padusan"],
    artist: "Fotografer Uji",
    copyright: "© 2026 Fotografer Uji",
    software: "Padustock",
    photoPageUrl: "https://padustock.vercel.app/photo/photo-optout",
  });
  // Sanity-check: old preview indeed carries the hidden watermark before opt-out
  assert.equal(Buffer.from((await extractWatermark(oldWatermarkedPreview)).payload).toString("utf8"), "LEGACY-HIDDEN-WM");

  let uploadedPreviewBuffer = null;
  let uploadedDownloadBuffer = null;
  const removedThumbnails = [];
  const supabase = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: userId,
            app_metadata: {
              legal_acknowledgment: {
                terms_version: LEGAL_DOCUMENTS.terms.version,
                privacy_version: LEGAL_DOCUMENTS.privacy.version,
                accepted_at: "2026-11-24T00:00:00Z",
              },
            },
          },
        },
        error: null,
      }),
    },
    from: table => {
      if (table === "profiles") {
        return { select() { return this; }, eq() { return this; }, single: async () => ({ data: { display_name: "uji", full_name: "Fotografer Uji" }, error: null }) };
      }
      if (table === "photo_license_history") {
        return { select() { return this; }, in: async () => ({ data: [], error: null }) };
      }
      return {
        select() { return this; },
        eq() { return this; },
        update(fields) { this._fields = fields; return this; },
        single: async function () {
          if (this._fields) return { data: { id: "photo-optout", status: "published", ...this._fields }, error: null };
          return {
            data: {
              id: "photo-optout",
              user_id: userId,
              image_url: `https://example.test/storage/v1/object/public/originals/${userId}/orig.jpg`,
              thumbnail_url: `https://example.test/storage/v1/object/public/thumbnails/${userId}/old-watermarked-preview.jpg`,
              download_url: null,
              watermark_enabled: null,
              download_watermark_version: null,
              status: "draft",
              microstock_url: null,
            },
            error: null,
          };
        },
      };
    },
    storage: {
      from: bucket => ({
        info: async () => ({ data: { size: sourceJpeg.byteLength }, error: null }),
        download: async () => ({ data: new Blob([bucket === "thumbnails" ? oldWatermarkedPreview : sourceJpeg]), error: null }),
        upload: async (_p, buf) => {
          if (bucket === "thumbnails") uploadedPreviewBuffer = Buffer.from(buf);
          if (bucket === "photo-downloads") uploadedDownloadBuffer = Buffer.from(buf);
          return { error: null };
        },
        getPublicUrl: p => ({ data: { publicUrl: `https://example.test/storage/v1/object/public/${bucket}/${p}` } }),
        remove: async paths => {
          if (bucket === "thumbnails") removedThumbnails.push(...paths);
          return { error: null };
        },
      }),
    },
  };

  const route = loadTs("src/app/api/photos/[id]/route.ts", {
    "@/lib/supabase/server": { createClient: async () => supabase },
  }, cache);

  const res = await route.PATCH(
    new Request("http://localhost/api/photos/photo-optout", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption_id: "Sawah",
        caption_en: "Field",
        tags_id: ["sawah"],
        tags_en: ["field"],
        microstock_url: null,
        status: "published",
        watermark_enabled: false,
      }),
    }),
    { params: Promise.resolve({ id: "photo-optout" }) }
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.watermark_enabled, false);
  assert.equal(body.data.download_watermark_version, "none");
  assert.ok(uploadedPreviewBuffer, "Opt-out on legacy photo must regenerate preview without invisible watermark");
  assert.ok(uploadedDownloadBuffer, "Opt-out publish must create unwatermarked download copy");
  assert.ok(removedThumbnails.some(p => p.includes("old-watermarked-preview.jpg")));

  // Neither the regenerated preview nor the download copy may contain an invisible watermark
  await assert.rejects(
    extractWatermark(uploadedPreviewBuffer),
    err => err instanceof WatermarkError && err.code === "NO_WATERMARK"
  );
  await assert.rejects(
    extractWatermark(uploadedDownloadBuffer),
    err => err instanceof WatermarkError && err.code === "NO_WATERMARK"
  );
});
