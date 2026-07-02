// SERVER-ONLY. Sharp is a native module — not safe for browser bundles.
import sharp from "sharp";

export interface ProcessImageResult {
  downscaledBuffer: Buffer; // Clean (no watermark) — sent to Gemini
  watermarkedBuffer: Buffer; // Watermarked — ready for embedMetadata → Storage
  finalWidth: number;
  finalHeight: number;
}

interface ProcessOptions {
  maxLongestSidePx?: number;
  jpegQuality?: number;
  watermarkText?: string;
}

const DEFAULTS: Required<ProcessOptions> = {
  maxLongestSidePx: 1080,
  jpegQuality: 80,
  watermarkText: "© Etalase Padusan",
};

function buildWatermarkSvg(
  imageWidth: number,
  imageHeight: number,
  text: string
): Buffer {
  const fontSize = Math.max(
    14,
    Math.min(40, Math.round(Math.min(imageWidth, imageHeight) / 20))
  );
  const approxTextWidth = Math.ceil(text.length * fontSize * 0.55);
  const spacingX = approxTextWidth + fontSize * 4;
  const spacingY = fontSize * 3.5;
  const cx = imageWidth / 2;
  const cy = imageHeight / 2;
  const diagonal = Math.ceil(Math.sqrt(imageWidth ** 2 + imageHeight ** 2));
  const tilesH = Math.ceil(diagonal / spacingX) + 1;
  const tilesV = Math.ceil(diagonal / spacingY) + 1;

  const textNodes: string[] = [];
  for (let row = -tilesV; row <= tilesV; row++) {
    for (let col = -tilesH; col <= tilesH; col++) {
      const stagger = row % 2 === 0 ? 0 : spacingX / 2;
      const x = (cx + col * spacingX + stagger).toFixed(1);
      const y = (cy + row * spacingY).toFixed(1);
      const attrs =
        `font-size="${fontSize}" font-family="Arial,Helvetica,sans-serif"` +
        ` font-weight="bold" text-anchor="middle" dominant-baseline="middle"`;
      textNodes.push(
        `<text x="${x}" y="${y}" ${attrs} fill="black" fill-opacity="0.12">${text}</text>`,
        `<text x="${x}" y="${y}" ${attrs} fill="white" fill-opacity="0.28">${text}</text>`
      );
    }
  }

  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg"` +
    ` width="${imageWidth}" height="${imageHeight}"` +
    ` viewBox="0 0 ${imageWidth} ${imageHeight}">` +
    `<g transform="rotate(-35 ${cx.toFixed(1)} ${cy.toFixed(1)})">` +
    textNodes.join("") +
    `</g></svg>`;

  return Buffer.from(svg, "utf-8");
}

export async function processImageForStorage(
  inputBuffer: Buffer,
  options: ProcessOptions = {}
): Promise<ProcessImageResult> {
  const { maxLongestSidePx, jpegQuality, watermarkText } = {
    ...DEFAULTS,
    ...options,
  };

  const { width = 0, height = 0 } = await sharp(inputBuffer).rotate().metadata();

  if (width === 0 || height === 0) {
    throw new Error("Tidak dapat membaca dimensi gambar.");
  }

  const scale =
    Math.max(width, height) > maxLongestSidePx
      ? maxLongestSidePx / Math.max(width, height)
      : 1;

  const finalWidth = Math.round(width * scale);
  const finalHeight = Math.round(height * scale);

  const jpegOptions: Parameters<ReturnType<typeof sharp>["jpeg"]>[0] = {
    quality: jpegQuality,
    progressive: true,
    mozjpeg: true,
  };

  // Downscaled only — no watermark. Sent to Gemini so AI sees a clean image.
  const downscaledBuffer = await sharp(inputBuffer)
    .rotate()
    .resize(finalWidth, finalHeight, { fit: "fill", withoutEnlargement: true })
    .jpeg(jpegOptions)
    .toBuffer();

  // Watermarked — will later have EXIF+IPTC injected before Storage upload.
  const watermarkSvg = buildWatermarkSvg(finalWidth, finalHeight, watermarkText);

  const watermarkedBuffer = await sharp(downscaledBuffer)
    .composite([{ input: watermarkSvg, blend: "over" }])
    .jpeg(jpegOptions)
    .toBuffer();

  return { downscaledBuffer, watermarkedBuffer, finalWidth, finalHeight };
}