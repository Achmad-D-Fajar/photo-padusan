// Mengekstrak path objek di dalam bucket Supabase Storage dari public URL-nya.
// Contoh URL: https://xxxx.supabase.co/storage/v1/object/public/thumbnails/{user_id}/{uuid}.webp
// Hasil: "{user_id}/{uuid}.webp"
export function extractStoragePath(
  publicUrl: string,
  bucketName: string
): string | null {
  const marker = `/${bucketName}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length));
}