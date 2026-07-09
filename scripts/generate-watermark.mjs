// scripts/generate-watermark.mjs
// Run once: node scripts/generate-watermark.mjs
import sharp from "sharp";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEXT = "Desa Padusan - PaduStock";
const FONT_SIZE = 28;

const estW = Math.ceil(TEXT.length * FONT_SIZE * 0.62) + FONT_SIZE;
const estH = Math.ceil(FONT_SIZE * 1.8);

// Sharp renders black text on transparent bg by default.
// We read the raw pixels so we can invert and set alpha manually —
// no Pango markup needed, no fontconfig dependency.
const { data: rawPixels, info } = await sharp({
  text: { text: TEXT, rgba: true, width: estW, height: estH},
})
  .raw()
  .toBuffer({ resolveWithObject: true });

const rawOpts = { raw: { width: info.width, height: info.height, channels: 4 } };

// White layer: invert RGB (black→white), 28% alpha
const whiteData = Buffer.from(rawPixels);
for (let i = 0; i < whiteData.length; i += 4) {
  whiteData[i]     = 255 - rawPixels[i];
  whiteData[i + 1] = 255 - rawPixels[i + 1];
  whiteData[i + 2] = 255 - rawPixels[i + 2];
  whiteData[i + 3] = Math.round(rawPixels[i + 3] * 0.28);
}

// Dark shadow layer: keep black RGB, 10% alpha — readable on bright areas
const darkData = Buffer.from(rawPixels);
for (let i = 3; i < darkData.length; i += 4) {
  darkData[i] = Math.round(rawPixels[i] * 0.10);
}

const [whiteStamp, darkStamp] = await Promise.all([
  sharp(whiteData, rawOpts).png().toBuffer(),
  sharp(darkData, rawOpts).png().toBuffer(),
]);

const merged = await sharp(darkStamp)
  .composite([{ input: whiteStamp, blend: "over" }])
  .png()
  .toBuffer();

const rotated = await sharp(merged)
  .rotate(-35, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

const { width, height } = await sharp(rotated).metadata();
const base64 = rotated.toString("base64");

const outContent = [
  `// AUTO-GENERATED — do not edit manually.`,
  `// Re-run if watermark text or style changes: node scripts/generate-watermark.mjs`,
  `// Text: "${TEXT}" | Stamp: ${width}×${height}px | ${rotated.length} bytes`,
  `export const WATERMARK_STAMP_BASE64 = "${base64}";`,
  `export const WATERMARK_STAMP_W = ${width};`,
  `export const WATERMARK_STAMP_H = ${height};`,
].join("\n") + "\n";

const outPath = path.join(__dirname, "..", "src", "lib", "server", "watermark-stamp.ts");
writeFileSync(outPath, outContent, "utf-8");
console.log(`✓ Stamp: ${width}×${height}px, ${rotated.length} bytes`);
console.log(`✓ Written to: src/lib/server/watermark-stamp.ts`);