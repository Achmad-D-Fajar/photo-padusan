import { NextRequest, NextResponse } from "next/server";
import { requirePhotoUser, removePhotoObject } from "@/lib/server/photo-upload";
import { ApiError, apiErrorResponse } from "@/lib/server/api-error";
import { extractStoragePath } from "@/lib/storage";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requirePhotoUser();
    const { id } = await params;
    const { data: photo, error } = await supabase.from("photos")
      .select("id, image_url, thumbnail_url").eq("id", id).eq("user_id", user.id).single();
    if (error || !photo) throw new ApiError(404, "Foto tidak ditemukan.");
    for (const [bucket, url] of [["originals", photo.image_url], ["thumbnails", photo.thumbnail_url]] as const) {
      if (!url) continue;
      const path = extractStoragePath(url, bucket);
      if (!path || !path.startsWith(`${user.id}/`) || path.includes("..")) {
        throw new ApiError(409, "Lokasi gambar tidak valid. Hubungi pengelola.");
      }
      await removePhotoObject(supabase, bucket, path);
    }
    const { error: deleteError } = await supabase.from("photos").delete()
      .eq("id", id).eq("user_id", user.id).select("id").single();
    if (deleteError) throw new ApiError(500, "Gagal menghapus foto dari database. Silakan coba lagi.");
    return NextResponse.json({ success: true });
  } catch (error) { return apiErrorResponse(error); }
}
