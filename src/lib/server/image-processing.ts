// SERVER-ONLY. Never import from Client Components.
import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { ApiError } from "./api-error";
import { openPhotoImage } from "./photo-image";
import { embedWatermark } from "@/lib/watermark/core";
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

export interface ProcessOptions {
  maxLongestSidePx?: number;
  jpegQuality?: number;
  invisibleWatermarkPayload?: Uint8Array | null;
}

const DEFAULTS = {
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
  const maxLongestSidePx = options.maxLongestSidePx ?? DEFAULTS.maxLongestSidePx;
  const jpegQuality = options.jpegQuality ?? DEFAULTS.jpegQuality;
  const invisibleWatermarkPayload = options.invisibleWatermarkPayload ?? null;

  const jpegOptions = {
    quality: jpegQuality,
    progressive: true,
    mozjpeg: true,
    chromaSubsampling: "4:2:0",
  } as const;

  const image = await openPhotoImage(inputBuffer);
  let resizedRgb: Buffer;
  let finalWidth: number;
  let finalHeight: number;
  try {
    const { data, info } = await image
      .rotate()
      .resize({ width: maxLongestSidePx, height: maxLongestSidePx, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    resizedRgb = data;
    finalWidth = info.width;
    finalHeight = info.height;
  } catch {
    throw new ApiError(422, "Gagal membaca gambar. File mungkin rusak.");
  }
  const rawInput = { raw: { width: finalWidth, height: finalHeight, channels: 3 as const } };

  const downscaledBuffer = await sharp(resizedRgb, rawInput)
    .toColourspace("srgb")
    .jpeg({ quality: jpegQuality })
    .toBuffer();

  // Step 2: composite pre-baked visible stamp on the lossless resized preview
  const watermarkOverlay = await buildWatermarkOverlay(finalWidth, finalHeight);
  const visibleComposite = sharp(resizedRgb, rawInput)
    .composite([{ input: watermarkOverlay, blend: "over" }])
    .toColourspace("srgb");

  // Step 3: embed invisible watermark (when enabled) before the single final JPEG Q80 encode
  let watermarkedBuffer: Buffer;
  if (invisibleWatermarkPayload !== null) {
    const visiblePng = await visibleComposite.png().toBuffer();
    watermarkedBuffer = await embedWatermark(visiblePng, invisibleWatermarkPayload);
  } else {
    watermarkedBuffer = await visibleComposite.jpeg(jpegOptions).toBuffer();
  }

  return { downscaledBuffer, watermarkedBuffer, finalWidth, finalHeight };
}
