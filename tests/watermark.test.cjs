const { test } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { loadTs } = require("./helpers/load-ts.cjs");

const moduleCache = new Map();
const crypto = loadTs("src/lib/server/watermark-crypto.ts", {}, moduleCache);
const core = loadTs("src/lib/watermark/core.ts", {}, moduleCache);
const imageProc = loadTs("src/lib/server/image-processing.ts", {}, moduleCache);
const watermarkBytes = loadTs("src/lib/server/watermark-bytes.ts", {}, moduleCache);

const PASSPHRASE = "rahasia-padusan-2026";
// Timestamp tetap agar paket biner deterministik antar-run (isi sertifikat memengaruhi
// pola bit yang tertanam, sehingga robustness uji tidak boleh bergantung jam dinding).
const CERT_INPUT = { photoId: "padusan-pacet-042", photographer: "Komunitas Fotografi Desa Padusan", creationTimestamp: "2026-11-18T08:00:00.000Z" };

function gradientRgb(width, height) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    rgb[i] = (90 + x / 4 + 30 * Math.sin(x / 17) * Math.cos(y / 13)) % 256;
    rgb[i + 1] = (120 + y / 3 + 25 * Math.sin((x + y) / 23)) % 256;
    rgb[i + 2] = (160 + (x + y) / 7) % 256;
  }
  return rgb;
}

// Fixture pipeline dipakai bersama agar embed berat hanya berjalan sekali.
let fixturePromise;
function pipelineFixture() {
  fixturePromise ??= (async () => {
    const width = 1600, height = 900;
    const src = await sharp(gradientRgb(width, height), { raw: { width, height, channels: 3 } }).jpeg({ quality: 94 }).toBuffer();
    const imageHash = await imageProc.computeNormalizedImageHash(src);
    const cert = crypto.buildCertificate({ ...CERT_INPUT, licenseMode: "free", imageHash });
    const { packet } = await crypto.encryptCertificate(cert, PASSPHRASE);
    const { watermarkedBuffer: previewBuffer } = await imageProc.processImageForStorage(src, {
      invisibleWatermarkPayload: new Uint8Array(packet),
    });
    const { downloadBuffer } = await imageProc.createWatermarkedDownloadCopy(src, new Uint8Array(packet));
    return { src, previewBuffer, downloadBuffer, imageHash, packet, width, height };
  })();
  return fixturePromise;
}

test("paket biner: struktur PW|LEN|SALT|NONCE|CT|TAG dan round-trip sertifikat", async () => {
  const cert = crypto.buildCertificate({ ...CERT_INPUT, imageHash: "a".repeat(64) });
  const { packet } = await crypto.encryptCertificate(cert, PASSPHRASE);
  assert.equal(packet.subarray(0, 2).toString("ascii"), "PW");
  const payloadLen = packet.readUInt16BE(2);
  assert.equal(packet.length, 48 + payloadLen);
  const parsed = crypto.parsePacket(packet);
  assert.equal(parsed.salt.length, 16);
  assert.equal(parsed.nonce.length, 12);
  assert.equal(parsed.authTag.length, 16);
  const { certificate } = await crypto.decryptPacket(packet, PASSPHRASE);
  assert.deepEqual(certificate, cert);
});

test("passphrase salah ditolak dengan Authentication Error (Invalid Tag)", async () => {
  const cert = crypto.buildCertificate({ ...CERT_INPUT, imageHash: "b".repeat(64) });
  const { packet } = await crypto.encryptCertificate(cert, PASSPHRASE);
  await assert.rejects(() => crypto.decryptPacket(packet, "passphrase-palsu"), /Authentication Error \(Invalid Tag\)/);
});

test("tamper 1 bit ciphertext ditolak oleh tag GCM", async () => {
  const cert = crypto.buildCertificate({ ...CERT_INPUT, imageHash: "c".repeat(64) });
  const { packet } = await crypto.encryptCertificate(cert, PASSPHRASE);
  packet[40] ^= 0x01;
  await assert.rejects(() => crypto.decryptPacket(packet, PASSPHRASE), /Authentication Error \(Invalid Tag\)/);
});

