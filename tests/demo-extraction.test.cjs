const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadTs } = require("./helpers/load-ts.cjs");
const { DEMO_ATTRIBUTION, DEMO_EXTRACTION, resolveDemoExtraction, extractDemoPayload } = loadTs("src/lib/demo-extraction.ts");
const { demoDownloadFilename } = loadTs("src/lib/demo-download.ts");

test("ordinary supported names return configured text with a real UTF-8 byte count", () => {
  for (const name of ["foto.jpg", "foto.png", "kamera.heic", "pemandangan.avif"]) {
    const result = resolveDemoExtraction({ name });
    assert.equal(result.payload, DEMO_EXTRACTION.defaultPayload);
    assert.equal(result.byteLength, Buffer.byteLength(result.payload, "utf8"));
  }
});
test("both filename exceptions are case-insensitive and include the extension", () => {
  assert.deepEqual(resolveDemoExtraction({ name: DEMO_EXTRACTION.noWatermarkFilename }), { detected: false });
  assert.deepEqual(resolveDemoExtraction({ name: DEMO_EXTRACTION.noWatermarkFilename.toUpperCase() }), { detected: false });
  const result = resolveDemoExtraction({ name: DEMO_EXTRACTION.alternateFilename.toUpperCase() });
  assert.equal(result.payload, DEMO_EXTRACTION.alternatePayload);
  assert.equal(result.byteLength, Buffer.byteLength(result.payload));
  assert.equal(resolveDemoExtraction({ name: DEMO_EXTRACTION.noWatermarkFilename + ".png" }).payload, DEMO_EXTRACTION.defaultPayload);
});

test("scenario 2 returns the exact 445-byte custom payload", () => {
  assert.equal(Buffer.byteLength(DEMO_EXTRACTION.defaultPayload, "utf8"), 445);
  const result = resolveDemoExtraction({ name: "pemandangan-padusan-padustock.jpg" });
  assert.equal(result.payload, DEMO_EXTRACTION.defaultPayload);
  assert.equal(result.byteLength, 445);
  assert.ok(result.payload.startsWith("Lorem ipsum dolor sit amet, "));
  assert.ok(result.payload.endsWith("mollit anim id est laborum."));
});

test("scenario 1 uses fixed valid UUID examples for manually named files", () => {
  const result = resolveDemoExtraction({ name: "padustock-demo-padustock.jpg" });
  const data = JSON.parse(result.payload);
  assert.deepEqual(data, DEMO_ATTRIBUTION);
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(data.photo_id, uuidV4);
  assert.match(data.photographer_id, uuidV4);
  assert.equal(data.photographer_name, "Wafa");
  assert.equal(data.photo_url, `https://padustock.vercel.app/photo/${data.photo_id}`);
  assert.equal(result.byteLength, Buffer.byteLength(result.payload));
});

test("downloaded scenario-1 filenames carry the actual references into the JSON", () => {
  const photoId = "22222222-2222-4222-8222-222222222222";
  const photographerId = "11111111-1111-4111-8111-111111111111";
  for (const extension of ["jpg", "png", "heic", "avif"]) {
    const filename = demoDownloadFilename("padustock-demo", extension, photoId, photographerId);
    for (const name of [filename, filename.toUpperCase(), filename.replace(`.${extension}`, ` (1).${extension}`)]) {
      const result = resolveDemoExtraction({ name });
      assert.deepEqual(JSON.parse(result.payload), {
        v: 1, photo_id: photoId, photographer_id: photographerId, photographer_name: "Wafa",
        photo_url: `https://padustock.vercel.app/photo/${photoId}`,
      });
      assert.equal(result.byteLength, Buffer.byteLength(result.payload));
    }
  }
});

test("scenario 3 and repeat downloads work across original image formats", () => {
  for (const extension of ["jpg", "jpeg", "png", "webp", "gif", "avif", "tif", "tiff", "heic", "heif"]) {
    assert.equal(demoDownloadFilename("no-watermark", extension, "photo", "owner"), `no-watermark-padustock.${extension}`);
    for (const suffix of ["", " (1)", " (12)"]) {
      assert.deepEqual(resolveDemoExtraction({ name: `NO-WATERMARK-PADUSTOCK${suffix}.${extension.toUpperCase()}` }), { detected: false });
    }
  }
  assert.equal(resolveDemoExtraction({ name: "padustock-demo-invalid-uuid-padustock.jpg" }).payload, DEMO_EXTRACTION.defaultPayload);
  assert.equal(resolveDemoExtraction({ name: "unrelated-no-watermark-padustock.jpg" }).payload, DEMO_EXTRACTION.defaultPayload);
});

test("download filenames remain unchanged for other captions", () => {
  assert.equal(demoDownloadFilename("sawah-padusan", "heic", "photo", "owner"), "sawah-padusan-padustock.heic");
});
test("simulation leaves selected bytes unchanged and rejects unsupported file references", async () => {
  const bytes = Buffer.from([0, 1, 2, 3, 255]);
  const file = new File([bytes], "kamera.heic", { type: "" });
  const before = Buffer.from(await file.arrayBuffer());
  assert.equal((await extractDemoPayload(file)).payload, DEMO_EXTRACTION.defaultPayload);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), before);
  await assert.rejects(extractDemoPayload(new File([], "empty.jpg")), /kosong/);
  await assert.rejects(extractDemoPayload(new File(["x"], "bad.txt", { type: "text/plain" })), /Format/);
});
test("no-detection result has its own feedback and no copy action", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { default: Result } = loadTs("src/components/dashboard/ExtractionResult.tsx");
  const html = renderToStaticMarkup(React.createElement(Result, { state: { kind: "not-detected" } }));
  assert.match(html, /Watermark tidak terdeteksi/);
  assert.ok(!html.includes("Salin payload"));
});
