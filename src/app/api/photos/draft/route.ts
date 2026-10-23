import { NextRequest, NextResponse } from "next/server";
import { processImageForStorage } from "@/lib/server/image-processing";
import { embedMetadata } from "@/lib/server/exif-writer";
import { requirePhotoUser, readStagedPhoto, removeStagedPhoto, removePhotoObject } from "@/lib/server/photo-upload";
import { ApiError, apiErrorResponse, readJson } from "@/lib/server/api-error";
import { PHOTO_UPLOAD_BUCKET, isOwnedUploadPath } from "@/lib/photo-upload";
import { captionToSlug } from "@/lib/slug";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

function parseTags(value: unknown, required: string[]): string[] {
  if (!Array.isArray(value) || value.length > 30 || value.some(tag => typeof tag !== "string" || tag.length > 64)) {
    throw new ApiError(400, "Tags harus berupa maksimal 30 teks (maks. 64 karakter per tag).");
  }
  return [...new Set([...required, ...value.map(tag => tag.trim()).filter(Boolean)])].slice(0, 30);
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requirePhotoUser();
    const body = await readJson(request);
    const path = body.path;
    if (!isOwnedUploadPath(path, user.id)) throw new ApiError(400, "Lokasi unggahan tidak valid.");
    const photoId = crypto.randomUUID();
    let originalPath: string | null = null;
    let thumbnailPath: string | null = null;
    let committed = false;
    try {
      const captionEn = typeof body.caption_en === "string" ? body.caption_en.trim() : "";
      const captionId = typeof body.caption_id === "string" ? body.caption_id.trim() : "";
      if ((!captionEn && !captionId) || captionEn.length > 300 || captionId.length > 300) {
        throw new ApiError(400, "Isi minimal satu caption (maks. 300 karakter per bahasa).");
      }
      const tagsEn = parseTags(body.tags_en, ["padusan", "indonesia", "east java", "mojokerto"]);
      const tagsId = parseTags(body.tags_id, ["padusan", "indonesia", "jawa timur", "mojokerto"]);
      const rawBuffer = await readStagedPhoto(supabase, user.id, path);
      // Validate and decode before creating permanent storage objects.
      const { watermarkedBuffer } = await processImageForStorage(rawBuffer);
      const { data: profile } = await supabase.from("profiles").select("display_name, full_name").eq("id", user.id).single();
      const artist = profile?.full_name || profile?.display_name || "Fotografer Padustock";
      const finalBuffer = embedMetadata(watermarkedBuffer, {
        caption: `${captionEn} | ${captionId}`,
        tags: [...new Set([...tagsEn, ...tagsId])].slice(0, 30), artist,
        copyright: `© ${new Date().getUTCFullYear()} ${artist} / Padustock. All rights reserved.`, software: "Padustock",
      });
      const thumbPath = `${user.id}/${captionToSlug(captionEn || captionId, photoId)}`;
      thumbnailPath = thumbPath;
      const { error: thumbnailError } = await supabase.storage.from("thumbnails").upload(thumbPath, finalBuffer, { contentType: "image/jpeg", upsert: false });
      if (thumbnailError) throw new ApiError(502, "Gagal mengunggah thumbnail.");

      const destination = `${user.id}/original_${photoId}.${path.split(".").pop()}`;
      originalPath = destination;
      const { error: moveError } = await createAdminClient().storage.from(PHOTO_UPLOAD_BUCKET).move(path, destination, { destinationBucket: "originals" });
      if (moveError) throw new ApiError(502, "Gagal menyimpan gambar asli.");
      const { data: { publicUrl: imageUrl } } = supabase.storage.from("originals").getPublicUrl(destination);
      const { data: { publicUrl: thumbnailUrl } } = supabase.storage.from("thumbnails").getPublicUrl(thumbPath);
      const { data: photo, error: insertError } = await supabase.from("photos").insert({
        id: photoId, user_id: user.id, image_url: imageUrl, thumbnail_url: thumbnailUrl,
        caption_en: captionEn || null, caption_id: captionId || null, tags_en: tagsEn, tags_id: tagsId,
        status: body.publish_directly === true ? "published" : "draft", microstock_url: null,
      }).select("id").single();
      if (insertError || !photo) throw new ApiError(500, "Gagal menyimpan foto ke database.");
      committed = true;
      return NextResponse.json({ success: true, data: photo }, { status: 201 });
    } finally {
      if (!committed) {
        const results = await Promise.allSettled([
          removeStagedPhoto(supabase, user.id, path),
          ...(originalPath ? [removePhotoObject(supabase, "originals", originalPath)] : []),
          ...(thumbnailPath ? [removePhotoObject(supabase, "thumbnails", thumbnailPath)] : []),
        ]);
        for (const result of results) if (result.status === "rejected") console.error("[upload cleanup]", result.reason);
      }
    }
  } catch (error) { return apiErrorResponse(error); }
}
