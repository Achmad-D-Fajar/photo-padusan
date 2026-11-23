const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { loadTs } = require("./helpers/load-ts.cjs");

const moduleCache = new Map();
const core = loadTs("src/lib/watermark/core.ts", {}, moduleCache);
const dct = loadTs("src/lib/watermark/dct.ts", {}, moduleCache);
const packetMod = loadTs("src/lib/watermark/packet.ts", {}, moduleCache);
const { WATERMARK_STAMP_BASE64, WATERMARK_STAMP_W, WATERMARK_STAMP_H } = loadTs(
  "src/lib/server/watermark-stamp.ts",
  {},
  moduleCache
);

// Deterministic photo-like textured RGB generator (smooth gradients + mid/high frequency variation)
function createTexturedRgb(width, height, seed = 42) {
  const rgb = Buffer.alloc(width * height * 3);
  let s = seed >>> 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const noise = ((s >>> 24) - 128) * 0.08;
      const r = 40 + (170 * x) / Math.max(1, width - 1) + 18 * Math.sin(x / 19) * Math.cos(y / 23) + noise;
      const g = 55 + (155 * y) / Math.max(1, height - 1) + 16 * Math.cos((x + y) / 29) + noise;
      const b = 60 + (140 * (width - x)) / Math.max(1, width) + 14 * Math.sin((x - y) / 17) + noise;
      const off = (y * width + x) * 3;
      rgb[off] = Math.min(255, Math.max(0, Math.round(r)));
      rgb[off + 1] = Math.min(255, Math.max(0, Math.round(g)));
      rgb[off + 2] = Math.min(255, Math.max(0, Math.round(b)));
    }
  }
  return rgb;
}

async function createTexturedJpeg(width, height, options = {}) {
  const rgb = createTexturedRgb(width, height, options.seed ?? 42);
  let pipeline = sharp(rgb, { raw: { width, height, channels: 3 } }).jpeg({ quality: options.quality ?? 95 });
  if (options.orientation) {
    pipeline = pipeline.withMetadata({ orientation: options.orientation });
  }
  return pipeline.toBuffer();
}

const SSIM_WINDOW_SIZE = 11;
const SSIM_RADIUS = 5;
const SSIM_SIGMA = 1.5;
const SSIM_DATA_RANGE = 255;
const SSIM_C1 = (0.01 * SSIM_DATA_RANGE) ** 2;
const SSIM_C2 = (0.03 * SSIM_DATA_RANGE) ** 2;

const GAUSSIAN_1D = (() => {
  const weights = new Float64Array(SSIM_WINDOW_SIZE);
  let sum = 0;
  for (let i = 0; i < SSIM_WINDOW_SIZE; i++) {
    const k = i - SSIM_RADIUS;
    const w = Math.exp(-(k * k) / (2 * SSIM_SIGMA * SSIM_SIGMA));
    weights[i] = w;
    sum += w;
  }
  for (let i = 0; i < SSIM_WINDOW_SIZE; i++) weights[i] /= sum;
  return weights;
})();

function convolveGaussianValid2D(plane, width, height) {
  const validW = width - SSIM_WINDOW_SIZE + 1;
  const validH = height - SSIM_WINDOW_SIZE + 1;
  const horiz = new Float64Array(height * validW);

  for (let y = 0; y < height; y++) {
    const srcRow = y * width;
    const dstRow = y * validW;
    for (let x = 0; x < validW; x++) {
      let sum = 0;
      for (let k = 0; k < SSIM_WINDOW_SIZE; k++) {
        sum += GAUSSIAN_1D[k] * plane[srcRow + x + k];
      }
      horiz[dstRow + x] = sum;
    }
  }

  const out = new Float64Array(validW * validH);
  for (let y = 0; y < validH; y++) {
    const dstRow = y * validW;
    for (let x = 0; x < validW; x++) {
      let sum = 0;
      for (let k = 0; k < SSIM_WINDOW_SIZE; k++) {
        sum += GAUSSIAN_1D[k] * horiz[(y + k) * validW + x];
      }
      out[dstRow + x] = sum;
    }
  }
  return out;
}

