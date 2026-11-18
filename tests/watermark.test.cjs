const { test } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { loadTs } = require("./helpers/load-ts.cjs");

const crypto = loadTs("src/lib/server/watermark-crypto.ts");
const dct = loadTs("src/lib/server/watermark-dct.ts");
const image = loadTs("src/lib/server/watermark-image.ts");

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
    const width = 800, height = 600;
    const src = await sharp(gradientRgb(width, height), { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
    const embedded = await image.embedCopyrightWatermark(src, CERT_INPUT, PASSPHRASE);
    return { embedded, width, height };
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

test("DCT round-trip lossless: bit identik dan PSNR > 40 dB", async () => {
  const width = 1024, height = 1024;
  const rgb = gradientRgb(width, height);
  const cert = crypto.buildCertificate({ ...CERT_INPUT, imageHash: "e".repeat(64) });
  const { packet } = await crypto.encryptCertificate(cert, PASSPHRASE);
  const wm = dct.embedPacketRgb(rgb, width, height, packet);
  const extracted = dct.extractPacketRgb(wm, width, height);
  assert.ok(extracted.equals(packet), "BER harus 0 tanpa serangan");
  let se = 0;
  for (let i = 0; i < rgb.length; i++) { const d = rgb[i] - wm[i]; se += d * d; }
  const psnr = 10 * Math.log10((255 * 255) / (se / rgb.length));
  assert.ok(psnr > 40, `PSNR ${psnr.toFixed(2)} dB harus > 40 dB`);
});

test("capacity overflow ditolak sebelum citra diubah", () => {
  const rgb = gradientRgb(16, 16);
  assert.throws(() => dct.embedPacketRgb(rgb, 16, 16, Buffer.alloc(100)), { name: "CapacityExceededError" });
});

test("citra tanpa watermark ditolak saat ekstraksi", () => {
  assert.throws(() => dct.extractPacketRgb(gradientRgb(512, 512), 512, 512), { name: "WatermarkNotFoundError" });
});

test("pipeline happy path: sertifikat utuh dan hash foto cocok", async () => {
  const { embedded } = await pipelineFixture();
  const result = await image.verifyImageWatermark(embedded.pngBuffer, PASSPHRASE);
  assert.equal(result.hashMatch, true);
  assert.equal(result.certificate.photo_id, CERT_INPUT.photoId);
  assert.equal(result.certificate.photographer, CERT_INPUT.photographer);
  assert.equal(result.certificate.license_terms, "CC BY-NC-ND 4.0");
  assert.equal(result.certificate.image_hash, embedded.imageHash);
});

test("serangan JPEG Q80: watermark tetap terbaca dan sertifikat tetap valid", async () => {
  const { embedded } = await pipelineFixture();
  const attacked = await sharp(embedded.pngBuffer).jpeg({ quality: 80 }).toBuffer();
  const result = await image.verifyImageWatermark(attacked, PASSPHRASE);
  assert.equal(result.certificate.photographer, CERT_INPUT.photographer);
  // Hash boleh mismatch setelah kompresi lossy — tag GCM tetap otoritas validitas.
  assert.equal(typeof result.hashMatch, "boolean");
});

test("copy-paste attack: sertifikat foto A di foto B terdeteksi lewat hash", async () => {
  const { embedded, width, height } = await pipelineFixture();
  const packetA = await image.extractWatermarkPacket(embedded.pngBuffer);
  const rgbB = gradientRgb(width, height).map((v, i) => (v * 3 + i) % 256);
  const wmB = dct.embedPacketRgb(rgbB, width, height, packetA);
  const fotoB = await sharp(wmB, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const result = await image.verifyImageWatermark(fotoB, PASSPHRASE);
  assert.equal(result.hashMatch, false);
});

test("route /api/photos/verify: happy path 200, passphrase salah 422", async () => {
  const { embedded } = await pipelineFixture();
  const route = loadTs("src/app/api/photos/verify/route.ts");
  function formRequest(fileBuffer, passphrase) {
    const form = new FormData();
    form.append("file", new File([fileBuffer], "sengketa.png", { type: "image/png" }));
    form.append("passphrase", passphrase);
    return new Request("http://localhost/api/photos/verify", { method: "POST", body: form });
  }
  const ok = await route.POST(formRequest(embedded.pngBuffer, PASSPHRASE));
  assert.equal(ok.status, 200);
  const okBody = await ok.json();
  assert.equal(okBody.success, true);
  assert.equal(okBody.data.certificate.photo_id, CERT_INPUT.photoId);

  const bad = await route.POST(formRequest(embedded.pngBuffer, "passphrase-palsu"));
  assert.equal(bad.status, 422);
  const badBody = await bad.json();
  assert.match(badBody.error, /Authentication Error \(Invalid Tag\)/);
});