test("parsePacket menolak magic salah dan panjang terpotong", async () => {
  const cert = crypto.buildCertificate({ ...CERT_INPUT, imageHash: "d".repeat(64) });
  const { packet } = await crypto.encryptCertificate(cert, PASSPHRASE);
  const badMagic = Buffer.from(packet); badMagic[0] = 0x00;
  assert.throws(() => crypto.parsePacket(badMagic), /Magic header/);
  assert.throws(() => crypto.parsePacket(packet.subarray(0, packet.length - 1)), /PAYLOAD_LEN/);
});

test("mode lisensi tidak menyematkan CC BY-NC-ND 4.0 pada draf/eksternal dan kunci server fail-closed", () => {
  const extCert = crypto.buildCertificate({ ...CERT_INPUT, licenseMode: "external", imageHash: "a".repeat(64) });
  const draftCert = crypto.buildCertificate({ ...CERT_INPUT, licenseMode: "draft", imageHash: "a".repeat(64) });
  assert.ok(!extCert.license_terms.includes("CC BY"));
  assert.ok(!draftCert.license_terms.includes("CC BY"));

  const prevKey = process.env.WATERMARK_SECRET_KEY;
  try {
    delete process.env.WATERMARK_SECRET_KEY;
    assert.throws(() => crypto.getWatermarkSecretKey(), err => err.code === "KEY_UNAVAILABLE");
    process.env.WATERMARK_SECRET_KEY = "short";
    assert.throws(() => crypto.getWatermarkSecretKey(), err => err.code === "KEY_UNAVAILABLE");
    process.env.WATERMARK_SECRET_KEY = PASSPHRASE;
    assert.equal(crypto.getWatermarkSecretKey(), PASSPHRASE);
  } finally {
    if (prevKey === undefined) delete process.env.WATERMARK_SECRET_KEY;
    else process.env.WATERMARK_SECRET_KEY = prevKey;
  }
});

test("DCT Profile 1 round-trip dengan paket terenkripsi: bit identik pada preview 16:9 Q80 dan unduhan Q92", async () => {
  const { previewBuffer, downloadBuffer, packet, imageHash } = await pipelineFixture();
  for (const buf of [previewBuffer, downloadBuffer]) {
    const extracted = await core.extractWatermark(buf);
    assert.ok(Buffer.from(extracted.payload).equals(packet), "Byte terenkripsi harus identik");
    const { certificate } = await crypto.decryptPacket(Buffer.from(extracted.payload), PASSPHRASE);
    assert.equal(certificate.photo_id, CERT_INPUT.photoId);
    assert.equal(certificate.photographer, CERT_INPUT.photographer);
    assert.equal(certificate.license_terms, "CC BY-NC-ND 4.0");
    assert.equal(certificate.image_hash, imageHash);
  }
  const actualHash = await imageProc.computeNormalizedImageHash(downloadBuffer);
  assert.equal(imageProc.isNormalizedImageHashMatch(imageHash, actualHash), true);
});

test("capacity overflow ditolak sebelum citra diubah", async () => {
  const tinyJpeg = await sharp(gradientRgb(16, 16), { raw: { width: 16, height: 16, channels: 3 } }).jpeg().toBuffer();
  await assert.rejects(
    core.embedWatermark(tinyJpeg, new Uint8Array(100)),
    err => err instanceof core.WatermarkError && (err.code === "IMAGE_TOO_SMALL" || err.code === "CAPACITY_EXCEEDED")
  );
});

test("citra tanpa watermark ditolak saat ekstraksi", async () => {
  const plainJpeg = await sharp(gradientRgb(512, 512), { raw: { width: 512, height: 512, channels: 3 } }).jpeg().toBuffer();
  await assert.rejects(
    core.extractWatermark(plainJpeg),
    err => err instanceof core.WatermarkError && err.code === "NO_WATERMARK"
  );
});