// Full-range BT.601 luminance Y PSNR and Wang et al. (2004) MSSIM:
// 11x11 Gaussian window (sigma=1.5), stride 1, valid-window averaging,
// population covariance, data_range=255 (C1=(0.01*255)^2, C2=(0.03*255)^2).
function computePsnrAndSsimY(rgbA, rgbB, width, height) {
  assert.ok(
    width >= SSIM_WINDOW_SIZE && height >= SSIM_WINDOW_SIZE,
    "Image dimensions must be at least 11x11 for 11x11 Gaussian SSIM"
  );
  const pixels = width * height;
  const yA = new Float64Array(pixels);
  const yB = new Float64Array(pixels);
  const yA2 = new Float64Array(pixels);
  const yB2 = new Float64Array(pixels);
  const yAB = new Float64Array(pixels);
  let mse = 0;

  for (let i = 0; i < pixels; i++) {
    const off = i * 3;
    const a = 0.299 * rgbA[off] + 0.587 * rgbA[off + 1] + 0.114 * rgbA[off + 2];
    const b = 0.299 * rgbB[off] + 0.587 * rgbB[off + 1] + 0.114 * rgbB[off + 2];
    yA[i] = a;
    yB[i] = b;
    yA2[i] = a * a;
    yB2[i] = b * b;
    yAB[i] = a * b;
    const diff = a - b;
    mse += diff * diff;
  }

  mse /= pixels;
  const psnr = mse === 0 ? Infinity : 10 * Math.log10((SSIM_DATA_RANGE * SSIM_DATA_RANGE) / mse);

  const muA = convolveGaussianValid2D(yA, width, height);
  const muB = convolveGaussianValid2D(yB, width, height);
  const muA2 = convolveGaussianValid2D(yA2, width, height);
  const muB2 = convolveGaussianValid2D(yB2, width, height);
  const muAB = convolveGaussianValid2D(yAB, width, height);

  let ssimSum = 0;
  for (let i = 0; i < muA.length; i++) {
    const a = muA[i];
    const b = muB[i];
    const aSq = a * a;
    const bSq = b * b;
    const ab = a * b;
    const varA = Math.max(0, muA2[i] - aSq);
    const varB = Math.max(0, muB2[i] - bSq);
    const covAB = muAB[i] - ab;
    ssimSum +=
      ((2 * ab + SSIM_C1) * (2 * covAB + SSIM_C2)) /
      ((aSq + bSq + SSIM_C1) * (varA + varB + SSIM_C2));
  }

  return { psnr, ssim: ssimSum / muA.length };
}

test("8x8 orthonormal DCT-II and IDCT-II reconstruct spatial blocks accurately", () => {
  const spatial = new Float64Array(64);
  for (let i = 0; i < 64; i++) {
    spatial[i] = ((i * 37) % 256) - 128;
  }
  const coeffs = dct.dct8x8(spatial);
  const reconstructed = dct.idct8x8(coeffs);

  for (let i = 0; i < 64; i++) {
    assert.ok(
      Math.abs(reconstructed[i] - spatial[i]) < 1e-10,
      `index ${i}: expected ${spatial[i]}, got ${reconstructed[i]}`
    );
  }

  // Parseval's theorem (energy conservation for orthonormal transform)
  let spatialEnergy = 0;
  let coeffEnergy = 0;
  for (let i = 0; i < 64; i++) {
    spatialEnergy += spatial[i] * spatial[i];
    coeffEnergy += coeffs[i] * coeffs[i];
  }
  assert.ok(Math.abs(spatialEnergy - coeffEnergy) < 1e-9);
});

