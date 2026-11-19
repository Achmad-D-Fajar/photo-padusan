// Regenerates tests/ui/fixtures/watermarked.png with the REAL watermark engine.
// Run from the repo root: node tests/ui/make-watermark-fixture.cjs
// Fixed timestamp + deterministic pixels keep the fixture reproducible.
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { loadTs } = require("../helpers/load-ts.cjs");

const { embedCopyrightWatermark, verifyImageWatermark } = loadTs("src/lib/server/watermark-image.ts");

function sceneRgb(width, height) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const noise = ((x * 73856093) ^ (y * 19349663)) % 17;
      let r, g, b;
      if (y < height * 0.45) { r = 120 + noise; g = 170 + noise; b = 220 + noise; }
      else if (y < height * 0.6) { r = 60 + noise; g = 110 + noise; b = 70 + noise; }
      else { r = 150 + noise + (y % 24 < 12 ? 12 : 0); g = 130 + noise; b = 70 + noise; }
      const dx = x - width * 0.75, dy = y - height * 0.18;
      if (dx * dx + dy * dy < (height * 0.08) ** 2) { r = 240; g = 220; b = 120; }
      rgb[i] = Math.min(255, r); rgb[i + 1] = Math.min(255, g); rgb[i + 2] = Math.min(255, b);
    }
  }
  return rgb;
}

(async () => {
  const width = 640, height = 480;
  const input = await sharp(sceneRgb(width, height), { raw: { width, height, channels: 3 } }).png().toBuffer();
  const wm = await embedCopyrightWatermark(input, {
    photoId: "33333333-3333-4333-8333-333333333333",
    photographer: "Fotografer Uji",
    creationTimestamp: "2026-11-19T00:00:00.000Z",
    siteOrigin: "http://127.0.0.1:3100",
    referencePayload: "Padusan fixture 🌿",
  }, "fixture-passphrase-2026");
  const dir = path.join(__dirname, "fixtures");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "watermarked.png"), wm.pngBuffer);
  fs.writeFileSync(path.join(dir, "plain.png"), input);
  const check = await verifyImageWatermark(wm.pngBuffer, "fixture-passphrase-2026");
  if (!check.hashMatch) throw new Error("Fixture hash should match");
  console.log("fixture written:", wm.packetBytes, "byte packet, hashMatch", check.hashMatch);
})().catch(error => { console.error(error); process.exit(1); });