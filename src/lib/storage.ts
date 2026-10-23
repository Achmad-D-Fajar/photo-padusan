// Mengekstrak path objek di dalam bucket Supabase Storage dari public URL-nya.
// Contoh URL: https://xxxx.supabase.co/storage/v1/object/public/thumbnails/{user_id}/{uuid}.webp
// Hasil: "{user_id}/{uuid}.webp"
export function extractStoragePath(
  publicUrl: string,
  bucketName: string
): string | null {
  try {
    const { pathname } = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${bucketName}/`;
    if (!pathname.startsWith(marker)) return null;
    return decodeURIComponent(pathname.slice(marker.length));
  } catch { return null; }
}