test("BT.601 full-range RGB <-> YCbCr round-trips all corner and midtone colors", () => {
  const samples = [
    [0, 0, 0],
    [255, 255, 255],
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [123, 45, 210],
    [18, 200, 144],
  ];
  for (const [r, g, b] of samples) {
    const [y, cb, cr] = dct.rgbToYCbCr(r, g, b);
    const [r2, g2, b2] = dct.yCbCrToRgb(y, cb, cr);
    assert.deepEqual([r2, g2, b2], [r, g, b]);
  }
});

test("QIM encodes and decodes both bits across positive, zero, and negative differences", () => {
  const diffs = [-250, -144, -97, -96, -95, -50, -48, -24, -1, 0, 1, 23, 24, 48, 71, 96, 145, 310];
  for (const d of diffs) {
    for (const bit of [0, 1]) {
      const target = dct.quantizeQimDifference(d, bit);
      assert.equal(Math.abs(target % 48), 0);
      assert.equal(dct.extractQimBit(target), bit);
      // Verify nearest quantized lattice point with parity bit (distance <= Delta)
      assert.ok(Math.abs(target - d) <= 48 + 1e-9, `d=${d}, bit=${bit}, target=${target}`);
      // Verify resilience within +-23 around target
      assert.equal(dct.extractQimBit(target + 20), bit);
      assert.equal(dct.extractQimBit(target - 20), bit);
    }
  }

  // Test DCT block helper adjusts a and b symmetrically
  for (const [a0, b0, bit] of [
    [-120, 15, 0],
    [-120, 15, 1],
    [0, 0, 1],
    [33.5, -18.2, 0],
  ]) {
    const coeffs = new Float64Array(64);
    coeffs[dct.WATERMARK_COEFF_A_INDEX] = a0;
    coeffs[dct.WATERMARK_COEFF_B_INDEX] = b0;
    dct.embedBitInDctBlock(coeffs, bit);
    assert.equal(dct.extractBitFromDctBlock(coeffs), bit);
    assert.ok(
      Math.abs((coeffs[dct.WATERMARK_COEFF_A_INDEX] + coeffs[dct.WATERMARK_COEFF_B_INDEX]) - (a0 + b0)) < 1e-9
    );
  }
});

test("majorityVote3 resolves all 8 bit triplets accurately", () => {
  assert.equal(dct.majorityVote3(0, 0, 0), 0);
  assert.equal(dct.majorityVote3(0, 0, 1), 0);
  assert.equal(dct.majorityVote3(0, 1, 0), 0);
  assert.equal(dct.majorityVote3(1, 0, 0), 0);
  assert.equal(dct.majorityVote3(0, 1, 1), 1);
  assert.equal(dct.majorityVote3(1, 0, 1), 1);
  assert.equal(dct.majorityVote3(1, 1, 0), 1);
  assert.equal(dct.majorityVote3(1, 1, 1), 1);
});

test("xorshift32 and Fisher-Yates block permutation are deterministic and bijective", () => {
  // Verify exact first xorshift32 output from seed 0x50444957 with shifts 13, 17, 5
  let expected = 0x50444957 >>> 0;
  expected = (expected ^ (expected << 13)) >>> 0;
  expected = (expected ^ (expected >>> 17)) >>> 0;
  expected = (expected ^ (expected << 5)) >>> 0;
  assert.equal(packetMod.xorshift32Next(0x50444957), expected);

  const permA = packetMod.buildBlockPermutation(1200);
  const permB = packetMod.buildBlockPermutation(1200);
  assert.deepEqual(permA, permB);
  assert.equal(permA.length, 1200);
  assert.equal(new Set(permA).size, 1200);
});

