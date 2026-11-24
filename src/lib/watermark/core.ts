import sharp, { type Sharp } from "sharp";
import {
  MAX_WATERMARK_PAYLOAD_BYTES,
  WATERMARK_OVERHEAD_BYTES,
  WatermarkError,
  decodeWatermarkText,
  encodePacket,
  encodeWatermarkText,
  getWatermarkCapacityDetails,
} from "./packet";
import { embedPacketInRgb, extractPacketFromRgb } from "./dct";

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 80_000_000;
const SUPPORTED_SHARP_FORMATS = new Set(["jpeg", "png", "webp", "gif", "tiff", "heif", "avif"]);
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

const PROFILE_1_JPEG_OPTIONS = {
  quality: 80,
  progressive: true,
  mozjpeg: true,
  chromaSubsampling: "4:2:0",
} as const;

export interface EmbedWatermarkOptions {
  jpegQuality?: number;
}

export interface ExtractedWatermark {
  payload: Uint8Array;
  byteLength: number;
  version: number;
  profile: number;
}

export interface ExtractedWatermarkText {
  payload: string;
  byteLength: number;
  version: number;
  profile: number;
}

interface DecodedSrgbImage {
  rgb: Uint8Array;
  width: number;
  height: number;
}

function isHeicBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.toString("ascii", 4, 8) === "ftyp" &&
    HEIC_BRANDS.has(buffer.toString("ascii", 8, 12))
  );
}

async function decodeImageToSrgbRgb(image: Buffer): Promise<DecodedSrgbImage> {
  if (!Buffer.isBuffer(image) || image.length === 0 || image.length > MAX_IMAGE_BYTES) {
    throw new WatermarkError(
      "INVALID_IMAGE",
      "Gambar tidak valid atau ukuran file berada di luar batas 1 byte hingga 50 MB."
    );
  }

  try {
    let pipeline: Sharp;
    if (isHeicBuffer(image)) {
      const { default: decode } = await import("heic-decode");
      const images = await decode.all({ buffer: image });
      try {
        const primary = images[0];
        if (!primary || primary.width * primary.height > MAX_IMAGE_PIXELS) {
          throw new Error("HEIC image invalid or exceeds pixel limit");
        }
        const { data, width, height } = await primary.decode();
        pipeline = sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
          raw: { width, height, channels: 4 },
          limitInputPixels: MAX_IMAGE_PIXELS,
        });
      } finally {
        images.dispose();
      }
    } else {
      pipeline = sharp(image, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "warning" });
      const metadata = await pipeline.metadata();
      if (!metadata.format || !SUPPORTED_SHARP_FORMATS.has(metadata.format)) {
        throw new Error("Unsupported image format");
      }
    }

    const { data, info } = await pipeline
      .rotate()
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.channels !== 3 || info.width <= 0 || info.height <= 0) {
      throw new Error("Decoded image is not 3-channel RGB");
    }

    return {
      rgb: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    if (error instanceof WatermarkError) throw error;
    throw new WatermarkError(
      "INVALID_IMAGE",
      "Gambar rusak atau format tidak didukung (maks. 80 megapiksel)."
    );
  }
}

export async function embedWatermarkRawRgb(
  rgb: Uint8Array,
  width: number,
  height: number,
  payload: Uint8Array,
  options: EmbedWatermarkOptions = {}
): Promise<Buffer> {
  if (!(payload instanceof Uint8Array)) {
    throw new WatermarkError("CAPACITY_EXCEEDED", "Payload harus berupa Uint8Array.");
  }

  const capacity = getWatermarkCapacityDetails(width, height);
  if (!capacity.canEmbedEmptyPayload) {
    throw new WatermarkError(
      "IMAGE_TOO_SMALL",
      `Dimensi gambar (${width}x${height}) terlalu kecil untuk watermark tersembunyi (minimal 960 blok 8x8).`,
      {
        width,
        height,
        completeBlocks: capacity.completeBlocks,
        capacityBytes: 0,
      }
    );
  }

  if (payload.byteLength > capacity.payloadCapacityBytes) {
    throw new WatermarkError(
      "CAPACITY_EXCEEDED",
      `Payload (${payload.byteLength} byte) melebihi kapasitas maksimum gambar ini (${capacity.payloadCapacityBytes} byte; batas profil ${MAX_WATERMARK_PAYLOAD_BYTES} byte).`,
      {
        payloadBytes: payload.byteLength,
        capacityBytes: capacity.payloadCapacityBytes,
        maxProfileBytes: MAX_WATERMARK_PAYLOAD_BYTES,
        overheadBytes: WATERMARK_OVERHEAD_BYTES,
      }
    );
  }

  const jpegQuality = options.jpegQuality ?? PROFILE_1_JPEG_OPTIONS.quality;
  const packet = encodePacket(payload);
  const embeddedRgb = embedPacketInRgb(rgb, width, height, packet);

  return sharp(Buffer.from(embeddedRgb.buffer, embeddedRgb.byteOffset, embeddedRgb.byteLength), {
    raw: { width, height, channels: 3 },
  })
    .toColourspace("srgb")
    .jpeg({ ...PROFILE_1_JPEG_OPTIONS, quality: jpegQuality })
    .toBuffer();
}

export async function embedWatermark(
  image: Buffer,
  payload: Uint8Array,
  options: EmbedWatermarkOptions = {}
): Promise<Buffer> {
  if (!(payload instanceof Uint8Array)) {
    throw new WatermarkError("CAPACITY_EXCEEDED", "Payload harus berupa Uint8Array.");
  }

  const decoded = await decodeImageToSrgbRgb(image);
  return embedWatermarkRawRgb(decoded.rgb, decoded.width, decoded.height, payload, options);
}

export async function extractWatermark(image: Buffer): Promise<ExtractedWatermark> {
  const decoded = await decodeImageToSrgbRgb(image);
  const extracted = extractPacketFromRgb(decoded.rgb, decoded.width, decoded.height);
  return {
    payload: extracted.payload,
    byteLength: extracted.payload.byteLength,
    version: extracted.version,
    profile: extracted.profile,
  };
}

export async function embedWatermarkText(image: Buffer, text: string): Promise<Buffer> {
  return embedWatermark(image, encodeWatermarkText(text));
}

export async function extractWatermarkText(image: Buffer): Promise<ExtractedWatermarkText> {
  const extracted = await extractWatermark(image);
  const text = decodeWatermarkText(extracted.payload);
  return {
    payload: text,
    byteLength: extracted.byteLength,
    version: extracted.version,
    profile: extracted.profile,
  };
}

export {
  MAX_WATERMARK_PAYLOAD_BYTES,
  WATERMARK_DIGEST_BYTES,
  WATERMARK_HEADER_BYTES,
  WATERMARK_MAGIC,
  WATERMARK_OVERHEAD_BYTES,
  WATERMARK_PRNG_SEED,
  WATERMARK_PROFILE,
  WATERMARK_REPETITION,
  WATERMARK_VERSION,
  WatermarkError,
  decodeWatermarkText,
  encodeWatermarkText,
  getWatermarkCapacity,
  getWatermarkCapacityDetails,
  type WatermarkCapacityDetails,
  type WatermarkErrorCode,
} from "./packet";
export { WATERMARK_QIM_DELTA } from "./dct";
