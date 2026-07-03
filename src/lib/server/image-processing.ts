// SERVER-ONLY. Never import from Client Components.
import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import {
  WATERMARK_STAMP_BASE64,
  WATERMARK_STAMP_W,
  WATERMARK_STAMP_H,
} from "./watermark-stamp";

export interface ProcessImageResult {
  downscaledBuffer: Buffer; // Clean — sent to Gemini
  watermarkedBuffer: Buffer; // Watermarked — uploaded to Storage
  finalWidth: number;
  finalHeight: number;
}

interface ProcessOptions {
  maxLongestSidePx?: number;
  jpegQuality?: number;
}

const DEFAULTS: Required<ProcessOptions> = {
  maxLongestSidePx: 1080,
  jpegQuality: 80,
};

// Decoded once at module load — zero runtime font lookup.
const STAMP = Buffer.from(WATERMARK_STAMP_BASE64, "base64");

async function buildWatermarkOverlay(
  imageWidth: number,
  imageHeight: number
): Promise<Buffer> {
  const stepX = WATERMARK_STAMP_W + Math.round(WATERMARK_STAMP_W * 0.5);
  const stepY = WATERMARK_STAMP_H + Math.round(WATERMARK_STAMP_H * 0.8);

  const tiles: OverlayOptions[] = [];

  for (let row = 0; row * stepY < imageHeight + WATERMARK_STAMP_H; row++) {
    const stagger = row % 2 === 1 ? Math.round(stepX / 2) : 0;
    for (let col = 0; col * stepX + stagger < imageWidth + WATERMARK_STAMP_W; col++) {
      const top = row * stepY;
      const left = col * stepX + stagger;
      if (top < imageHeight && left < imageWidth) {
        tiles.push({ input: STAMP, top, left, blend: "over" });
      }
    }
  }

  return sharp({
    create: {
      width: imageWidth,
      height: imageHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(tiles)
    .png()
    .toBuffer();
}

export async function processImageForStorage(
  inputBuffer: Buffer,
  options: ProcessOptions = {}
): Promise<ProcessImageResult> {
  const { maxLongestSidePx, jpegQuality } = { ...DEFAULTS, ...options };

  const { width = 0, height = 0 } = await sharp(inputBuffer)
    .rotate()
    .metadata();

  if (width === 0 || height === 0) {
    throw new Error("Tidak dapat membaca dimensi gambar.");
  }

  const longestSide = Math.max(width, height);
  const scale =
    longestSide > maxLongestSidePx ? maxLongestSidePx / longestSide : 1;
  const finalWidth = Math.round(width * scale);
  const finalHeight = Math.round(height * scale);

  const jpegOptions = { quality: jpegQuality, progressive: true, mozjpeg: true } as const;

  // Step 1: downscale only — clean image for Gemini analysis
  const downscaledBuffer = await sharp(inputBuffer)
    .rotate()
    .resize(finalWidth, finalHeight, { fit: "fill", withoutEnlargement: true })
    .jpeg(jpegOptions)
    .toBuffer();

  // Step 2: composite pre-baked stamp — no font lookup, works on any runtime
  const watermarkOverlay = await buildWatermarkOverlay(finalWidth, finalHeight);

  const watermarkedBuffer = await sharp(downscaledBuffer)
    .composite([{ input: watermarkOverlay, blend: "over" }])
    .jpeg(jpegOptions)
    .toBuffer();

  console.log("[image-processing] done:", {
    finalWidth,
    finalHeight,
    downscaledBytes: downscaledBuffer.length,
    watermarkedBytes: watermarkedBuffer.length,
    // Must be true AND watermarkedBytes > downscaledBytes after fix
    stampApplied: watermarkedBuffer.length > downscaledBuffer.length,
  });

  return { downscaledBuffer, watermarkedBuffer, finalWidth, finalHeight };
}