test("capacity formula handles normal, capped, boundary, tiny, panorama, and invalid sizes", () => {
  // 1080x720 -> 135*90 = 12150 blocks -> floor(12150/24) - 40 = 506 - 40 = 466
  assert.equal(core.getWatermarkCapacity(1080, 720), 466);
  // 1080x1080 -> 135*135 = 18225 blocks -> min(512, floor(18225/24) - 40) = 512
  assert.equal(core.getWatermarkCapacity(1080, 1080), 512);
  // 320x320 -> 40*40 = 1600 blocks -> floor(1600/24) - 40 = 66 - 40 = 26
  assert.equal(core.getWatermarkCapacity(320, 320), 26);
  // 240x256 -> 30*32 = 960 blocks -> floor(960/24) - 40 = 0, canEmbedEmptyPayload = true
  const exactZero = core.getWatermarkCapacityDetails(240, 256);
  assert.equal(exactZero.payloadCapacityBytes, 0);
  assert.equal(exactZero.canEmbedEmptyPayload, true);
  // 232x256 -> 29*32 = 928 blocks -> < 960, canEmbedEmptyPayload = false
  const tooSmall = core.getWatermarkCapacityDetails(232, 256);
  assert.equal(tooSmall.payloadCapacityBytes, 0);
  assert.equal(tooSmall.canEmbedEmptyPayload, false);
  // Panorama 1080x200 -> 135*25 = 3375 -> floor(3375/24) - 40 = 140 - 40 = 100
  assert.equal(core.getWatermarkCapacity(1080, 200), 100);
  // Invalid / tiny
  assert.equal(core.getWatermarkCapacity(16, 16), 0);
  assert.equal(core.getWatermarkCapacity(0, 100), 0);
  assert.equal(core.getWatermarkCapacity(-100, 100), 0);
  assert.equal(core.getWatermarkCapacity(Number.NaN, 100), 0);
});

test("packet encoding uses PDIW magic, version 1, profile 1, big-endian length, and SHA-256", () => {
  const payload = Buffer.from("PADUSTOCK-IWM-v1", "utf8");
  const packet = packetMod.encodePacket(payload);
  assert.equal(packet.byteLength, 40 + payload.byteLength);
  assert.equal(Buffer.from(packet.subarray(0, 4)).toString("ascii"), "PDIW");
  assert.equal(packet[4], 1);
  assert.equal(packet[5], 1);
  assert.equal((packet[6] << 8) | packet[7], 16);
  assert.deepEqual(Buffer.from(packet.subarray(8, 24)), payload);
  const expectedDigest = crypto.createHash("sha256").update(packet.subarray(0, 24)).digest();
  assert.deepEqual(Buffer.from(packet.subarray(24, 56)), expectedDigest);
});

test("end-to-end JPEG Q80 recovery preserves default, Indonesian, emoji, multiline, whitespace, empty, and binary payloads", async () => {
  const input = await createTexturedJpeg(1080, 720);

  const textCases = [
    "PADUSTOCK-IWM-v1",
    "Desa Padusan, Mojokerto — Jawa Timur",
    "Alam Padusan 🌿📸⛰️✨",
    "Baris pertama\nBaris kedua\r\n  dengan spasi & tab\t ",
    "",
  ];

  for (const text of textCases) {
    const embedded = await core.embedWatermarkText(input, text);
    const meta = await sharp(embedded).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 720);
    assert.equal(meta.isProgressive, true);

    const extracted = await core.extractWatermarkText(embedded);
    assert.equal(extracted.payload, text);
    assert.equal(extracted.byteLength, Buffer.byteLength(text, "utf8"));
    assert.equal(extracted.version, 1);
    assert.equal(extracted.profile, 1);
  }

  // Opaque binary bytes (all 256 byte values)
  const binary = new Uint8Array(256);
  for (let i = 0; i < 256; i++) binary[i] = i;
  const embeddedBin = await core.embedWatermark(input, binary);
  const extractedBin = await core.extractWatermark(embeddedBin);
  assert.deepEqual(extractedBin.payload, binary);
  assert.equal(extractedBin.byteLength, 256);
});

