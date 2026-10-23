const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const sharp = require("sharp");
const { loadTs } = require("./helpers/load-ts.cjs");
const { processImageForStorage } = loadTs("src/lib/server/image-processing.ts");

for (const [width, height, orientation, expected] of [
  [1600, 900, 1, [1080, 608]],
  [1600, 900, 6, [608, 1080]],
  [4032, 3024, 6, [810, 1080]],
  [200, 200, 1, [200, 200]],
  [1080, 200, 1, [1080, 200]],
  [1, 1, 1, [1, 1]],
]) {
  test(`process ${width}x${height} orientation ${orientation}`, async () => {
    const input = await sharp({ create: { width, height, channels: 3, background: "#44aa99" } }).jpeg().withMetadata({ orientation }).toBuffer();
    const result = await processImageForStorage(input);
    const output = await sharp(result.watermarkedBuffer).metadata();
    assert.deepEqual([output.width, output.height], expected);
    assert.equal(output.format, "jpeg");
    assert.notDeepEqual(result.downscaledBuffer, result.watermarkedBuffer);
  });
}

test("reject non-image bytes and unsupported SVG", async () => {
  await assert.rejects(processImageForStorage(Buffer.from("not an image")), /Gambar rusak/);
  await assert.rejects(processImageForStorage(Buffer.from('<svg width="100" height="100"></svg>')), /Gambar rusak/);
});

test("decode a real HEIC sample", { skip: !process.env.HEIC_TEST_FILE }, async () => {
  const input = fs.readFileSync(process.env.HEIC_TEST_FILE);
  const result = await processImageForStorage(input);
  const output = await sharp(result.watermarkedBuffer).metadata();
  assert.equal(output.format, "jpeg");
  assert.ok(output.width > 0 && output.height > 0);
  assert.ok(Math.max(output.width, output.height) <= 1080);
});

test("HEIC with empty MIME type and 50 MB boundary are accepted", () => {
  const { validatePhotoFile, MAX_PHOTO_SIZE } = loadTs("src/lib/photo-upload.ts");
  assert.equal(validatePhotoFile({ name: "IMG_1234.HEIC", type: "", size: MAX_PHOTO_SIZE }), null);
  assert.match(validatePhotoFile({ name: "large.heic", type: "image/heic", size: MAX_PHOTO_SIZE + 1 }), /50 MB/);
  assert.match(validatePhotoFile({ name: "empty.jpg", type: "image/jpeg", size: 0 }), /kosong/);
});