test("copy-paste attack: sertifikat foto A di foto B terdeteksi lewat hash", async () => {
  const { packet, width, height } = await pipelineFixture();
  const rgbB = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    const checker = ((Math.floor(x / 64) + Math.floor(y / 64)) & 1) ? 210 : 30;
    rgbB[i] = Math.round(checker * (1 - x / width));
    rgbB[i + 1] = Math.round(checker * (1 - y / height));
    rgbB[i + 2] = checker;
  }
  const sourceB = await sharp(rgbB, { raw: { width, height, channels: 3 } }).jpeg({ quality: 94 }).toBuffer();
  const fotoB = await core.embedWatermark(sourceB, new Uint8Array(packet), { jpegQuality: 92 });
  const extracted = await core.extractWatermark(fotoB);
  const { certificate } = await crypto.decryptPacket(Buffer.from(extracted.payload), PASSPHRASE);
  const actualHash = await imageProc.computeNormalizedImageHash(fotoB);
  assert.equal(imageProc.isNormalizedImageHashMatch(certificate.image_hash, actualHash), false);
});

test("route /api/photos/extract: happy path 200 dengan WATERMARK_SECRET_KEY, kunci salah 422", async () => {
  const { downloadBuffer } = await pipelineFixture();
  const userId = "11111111-1111-4111-8111-111111111111";
  const stagedPath = `${userId}/44444444-4444-4444-8444-444444444444.jpg`;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    storage: {
      from: () => ({
        info: async () => ({ data: { size: downloadBuffer.byteLength }, error: null }),
        download: async () => ({ data: new Blob([downloadBuffer]), error: null }),
        remove: async () => ({ error: null }),
      }),
    },
  };
  const route = loadTs("src/app/api/photos/extract/route.ts", {
    "@/lib/supabase/server": { createClient: async () => supabase },
  }, moduleCache);
  const req = () => new Request("http://localhost/api/photos/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: stagedPath }),
  });

  const prevKey = process.env.WATERMARK_SECRET_KEY;
  try {
    process.env.WATERMARK_SECRET_KEY = PASSPHRASE;
    const ok = await route.POST(req());
    assert.equal(ok.status, 200);
    const okBody = await ok.json();
    assert.equal(okBody.success, true);
    assert.equal(okBody.data.authenticated, true);
    assert.equal(okBody.data.hashMatch, true);
    assert.equal(okBody.data.certificate.photo_id, CERT_INPUT.photoId);

    process.env.WATERMARK_SECRET_KEY = "passphrase-palsu";
    const bad = await route.POST(req());
    assert.equal(bad.status, 422);
    const badBody = await bad.json();
    assert.equal(badBody.code, "AUTH_FAILED");
    assert.match(badBody.error, /Authentication Error \(Invalid Tag\)/);
  } finally {
    if (prevKey === undefined) delete process.env.WATERMARK_SECRET_KEY;
    else process.env.WATERMARK_SECRET_KEY = prevKey;
  }
});

test("prepareWatermarkPayloadBytes mengenkripsi sertifikat sekali dengan kunci server", async () => {
  const prevKey = process.env.WATERMARK_SECRET_KEY;
  process.env.WATERMARK_SECRET_KEY = PASSPHRASE;
  try {
    const prepared = await watermarkBytes.prepareWatermarkPayloadBytes({
      photoId: CERT_INPUT.photoId,
      userId: "user-1",
      photographer: CERT_INPUT.photographer,
      licenseMode: "free",
      imageHash: "f".repeat(64),
      customPayload: "Desa Padusan 🌿",
    });
    assert.equal(prepared.version, "iwm-v1-aes256gcm");
    assert.equal(crypto.isEncryptedWatermarkPacket(prepared.payloadBytes), true);
    const { certificate } = await crypto.decryptPacket(Buffer.from(prepared.payloadBytes), PASSPHRASE);
    assert.equal(certificate.reference_payload, "Desa Padusan 🌿");
  } finally {
    if (prevKey === undefined) delete process.env.WATERMARK_SECRET_KEY;
    else process.env.WATERMARK_SECRET_KEY = prevKey;
  }
});