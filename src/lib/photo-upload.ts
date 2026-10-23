export const MAX_PHOTO_SIZE_MB = 50;
export const MAX_PHOTO_SIZE = MAX_PHOTO_SIZE_MB * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 80_000_000;
export const PHOTO_UPLOAD_BUCKET = "photo-uploads";
export const PHOTO_MIME_TYPES = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", gif: "image/gif", avif: "image/avif",
  tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", heif: "image/heif",
} as const;
export type PhotoExtension = keyof typeof PHOTO_MIME_TYPES;
export const PHOTO_ACCEPT = Object.entries(PHOTO_MIME_TYPES)
  .flatMap(([extension, mime]) => [`.${extension}`, mime]).join(",");

export function photoExtension(name: string, type: string): PhotoExtension | null {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension && Object.hasOwn(PHOTO_MIME_TYPES, extension)) {
    return extension as PhotoExtension;
  }
  return (Object.entries(PHOTO_MIME_TYPES).find(([, mime]) => mime === type)?.[0] as PhotoExtension) ?? null;
}

export function validatePhotoFile(file: { name: string; type: string; size: number }): string | null {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return "File gambar kosong atau tidak valid.";
  if (file.size > MAX_PHOTO_SIZE) return `Ukuran file maksimal ${MAX_PHOTO_SIZE_MB} MB.`;
  if (!photoExtension(file.name, file.type)) return "Format gambar tidak didukung. Gunakan JPEG, PNG, WebP, GIF, TIFF, AVIF, atau HEIC/HEIF.";
  return null;
}

export function isOwnedUploadPath(path: unknown, userId: string): path is string {
  return typeof path === "string" && path.startsWith(`${userId}/`) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|avif|tif|tiff|heic|heif)$/i.test(path.slice(userId.length + 1));
}
