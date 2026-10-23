// SERVER-ONLY. Never import from Client Components.
import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { createPhotoPreview } from "./photo-image";
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
  const scale = Math.min(1, imageWidth / WATERMARK_STAMP_W, imageHeight / WATERMARK_STAMP_H);
  const stampWidth = Math.max(1, Math.floor(WATERMARK_STAMP_W * scale));
  const stampHeight = Math.max(1, Math.floor(WATERMARK_STAMP_H * scale));
  const stamp = await sharp(STAMP).resize(stampWidth, stampHeight).png().toBuffer();
  const stepX = stampWidth + Math.round(stampWidth * 0.5);
  const stepY = stampHeight + Math.round(stampHeight * 0.8);

  const tiles: OverlayOptions[] = [];

  for (let row = 0; row * stepY < imageHeight; row++) {
    const stagger = row % 2 === 1 ? Math.round(stepX / 2) : 0;
    for (let col = 0; col * stepX + stagger < imageWidth; col++) {
      const top = row * stepY;
      const left = col * stepX + stagger;
      if (top < imageHeight && left < imageWidth) {
        tiles.push({ input: stamp, top, left, blend: "over" });
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

  const jpegOptions = { quality: jpegQuality, progressive: true, mozjpeg: true } as const;
  const { data: downscaledBuffer, info } = await createPhotoPreview(inputBuffer, maxLongestSidePx, jpegQuality);
  const finalWidth = info.width;
  const finalHeight = info.height;

  // Step 2: composite pre-baked stamp — no font lookup, works on any runtime
  const watermarkOverlay = await buildWatermarkOverlay(finalWidth, finalHeight);

  const watermarkedBuffer = await sharp(downscaledBuffer)
    .composite([{ input: watermarkOverlay, blend: "over" }])
    .jpeg(jpegOptions)
    .toBuffer();

  return { downscaledBuffer, watermarkedBuffer, finalWidth, finalHeight };
}
