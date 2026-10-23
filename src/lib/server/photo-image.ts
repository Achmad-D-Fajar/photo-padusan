import type { Sharp } from "sharp";
import { MAX_IMAGE_PIXELS, MAX_PHOTO_SIZE } from "@/lib/photo-upload";
import { ApiError } from "./api-error";

export function isHeicBuffer(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp" &&
    ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(buffer.toString("ascii", 8, 12));
}

// Decode HEVC via libheif-js: Sharp's prebuilt binaries support AVIF but
// do not include an HEVC decoder. Decode only the primary HEIF image.
export async function openPhotoImage(buffer: Buffer): Promise<Sharp> {
  if (buffer.length === 0 || buffer.length > MAX_PHOTO_SIZE) {
    throw new ApiError(413, "Ukuran file harus antara 1 byte dan 50 MB.");
  }
  // Load inside the request's error boundary. A missing native library must
  // produce a JSON service error rather than prevent the route from starting.
  let sharp: typeof import("sharp").default;
  try {
    ({ default: sharp } = await import("sharp"));
  } catch (error) {
    console.error("[photo-image:load]", error);
    throw new ApiError(503, "Pemroses gambar belum tersedia. Silakan coba lagi nanti.");
  }
  try {
    if (isHeicBuffer(buffer)) {
      const { default: decode } = await import("heic-decode");
      const images = await decode.all({ buffer });
      try {
        const image = images[0];
        if (!image || image.width * image.height > MAX_IMAGE_PIXELS) throw new Error("Image too large");
        const { data, width, height } = await image.decode();
        return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
          raw: { width, height, channels: 4 }, limitInputPixels: MAX_IMAGE_PIXELS,
        });
      } finally { images.dispose(); }
    }
    const image = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp", "gif", "tiff", "heif", "avif"].includes(metadata.format ?? "")) {
      throw new Error("Unsupported image");
    }
    return image;
  } catch {
    throw new ApiError(422, "Gambar rusak atau tidak didukung (maks. 80 megapiksel). Gunakan JPEG, PNG, WebP, GIF, TIFF, AVIF, atau HEIC/HEIF.");
  }
}

export async function createPhotoPreview(buffer: Buffer, maxSide = 1080, quality = 85) {
  const image = await openPhotoImage(buffer);
  try {
    return await image.rotate().resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality }).toBuffer({ resolveWithObject: true });
  } catch { throw new ApiError(422, "Gagal membaca gambar. File mungkin rusak."); }
}