test("orientation normalization, PNG transparency flattening, and partial edge preservation", async () => {
  // EXIF orientation 6 rotates 800x600 -> 600x800
  const rotatedInput = await createTexturedJpeg(800, 600, { orientation: 6 });
  const embeddedRotated = await core.embedWatermarkText(rotatedInput, "orientasi-6");
  const rotatedMeta = await sharp(embeddedRotated).metadata();
  assert.deepEqual([rotatedMeta.width, rotatedMeta.height], [600, 800]);
  const extractedRotated = await core.extractWatermarkText(embeddedRotated);
  assert.equal(extractedRotated.payload, "orientasi-6");

  // PNG with alpha channel (flattened on white) and non-multiple-of-8 dimensions
  const width = 645;
  const height = 483;
  const rgba = Buffer.alloc(width * height * 4);
  const baseRgb = createTexturedRgb(width, height, 99);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = baseRgb[i * 3];
    rgba[i * 4 + 1] = baseRgb[i * 3 + 1];
    rgba[i * 4 + 2] = baseRgb[i * 3 + 2];
    rgba[i * 4 + 3] = i % 5 === 0 ? 128 : 255;
  }
  const pngInput = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const embeddedPng = await core.embedWatermarkText(pngInput, "png-transparan-645x483");
  const pngMeta = await sharp(embeddedPng).metadata();
  assert.deepEqual([pngMeta.width, pngMeta.height], [width, height]);
  const extractedPng = await core.extractWatermarkText(embeddedPng);
  assert.equal(extractedPng.payload, "png-transparan-645x483");

  // Verify partial right/bottom edges are untouched at the raw RGB layer
  const packet = packetMod.encodePacket(Buffer.from("edge-check", "utf8"));
  const outRgb = dct.embedPacketInRgb(baseRgb, width, height, packet);
  const fullW = Math.floor(width / 8) * 8;
  const fullH = Math.floor(height / 8) * 8;
  for (let y = 0; y < height; y++) {
    for (let x = fullW; x < width; x++) {
      const off = (y * width + x) * 3;
      assert.deepEqual(Buffer.from(outRgb.subarray(off, off + 3)), baseRgb.subarray(off, off + 3));
    }
  }
  for (let y = fullH; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = (y * width + x) * 3;
      assert.deepEqual(Buffer.from(outRgb.subarray(off, off + 3)), baseRgb.subarray(off, off + 3));
    }
  }
});

test("exact capacity boundary, one byte over, tiny images, and panoramas", async () => {
  // 1. Exact 512-byte profile cap on 1080x1080
  const squareImg = await createTexturedJpeg(1080, 1080, { seed: 7 });
  assert.equal(core.getWatermarkCapacity(1080, 1080), 512);
  const maxPayload = new Uint8Array(512);
  for (let i = 0; i < 512; i++) maxPayload[i] = (i * 13 + 5) & 0xff;
  const embedded512 = await core.embedWatermark(squareImg, maxPayload);
  const extracted512 = await core.extractWatermark(embedded512);
  assert.deepEqual(extracted512.payload, maxPayload);

  // One byte over 512 must reject explicitly
  await assert.rejects(
    core.embedWatermark(squareImg, new Uint8Array(513)),
    err => err instanceof core.WatermarkError && err.code === "CAPACITY_EXCEEDED"
  );

  // 2. Image-limited capacity: 320x320 has capacity 26 bytes
  const smallImg = await createTexturedJpeg(320, 320, { seed: 11 });
  assert.equal(core.getWatermarkCapacity(320, 320), 26);
  const exact26 = Buffer.from("a".repeat(26), "utf8");
  const embedded26 = await core.embedWatermark(smallImg, exact26);
  const extracted26 = await core.extractWatermark(embedded26);
  assert.deepEqual(Buffer.from(extracted26.payload), exact26);

  await assert.rejects(
    core.embedWatermark(smallImg, Buffer.from("a".repeat(27), "utf8")),
    err => err instanceof core.WatermarkError && err.code === "CAPACITY_EXCEEDED"
  );

  // 3. Panorama: 1080x200 has capacity 100 bytes
  const panoImg = await createTexturedJpeg(1080, 200, { seed: 19 });
  assert.equal(core.getWatermarkCapacity(1080, 200), 100);
  const exact100 = Buffer.from("p".repeat(100), "utf8");
  const embeddedPano = await core.embedWatermark(panoImg, exact100);
  const extractedPano = await core.extractWatermark(embeddedPano);
  assert.deepEqual(Buffer.from(extractedPano.payload), exact100);

  await assert.rejects(
    core.embedWatermark(panoImg, Buffer.from("p".repeat(101), "utf8")),
    err => err instanceof core.WatermarkError && err.code === "CAPACITY_EXCEEDED"
  );

  // 4. Tiny images (< 960 blocks) reject explicitly on embed and extract
  const tinyImg = await createTexturedJpeg(64, 64, { seed: 3 });
  await assert.rejects(
    core.embedWatermark(tinyImg, Buffer.from("hi", "utf8")),
    err => err instanceof core.WatermarkError && err.code === "IMAGE_TOO_SMALL"
  );
  await assert.rejects(
    core.extractWatermark(tinyImg),
    err => err instanceof core.WatermarkError && err.code === "NO_WATERMARK"
  );
});

