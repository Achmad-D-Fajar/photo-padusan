const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./helpers/load-ts.cjs");
const { readPhotoApiData, readPhotoPreview, storageUploadError } = loadTs("src/lib/photo-api.ts");

for (const [status, body, contentType] of [
  [404, "<!doctype html><h1>Not Found</h1>", "text/html"],
  [500, "An error occurred with your deployment", "text/plain"],
  [504, "FUNCTION_INVOCATION_TIMEOUT", "text/plain"],
  [200, "<!doctype html><h1>Login</h1>", "text/html"],
  [502, "", "application/json"],
  [502, '{"success":', "application/json"],
]) {
  test(`upload preparation handles ${status} ${contentType} without exposing parser errors`, async () => {
    const response = new Response(body, { status, headers: { "content-type": contentType } });
    await assert.rejects(readPhotoApiData(response, "Gagal menyiapkan unggahan."), error => {
      assert.ok(!(error instanceof SyntaxError));
      assert.match(error.message, /Gagal menyiapkan unggahan/);
      assert.ok(error.message.includes(`HTTP ${status}`));
      assert.ok(!error.message.includes("<!doctype"));
      return true;
    });
  });
}

test("server validation and session messages survive response handling", async () => {
  for (const [status, message] of [[401, "Silakan login kembali."], [413, "Ukuran file maksimal 50 MB."]]) {
    await assert.rejects(readPhotoApiData(Response.json({ success: false, error: message }, { status }), "Gagal menyiapkan unggahan."), error => error.message.includes(message));
  }
});

test("upload response must contain a successful data object", async () => {
  const ticket = { path: "user/image.jpeg", token: "test-token", contentType: "image/jpeg" };
  assert.deepEqual(await readPhotoApiData(Response.json({ success: true, data: ticket }), "Upload gagal."), ticket);
  for (const body of [null, [], {}, { success: true }, { success: true, data: null }]) {
    await assert.rejects(readPhotoApiData(Response.json(body), "Upload gagal."), /Upload gagal/);
  }
});

test("preview requires a nonempty JPEG response and preserves JSON errors", async () => {
  const image = await readPhotoPreview(new Response("jpeg bytes", { headers: { "content-type": "image/jpeg" } }));
  assert.equal(await image.text(), "jpeg bytes");
  await assert.rejects(readPhotoPreview(new Response("<!doctype html><h1>Login</h1>", { headers: { "content-type": "text/html" } })), /Gagal membuat pratinjau/);
  await assert.rejects(readPhotoPreview(new Response("", { headers: { "content-type": "image/jpeg" } })), /Gagal membuat pratinjau/);
  await assert.rejects(readPhotoPreview(Response.json({ success: false, error: "Gambar rusak." }, { status: 422 })), /Gambar rusak/);
});

test("storage SDK JSON failures receive a storage-specific message", () => {
  for (const message of ["JSON.parse: unexpected character at line 1 column 1 of the JSON data", "Unexpected token '<', not valid JSON", "Unexpected end of JSON input"]) {
    assert.match(storageUploadError(new Error(message)).message, /Server penyimpanan mengirim respons yang tidak valid/);
  }
  assert.match(storageUploadError(new Error("Bucket not found")).message, /Bucket not found/);
});

function fileInputHarness(storageUpload) {
  const updates = [];
  let nextState = 0;
  const component = loadTs("src/components/dashboard/UploadForm.tsx", {
    react: {
      useState: initial => {
        const index = nextState++;
        updates[index] = initial;
        return [initial, value => { updates[index] = value; }];
      },
      useRef: initial => ({ current: initial }),
      useEffect() {},
    },
    "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }) },
    "@/lib/supabase/client": { createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: storageUpload }) } }) },
  }).default;
  function findInput(node) {
    if (Array.isArray(node)) return node.map(findInput).find(Boolean);
    if (!node || typeof node !== "object") return undefined;
    return node.props?.id === "file-input" ? node : findInput(node.props?.children);
  }
  return { input: findInput(component()), updates };
}

test("selecting a JPEG reports the failed preview and cleans the uploaded object", async t => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push([url, options.method]);
    if (options.method === "DELETE") return Response.json({ success: true });
    if (url === "/api/photos/upload") return Response.json({ success: true, data: { path: "user/image.jpeg", token: "test-token", contentType: "image/jpeg" } });
    return new Response("An error occurred with your deployment", { status: 500, headers: { "content-type": "text/plain" } });
  });
  let uploaded;
  const { input, updates } = fileInputHarness(async (_path, _token, file) => { uploaded = file; return { error: null }; });
  const file = new File(["jpeg bytes"], "photo.jpeg", { type: "image/jpg" });
  await input.props.onChange({ target: { files: [file] } });
  assert.equal(uploaded.type, "image/jpeg");
  assert.equal(await uploaded.text(), await file.text());
  assert.match(updates[9], /Gagal membuat pratinjau gambar.*HTTP 500/);
  assert.equal(updates[2], null);
  assert.equal(updates[8], "compose");
  assert.deepEqual(requests, [["/api/photos/upload", "POST"], ["/api/photos/preview", "POST"], ["/api/photos/upload", "DELETE"]]);
});

test("selecting a JPEG handles a missing upload route before calling Storage", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("<!doctype html><h1>Not found</h1>", { status: 404, headers: { "content-type": "text/html" } }));
  const { input, updates } = fileInputHarness(() => assert.fail("Must not upload without a ticket"));
  await input.props.onChange({ target: { files: [new File(["jpeg bytes"], "photo.jpeg", { type: "image/jpeg" })] } });
  assert.match(updates[9], /Gagal menyiapkan unggahan.*HTTP 404/);
  assert.equal(updates[8], "compose");
});

test("selecting a JPEG retains the original and creates its preview on success", async t => {
  t.mock.method(globalThis, "fetch", async url => url === "/api/photos/upload"
    ? Response.json({ success: true, data: { path: "user/image.jpeg", token: "test-token", contentType: "image/jpeg" } })
    : new Response("jpeg preview", { headers: { "content-type": "image/jpeg" } }));
  const { input, updates } = fileInputHarness(async () => ({ error: null }));
  const file = new File(["original jpeg"], "photo.jpeg", { type: "image/jpeg" });
  await input.props.onChange({ target: { files: [file] } });
  assert.equal(updates[2], file);
  assert.match(updates[3], /^blob:/);
  assert.equal(updates[9], "");
  URL.revokeObjectURL(updates[3]);
});
