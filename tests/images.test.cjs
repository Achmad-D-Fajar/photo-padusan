const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const sharp = require("sharp");
const { loadTs } = require("./helpers/load-ts.cjs");
const moduleCache = new Map();
const { processImageForStorage, createWatermarkedDownloadCopy, DOWNLOAD_COPY_JPEG_QUALITY } = loadTs(
  "src/lib/server/image-processing.ts",
  {},
  moduleCache
);
const { embedMetadata } = loadTs("src/lib/server/exif-writer.ts", {}, moduleCache);
const { extractWatermark, extractWatermarkText, encodeWatermarkText, WatermarkError } = loadTs(
  "src/lib/watermark/core.ts",
  {},
  moduleCache
);

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

test("processImageForStorage embeds invisible watermark in preview and survives EXIF/IPTC metadata injection", async () => {
  const width = 1600;
  const height = 1000;
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = (y * width + x) * 3;
      rgb[off] = Math.min(255, Math.round(50 + (160 * x) / width + 16 * Math.sin(x / 19)));
      rgb[off + 1] = Math.min(255, Math.round(60 + (140 * y) / height + 16 * Math.cos(y / 23)));
      rgb[off + 2] = Math.min(255, Math.round(70 + (120 * (width - x)) / width));
    }
  }
  const input = await sharp(rgb, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
  const inputSnapshot = Buffer.from(input);

  // 1. Default and custom Indonesian/emoji/multiline payloads survive visible stamp + EXIF/IPTC
  for (const payloadText of ["PADUSTOCK-IWM-v1", "  Desa Padusan 🌿\nPreview #4\t "]) {
    const result = await processImageForStorage(input, {
      invisibleWatermarkPayload: encodeWatermarkText(payloadText),
    });
    assert.deepEqual([result.finalWidth, result.finalHeight], [1080, 675]);

    const withMetadata = embedMetadata(result.watermarkedBuffer, {
      caption: "Field | Sawah",
      tags: ["padusan"],
      artist: "Fotografer Desa",
      copyright: "© 2026 Fotografer Desa",
      software: "Padustock",
      photoPageUrl: "https://padustock.vercel.app/photo/test-id",
    });

    const extracted = await extractWatermarkText(withMetadata);
    assert.equal(extracted.payload, payloadText);
    assert.equal(extracted.byteLength, Buffer.byteLength(payloadText, "utf8"));
  }

  // Original input bytes remain untouched
  assert.deepEqual(input, inputSnapshot);

  // 2. Opt-out (null/omitted payload) creates a visible-watermarked preview with no invisible watermark
  const optOut = await processImageForStorage(input, { invisibleWatermarkPayload: null });
  await assert.rejects(
    extractWatermark(optOut.watermarkedBuffer),
    err => err instanceof WatermarkError && err.code === "NO_WATERMARK"
  );

  // 3. Too-small image rejects explicitly when invisible embedding is requested
  const tiny = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#44aa99" } })
    .jpeg()
    .toBuffer();
  await assert.rejects(
    processImageForStorage(tiny, { invisibleWatermarkPayload: encodeWatermarkText("PADUSTOCK-IWM-v1") }),
    err => err instanceof WatermarkError && err.code === "IMAGE_TOO_SMALL"
  );
});

test("createWatermarkedDownloadCopy preserves full oriented dimensions, has no visible watermark, embeds payload, and keeps source unchanged", async () => {
  const width = 1400;
  const height = 960;
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = (y * width + x) * 3;
      rgb[off] = Math.min(255, Math.round(40 + (170 * x) / width + 18 * Math.sin(x / 17)));
      rgb[off + 1] = Math.min(255, Math.round(50 + (155 * y) / height + 16 * Math.cos(y / 19)));
      rgb[off + 2] = Math.min(255, Math.round(60 + (135 * (width - x)) / width));
    }
  }

  // Use EXIF orientation 6 so full oriented dimensions become 960x1400
  const sourceJpeg = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const sourceSnapshot = Buffer.from(sourceJpeg);

  const payloadText = "  Desa Padusan 🌿\nUnduhan Penuh\t ";
  const download = await createWatermarkedDownloadCopy(sourceJpeg, encodeWatermarkText(payloadText));
  assert.deepEqual([download.width, download.height], [960, 1400]);
  assert.equal(download.contentType, "image/jpeg");
  assert.equal(download.extension, "jpg");
  assert.equal(download.jpegQuality, DOWNLOAD_COPY_JPEG_QUALITY);

  const meta = await sharp(download.downloadBuffer).metadata();
  assert.equal(meta.format, "jpeg");
  assert.deepEqual([meta.width, meta.height], [960, 1400]);
  assert.equal(meta.isProgressive, true);

  // Re-open and extract exact payload from full-resolution download copy
  const extracted = await extractWatermarkText(download.downloadBuffer);
  assert.equal(extracted.payload, payloadText);
  assert.equal(extracted.byteLength, Buffer.byteLength(payloadText, "utf8"));

  // Verify NO visible watermark was composited onto the full-resolution download copy
  const cleanFullRes = await sharp(sourceJpeg)
    .rotate()
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer();
  const downloadRgb = await sharp(download.downloadBuffer).toColourspace("srgb").removeAlpha().raw().toBuffer();
  let sumSq = 0;
  for (let i = 0; i < cleanFullRes.length; i++) {
    const diff = cleanFullRes[i] - downloadRgb[i];
    sumSq += diff * diff;
  }
  const psnrVsClean = 10 * Math.log10((255 * 255) / (sumSq / cleanFullRes.length));
  assert.ok(psnrVsClean >= 42, `Expected full-res download without visible stamp to stay >= 42 dB vs clean source, got ${psnrVsClean.toFixed(2)} dB`);

  // Source bytes remain unchanged
  assert.deepEqual(sourceJpeg, sourceSnapshot);

  // Opt-out produces full-resolution JPEG Q92 with no invisible watermark
  const optOut = await createWatermarkedDownloadCopy(sourceJpeg, null);
  assert.deepEqual([optOut.width, optOut.height], [960, 1400]);
  await assert.rejects(
    extractWatermark(optOut.downloadBuffer),
    err => err instanceof WatermarkError && err.code === "NO_WATERMARK"
  );

  // Too-small image rejects explicitly
  const tiny = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#44aa99" } })
    .jpeg()
    .toBuffer();
  await assert.rejects(
    createWatermarkedDownloadCopy(tiny, encodeWatermarkText("PADUSTOCK-IWM-v1")),
    err => err instanceof WatermarkError && err.code === "IMAGE_TOO_SMALL"
  );
});