test("rejects unmarked, invalid/corrupted images, bad version/profile/length, tampered packets, and invalid UTF-8", async () => {
  // Unmarked image
  const unmarked = await createTexturedJpeg(640, 480, { seed: 101 });
  await assert.rejects(
    core.extractWatermark(unmarked),
    err => err instanceof core.WatermarkError && err.code === "NO_WATERMARK"
  );

  // Invalid / unsupported / empty image inputs
  for (const badInput of [
    Buffer.alloc(0),
    Buffer.from("not an image"),
    Buffer.from('<svg width="400" height="400"></svg>'),
  ]) {
    await assert.rejects(
      core.embedWatermark(badInput, Buffer.from("test")),
      err => err instanceof core.WatermarkError && err.code === "INVALID_IMAGE"
    );
    await assert.rejects(
      core.extractWatermark(badInput),
      err => err instanceof core.WatermarkError && err.code === "INVALID_IMAGE"
    );
  }

  // Raw-packet fault injection: unsupported version, unsupported profile, invalid length, integrity failure
  const width = 400;
  const height = 400;
  const rgb = createTexturedRgb(width, height, 55);

  const buildCustomPacket = (version, profile, lengthField, payloadBytes, corruptDigest = false) => {
    const body = Buffer.alloc(8 + payloadBytes.length);
    body.write("PDIW", 0, "ascii");
    body[4] = version;
    body[5] = profile;
    body[6] = (lengthField >>> 8) & 0xff;
    body[7] = lengthField & 0xff;
    payloadBytes.copy(body, 8);
    const digest = crypto.createHash("sha256").update(body).digest();
    if (corruptDigest) digest[0] ^= 0xff;
    return new Uint8Array(Buffer.concat([body, digest]));
  };

  // Unsupported version (2)
  const badVersionRgb = dct.embedPacketInRgb(rgb, width, height, buildCustomPacket(2, 1, 4, Buffer.from("test")));
  assert.throws(
    () => dct.extractPacketFromRgb(badVersionRgb, width, height),
    err => err instanceof core.WatermarkError && err.code === "UNSUPPORTED_VERSION"
  );

  // Unsupported profile (2)
  const badProfileRgb = dct.embedPacketInRgb(rgb, width, height, buildCustomPacket(1, 2, 4, Buffer.from("test")));
  assert.throws(
    () => dct.extractPacketFromRgb(badProfileRgb, width, height),
    err => err instanceof core.WatermarkError && err.code === "UNSUPPORTED_PROFILE"
  );

  // Invalid length (> 512 / > image capacity)
  const badLenRgb = dct.embedPacketInRgb(rgb, width, height, buildCustomPacket(1, 1, 600, Buffer.from("test")));
  assert.throws(
    () => dct.extractPacketFromRgb(badLenRgb, width, height),
    err => err instanceof core.WatermarkError && err.code === "INVALID_LENGTH"
  );

  // Integrity failure (corrupted SHA-256 digest and corrupted payload bit)
  const badDigestRgb = dct.embedPacketInRgb(rgb, width, height, buildCustomPacket(1, 1, 4, Buffer.from("test"), true));
  assert.throws(
    () => dct.extractPacketFromRgb(badDigestRgb, width, height),
    err => err instanceof core.WatermarkError && err.code === "INTEGRITY_FAILED"
  );

  const validPacket = packetMod.encodePacket(Buffer.from("test", "utf8"));
  validPacket[8] ^= 0x01; // Flip 1 bit in payload without updating digest
  const badPayloadRgb = dct.embedPacketInRgb(rgb, width, height, validPacket);
  assert.throws(
    () => dct.extractPacketFromRgb(badPayloadRgb, width, height),
    err => err instanceof core.WatermarkError && err.code === "INTEGRITY_FAILED"
  );

  // Valid binary payload with invalid UTF-8 sequence succeeds in byte API and fails in text API
  const invalidUtf8 = new Uint8Array([0xff, 0xfe, 0x80, 0x41]);
  const embeddedInvalidUtf8 = await core.embedWatermark(unmarked, invalidUtf8);
  const rawResult = await core.extractWatermark(embeddedInvalidUtf8);
  assert.deepEqual(rawResult.payload, invalidUtf8);

  await assert.rejects(
    core.extractWatermarkText(embeddedInvalidUtf8),
    err => err instanceof core.WatermarkError && err.code === "INVALID_UTF8"
  );
});

