// PERINGATAN: FILE INI SERVER-ONLY.
// Jangan pernah diimpor dari Client Component atau file "use client".

import sharp from "sharp";

export interface ProcessImageResult {
  downscaledBuffer: Buffer;   // Sebelum watermark — untuk Gemini
  watermarkedBuffer: Buffer;  // Sesudah watermark — untuk Storage
  finalWidth: number;
  finalHeight: number;
  mimeType: "image/jpeg";
}

interface ProcessOptions {
  maxLongestSidePx?: number;
  jpegQuality?: number;
  watermarkText?: string;
}

const DEFAULTS: Required<ProcessOptions> = {
  maxLongestSidePx: 1080,
  jpegQuality: 80,
  watermarkText: "DesaPadusan",
};

// Menghasilkan SVG watermark yang di-tile secara diagonal di atas gambar.
function buildWatermarkSvg(
  imageWidth: number,
  imageHeight: number,
  text: string
): Buffer {
  const fontSize = Math.max(14, Math.min(40, Math.round(Math.min(imageWidth, imageHeight) / 20)));
  const approxTextWidth = Math.ceil(text.length * fontSize * 0.55);
  const spacingX = approxTextWidth + fontSize * 7;
  const spacingY = fontSize * 6;

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

      textNodes.push(
        `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="Arial" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="black" fill-opacity="0.07">${text}</text>`,
        `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="Arial" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="white" fill-opacity="0.16">${text}</text>`
      );
    }
  }

  const svg = 
    `<svg width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}" xmlns="http://www.w3.org/2000/svg">` +
    `<g transform="rotate(-35 ${cx.toFixed(1)} ${cy.toFixed(1)})">` +
    textNodes.join("") +
    `</g></svg>`;

  return Buffer.from(svg, "utf-8");
}

export async function processImageForStorage(
  inputBuffer: Buffer,
  options: ProcessOptions = {}
): Promise<ProcessImageResult> {
  const { maxLongestSidePx, jpegQuality, watermarkText } = { ...DEFAULTS, ...options };

  const pipeline = sharp(inputBuffer).rotate();
  const { width = 0, height = 0 } = await pipeline.metadata();

  if (width === 0 || height === 0) {
    throw new Error("Tidak dapat membaca dimensi gambar.");
  }

  const longestSide = Math.max(width, height);
  const scale = longestSide > maxLongestSidePx ? maxLongestSidePx / longestSide : 1;
  const finalWidth = Math.round(width * scale);
  const finalHeight = Math.round(height * scale);

  // Tahap 1: Downscale (Bersih untuk Gemini)
  const downscaledBuffer = await sharp(inputBuffer)
    .rotate()
    .resize(finalWidth, finalHeight, { fit: "fill", withoutEnlargement: true })
    .jpeg({ quality: jpegQuality, progressive: true, mozjpeg: true })
    .toBuffer();

  // Tahap 2: Watermark (SVG Dinamis - Paling stabil untuk Vercel)
  const watermarkSvg = buildWatermarkSvg(finalWidth, finalHeight, watermarkText);

  console.log("Memulai proses composite watermark (SVG)...");

  const watermarkedBuffer = await sharp(downscaledBuffer)
    .composite([
      {
        input: watermarkSvg,
        blend: "over",
        gravity: "center", // Mencegah error dimensi
      },
    ])
    .jpeg({ quality: jpegQuality, progressive: true, mozjpeg: true })
    .toBuffer();

  console.log("Composite selesai.");

  return {
    downscaledBuffer,
    watermarkedBuffer,
    finalWidth,
    finalHeight,
    mimeType: "image/jpeg",
  };
}