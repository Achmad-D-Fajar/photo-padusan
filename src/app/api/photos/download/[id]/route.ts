import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractStoragePath } from "@/lib/storage";
import { ApiError, apiErrorResponse } from "@/lib/server/api-error";
import { externalLicenseLink } from "@/lib/photo-licensing";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new ApiError(400, "ID tidak valid.");
    }
    const supabase = await createClient();
    // Check the public view first, so drafts and archived photos cannot be downloaded.
    const { data: photo, error } = await supabase.from("vw_public_photos")
      .select("id, user_id, caption_id, caption_en, microstock_url").eq("id", id).single();
    if (error || !photo) throw new ApiError(404, "Foto tidak ditemukan.");
    if (externalLicenseLink(photo.microstock_url)) throw new ApiError(403, "Foto ini tersedia melalui tautan eksternal.");
    const admin = createAdminClient();
    const { data: source } = await admin.from("photos").select("image_url, thumbnail_url, microstock_url")
      .eq("id", id).eq("user_id", photo.user_id!).eq("status", "published").single();
    if (source && externalLicenseLink(source.microstock_url)) throw new ApiError(403, "Foto ini tersedia melalui tautan eksternal.");
    const bucket = source?.image_url ? "originals" : "thumbnails";
    const url = source?.image_url || source?.thumbnail_url;
    const path = url ? extractStoragePath(url, bucket) : null;
    if (!path || !path.startsWith(`${photo.user_id}/`) || path.includes("..")) throw new ApiError(404, "File gambar tidak tersedia.");
    const extension = path.split(".").pop()?.toLowerCase() ?? "jpg";
    const caption = (photo.caption_id || photo.caption_en || "foto-padustock").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    // Storage serves the file directly, including 50 MB originals and HEIC,
    // without buffering it through a Vercel function's response body.
    const { data, error: signingError } = await admin.storage.from(bucket).createSignedUrl(path, 60, { download: `${caption}-padustock.${extension}` });
    if (signingError || !data) throw new ApiError(502, "Gagal menyiapkan unduhan.");
    const response = NextResponse.redirect(data.signedUrl);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) { return apiErrorResponse(error); }
}