test("PSNR/SSIM helper matches analytical Wang et al. formulas and symmetry", () => {
  const width = 32;
  const height = 24;
  const flat100 = Buffer.alloc(width * height * 3, 100);
  const flat120 = Buffer.alloc(width * height * 3, 120);

  // Identical images -> PSNR = Infinity, SSIM = 1
  const identical = computePsnrAndSsimY(flat100, flat100, width, height);
  assert.equal(identical.psnr, Infinity);
  assert.ok(Math.abs(identical.ssim - 1) < 1e-12);

  // Constant luminance shift 100 -> 120: exact closed-form PSNR and SSIM
  const shifted = computePsnrAndSsimY(flat100, flat120, width, height);
  const expectedPsnr = 10 * Math.log10((255 * 255) / (20 * 20));
  const expectedSsim = (2 * 100 * 120 + SSIM_C1) / (100 * 100 + 120 * 120 + SSIM_C1);
  assert.ok(Math.abs(shifted.psnr - expectedPsnr) < 1e-12);
  assert.ok(Math.abs(shifted.ssim - expectedSsim) < 1e-12);

  // Symmetry on textured images
  const texA = createTexturedRgb(width, height, 1);
  const texB = createTexturedRgb(width, height, 2);
  const ab = computePsnrAndSsimY(texA, texB, width, height);
  const ba = computePsnrAndSsimY(texB, texA, width, height);
  assert.ok(Math.abs(ab.psnr - ba.psnr) < 1e-12);
  assert.ok(Math.abs(ab.ssim - ba.ssim) < 1e-12);

  // Pinned reference cross-check against scikit-image==0.26.0 (numpy==2.5.5, scipy==1.18.1)
  // on deterministic 64x48 BT.601 float64 luminance Y planes (seeds 2026 vs 2027):
  //   peak_signal_noise_ratio(ya, yb, data_range=255.0)
  //   structural_similarity(ya, yb, data_range=255.0, gaussian_weights=True,
  //                         sigma=1.5, use_sample_covariance=False)
  const refA = createTexturedRgb(64, 48, 2026);
  const refB = createTexturedRgb(64, 48, 2027);
  const ref = computePsnrAndSsimY(refA, refB, 64, 48);
  assert.ok(Math.abs(ref.psnr - 29.617255250321570) < 1e-12);
  assert.ok(Math.abs(ref.ssim - 0.509227177036293) < 1e-12);
});

