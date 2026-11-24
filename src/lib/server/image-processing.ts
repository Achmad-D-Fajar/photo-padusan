// SERVER-ONLY. Never import from Client Components.
import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { ApiError } from "./api-error";
import { openPhotoImage } from "./photo-image";
import { WatermarkError, embedWatermarkRawRgb, extractWatermark } from "@/lib/watermark/core";
import {
  WATERMARK_STAMP_BASE64,
  WATERMARK_STAMP_W,
  WATERMARK_STAMP_H,
} from "./watermark-stamp";

export const DOWNLOAD_COPY_JPEG_QUALITY = 92;

export interface ProcessImageResult {
  downscaledBuffer: Buffer; // Clean — sent to Gemini
  watermarkedBuffer: Buffer; // Visible + optional invisible watermark preview JPEG (Q80)
  finalWidth: number;
  finalHeight: number;
}

export interface FullResolutionDownloadResult {
  downloadBuffer: Buffer; // Full-resolution JPEG (Q92), no visible watermark, optional invisible watermark
  width: number;
  height: number;
  contentType: "image/jpeg";
  extension: "jpg";
  jpegQuality: number;
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

async function verifyEmbeddedWatermarkBytes(jpegBuffer: Buffer, expectedPayload: Uint8Array): Promise<void> {
  const recovered = await extractWatermark(jpegBuffer);
  if (
    recovered.byteLength !== expectedPayload.byteLength ||
    !Buffer.from(recovered.payload.buffer, recovered.payload.byteOffset, recovered.payload.byteLength).equals(
      Buffer.from(expectedPayload.buffer, expectedPayload.byteOffset, expectedPayload.byteLength)
    )
  ) {
    throw new WatermarkError(
      "INTEGRITY_FAILED",
      "Verifikasi watermark tersembunyi setelah penyandian JPEG gagal."
    );
  }
}

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
    const visibleRgb = await visibleComposite.removeAlpha().raw().toBuffer();
    watermarkedBuffer = await embedWatermarkRawRgb(
      new Uint8Array(visibleRgb.buffer, visibleRgb.byteOffset, visibleRgb.byteLength),
      finalWidth,
      finalHeight,
      invisibleWatermarkPayload,
      { jpegQuality }
    );
    await verifyEmbeddedWatermarkBytes(watermarkedBuffer, invisibleWatermarkPayload);
  } else {
    watermarkedBuffer = await visibleComposite.jpeg(jpegOptions).toBuffer();
  }

  return { downscaledBuffer, watermarkedBuffer, finalWidth, finalHeight };
}

// Generates a separate full-resolution JPEG download copy (quality 92,
// progressive/mozjpeg 4:2:0) with full oriented dimensions and NO visible
// watermark. When invisibleWatermarkPayload is provided, embeds and verifies
// the exact payload bytes before returning.
export async function createWatermarkedDownloadCopy(
  inputBuffer: Buffer,
  invisibleWatermarkPayload: Uint8Array | null
): Promise<FullResolutionDownloadResult> {
  const image = await openPhotoImage(inputBuffer);
  let fullRgb: Buffer;
  let width: number;
  let height: number;
  try {
    const { data, info } = await image
      .rotate()
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    fullRgb = data;
    width = info.width;
    height = info.height;
  } catch {
    throw new ApiError(422, "Gagal membaca gambar. File mungkin rusak.");
  }

  let downloadBuffer: Buffer;
  if (invisibleWatermarkPayload !== null) {
    downloadBuffer = await embedWatermarkRawRgb(
      new Uint8Array(fullRgb.buffer, fullRgb.byteOffset, fullRgb.byteLength),
      width,
      height,
      invisibleWatermarkPayload,
      { jpegQuality: DOWNLOAD_COPY_JPEG_QUALITY }
    );
    await verifyEmbeddedWatermarkBytes(downloadBuffer, invisibleWatermarkPayload);
  } else {
    downloadBuffer = await sharp(fullRgb, { raw: { width, height, channels: 3 } })
      .toColourspace("srgb")
      .jpeg({
        quality: DOWNLOAD_COPY_JPEG_QUALITY,
        progressive: true,
        mozjpeg: true,
        chromaSubsampling: "4:2:0",
      })
      .toBuffer();
  }

  return {
    downloadBuffer,
    width,
    height,
    contentType: "image/jpeg",
    extension: "jpg",
    jpegQuality: DOWNLOAD_COPY_JPEG_QUALITY,
  };
}

const DHASH_WIDTH = 17;
const DHASH_HEIGHT = 16; // 16 * 16 = 256 bits = 64 lowercase hex characters
const DEFAULT_MAX_HASH_HAMMING_BITS = 32; // >= 87.5% perceptual gradient similarity

/**
 * Compute a 256-bit perceptual difference hash (16x16 horizontal gradient dHash,
 * 64 lowercase hex chars) over the oriented, white-flattened grayscale image.
 * Stable across JPEG Q80/Q92 recompression and invisible DCT embedding, while
 * strongly rejecting copy-paste transplants onto unrelated photos.
 */
export async function computeNormalizedImageHash(inputBuffer: Buffer): Promise<string> {
  const image = await openPhotoImage(inputBuffer);
  let data: Buffer;
  try {
    ({ data } = await image
      .rotate()
      .flatten({ background: "#ffffff" })
      .removeAlpha()
      .grayscale()
      .resize(DHASH_WIDTH, DHASH_HEIGHT, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true }));
  } catch {
    throw new ApiError(422, "Gagal membaca gambar. File mungkin rusak.");
  }
  const bytes = Buffer.alloc(32);
  let bitIndex = 0;
  for (let y = 0; y < DHASH_HEIGHT; y++) {
    const rowOffset = y * DHASH_WIDTH;
    for (let x = 0; x < DHASH_WIDTH - 1; x++) {
      if (data[rowOffset + x] >= data[rowOffset + x + 1]) {
        bytes[bitIndex >> 3] |= 1 << (7 - (bitIndex & 7));
      }
      bitIndex++;
    }
  }
  return bytes.toString("hex");
}

export function imageHashHammingDistance(hashA: string, hashB: string): number {
  if (!/^[0-9a-f]{64}$/i.test(hashA) || !/^[0-9a-f]{64}$/i.test(hashB)) {
    return 256;
  }
  const a = Buffer.from(hashA, "hex");
  const b = Buffer.from(hashB, "hex");
  let distance = 0;
  for (let i = 0; i < 32; i++) {
    let diff = a[i] ^ b[i];
    while (diff !== 0) {
      diff &= diff - 1;
      distance++;
    }
  }
  return distance;
}

export function isNormalizedImageHashMatch(
  expectedHash: string,
  actualHash: string,
  maxHammingBits: number = DEFAULT_MAX_HASH_HAMMING_BITS,
): boolean {
  return imageHashHammingDistance(expectedHash, actualHash) <= maxHammingBits;
}
