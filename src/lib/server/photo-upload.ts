import { createClient } from "@/lib/supabase/server";
import { MAX_PHOTO_SIZE, PHOTO_UPLOAD_BUCKET, isOwnedUploadPath } from "@/lib/photo-upload";
import { ApiError } from "./api-error";

export type PhotoClient = Awaited<ReturnType<typeof createClient>>;

export async function requirePhotoUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new ApiError(401, "Sesi telah berakhir. Silakan login kembali.");
  return { supabase, user };
}

export async function consumeAiRequest(supabase: PhotoClient) {
  const { data, error } = await supabase.rpc("consume_ai_request");
  if (error) throw new ApiError(503, "Layanan AI belum tersedia. Silakan coba lagi nanti.");
  if (!data) throw new ApiError(429, "Batas 20 permintaan AI per jam tercapai. Silakan coba lagi pada jam berikutnya.");
}

export async function readStagedPhoto(supabase: PhotoClient, userId: string, path: unknown) {
  if (!isOwnedUploadPath(path, userId)) throw new ApiError(400, "Lokasi unggahan tidak valid.");
  const bucket = supabase.storage.from(PHOTO_UPLOAD_BUCKET);
  const { data: info, error: infoError } = await bucket.info(path);
  if (infoError || !info) throw new ApiError(404, "Unggahan tidak ditemukan. Silakan pilih gambar kembali.");
  if (typeof info.size !== "number" || info.size <= 0 || info.size > MAX_PHOTO_SIZE) throw new ApiError(413, "Ukuran file maksimal 50 MB.");
  const { data: file, error } = await bucket.download(path);
  if (error || !file) throw new ApiError(502, "Gagal membaca unggahan.");
  if (file.size <= 0 || file.size > MAX_PHOTO_SIZE) throw new ApiError(413, "Ukuran file maksimal 50 MB.");
  return Buffer.from(await file.arrayBuffer());
}

export async function removeStagedPhoto(supabase: PhotoClient, userId: string, path: unknown) {
  if (!isOwnedUploadPath(path, userId)) return;
  const { error } = await supabase.storage.from(PHOTO_UPLOAD_BUCKET).remove([path]);
  if (error) throw new Error(`Gagal membersihkan unggahan: ${error.message}`);
}

export async function removePhotoObject(supabase: PhotoClient, bucket: string, path: string) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw new Error(`Gagal menghapus gambar: ${error.message}`);
}