test("matched visible-watermarked preview preserves visual quality (PSNR & SSIM) and exact recovery", async t => {
  // Start from a larger source (1620x1080) and apply identical resize, sRGB,
  // white flatten, visible watermark, and JPEG Q80 progressive/mozjpeg 4:2:0.
  const srcWidth = 1620;
  const srcHeight = 1080;
  const srcRgb = createTexturedRgb(srcWidth, srcHeight, 2026);
  const { data: resizedPng, info } = await sharp(srcRgb, {
    raw: { width: srcWidth, height: srcHeight, channels: 3 },
  })
    .rotate()
    .resize({ width: 1080, height: 1080, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .png()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  assert.deepEqual([width, height], [1080, 720]);

  const stamp = Buffer.from(WATERMARK_STAMP_BASE64, "base64");
  const scale = Math.min(1, width / WATERMARK_STAMP_W, height / WATERMARK_STAMP_H);
  const stampW = Math.max(1, Math.floor(WATERMARK_STAMP_W * scale));
  const stampH = Math.max(1, Math.floor(WATERMARK_STAMP_H * scale));
  const resizedStamp = await sharp(stamp).resize(stampW, stampH).png().toBuffer();
  const stepX = stampW + Math.round(stampW * 0.5);
  const stepY = stampH + Math.round(stampH * 0.8);
  const tiles = [];
  for (let row = 0; row * stepY < height; row++) {
    const stagger = row % 2 === 1 ? Math.round(stepX / 2) : 0;
    for (let col = 0; col * stepX + stagger < width; col++) {
      const top = row * stepY;
      const left = col * stepX + stagger;
      if (top < height && left < width) {
        tiles.push({ input: resizedStamp, top, left, blend: "over" });
      }
    }
  }
  const overlay = await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(tiles)
    .png()
    .toBuffer();

  // Lossless resized + visible-watermarked preview before final JPEG Q80 encoding
  const visibleOnlyPng = await sharp(resizedPng)
    .composite([{ input: overlay, blend: "over" }])
    .toColourspace("srgb")
    .png()
    .toBuffer();

  const jpegOptions = { quality: 80, progressive: true, mozjpeg: true, chromaSubsampling: "4:2:0" };
  const baselineJpeg = await sharp(visibleOnlyPng).toColourspace("srgb").jpeg(jpegOptions).toBuffer();
  const watermarkedJpeg = await core.embedWatermarkText(visibleOnlyPng, "PADUSTOCK-IWM-v1");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "padustock-iwm-quality-"));
  try {
    const baselinePath = path.join(tempDir, "baseline.jpg");
    const watermarkedPath = path.join(tempDir, "watermarked.jpg");
    fs.writeFileSync(baselinePath, baselineJpeg);
    fs.writeFileSync(watermarkedPath, watermarkedJpeg);

    const savedBaseline = fs.readFileSync(baselinePath);
    const savedWatermarked = fs.readFileSync(watermarkedPath);

    const extracted = await core.extractWatermarkText(savedWatermarked);
    assert.equal(extracted.payload, "PADUSTOCK-IWM-v1");

    const baselineRgb = await sharp(savedBaseline).toColourspace("srgb").removeAlpha().raw().toBuffer();
    const watermarkedRgb = await sharp(savedWatermarked).toColourspace("srgb").removeAlpha().raw().toBuffer();
    const { psnr, ssim } = computePsnrAndSsimY(baselineRgb, watermarkedRgb, width, height);
    t.diagnostic(
      `matched ${width}x${height} saved JPEG Q80 visible-watermarked preview (16 B payload; BT.601 full-range Y; 11x11 Gaussian sigma=1.5, stride=1, valid-window avg, pop-cov, data_range=255): PSNR=${psnr.toFixed(2)} dB, SSIM=${ssim.toFixed(4)}`
    );

    assert.ok(psnr >= 38, `Expected matched-preview PSNR >= 38 dB, got ${psnr.toFixed(2)} dB`);
    assert.ok(ssim >= 0.98, `Expected matched-preview SSIM >= 0.98, got ${ssim.toFixed(4)}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
