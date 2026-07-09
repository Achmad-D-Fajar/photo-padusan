import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processImageForStorage } from "@/lib/server/image-processing";
import { embedMetadata } from "@/lib/server/exif-writer";
import { captionToSlug } from "@/lib/slug";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function parseTagsField(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, full_name")
      .eq("id", user.id)
      .single();

    const artistName = profile?.full_name || profile?.display_name || user.email || "Unknown";
    // MENGUBAH TEKS HAK CIPTA EXIF KE PADUSTOCK
    const copyrightText = `© ${new Date().getUTCFullYear()} ${artistName} / Padustock. All rights reserved.`;

    const formData = await request.formData();
    const file = formData.get("file");
    
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "Tidak ada file yang dikirim." }, { status: 400 });
    }

    const captionEn = (formData.get("caption_en") as string | null)?.trim() || "Untitled photo";
    const captionId = (formData.get("caption_id") as string | null)?.trim() || "Foto tanpa judul";
    
    const FORCED_TAGS_EN = ["padusan", "indonesia", "east java", "mojokerto"]; 
    const FORCED_TAGS_ID = ["padusan", "indonesia", "jawa timur", "mojokerto"];

    const rawTagsEn = parseTagsField(formData.get("tags_en"));
    const rawTagsId = parseTagsField(formData.get("tags_id"));

    const tagsEn = [...new Set([...rawTagsEn, ...FORCED_TAGS_EN])];
    const tagsId = [...new Set([...rawTagsId, ...FORCED_TAGS_ID])];
    const publishDirectly = formData.get("publish_directly") === "true";
    const insertStatus = publishDirectly ? "published" : "draft";

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const photoId = crypto.randomUUID();

    const originalStoragePath = `${user.id}/original_${photoId}.jpg`;
    const { error: originalUploadError } = await supabase.storage
      .from("originals")
      .upload(originalStoragePath, rawBuffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (originalUploadError) {
      return NextResponse.json(
        { success: false, error: `Gagal mengunggah file asli: ${originalUploadError.message}` },
        { status: 500 }
      );
    }

    const { data: { publicUrl: originalImageUrl } } = supabase.storage
      .from("originals")
      .getPublicUrl(originalStoragePath);

    let processingResult;
    try {
      processingResult = await processImageForStorage(rawBuffer);
    } catch (sharpError) {
      return NextResponse.json({ success: false, error: "Gagal memproses gambar." }, { status: 422 });
    }

    const { watermarkedBuffer } = processingResult;

    let finalBuffer: Buffer;
    try {
      finalBuffer = embedMetadata(watermarkedBuffer, {
        caption: `${captionEn} | ${captionId}`,
        tags: [...new Set([...tagsEn, ...tagsId])].slice(0, 30),
        artist: artistName,
        copyright: copyrightText,
        // MENGUBAH EXIF SOFTWARE KE PADUSTOCK
        software: "Padustock",
      });
    } catch (metaError) {
      finalBuffer = watermarkedBuffer;
    }

    const thumbStoragePath = `${user.id}/${captionToSlug(captionEn, photoId)}`;
    const { error: uploadError } = await supabase.storage
      .from("thumbnails")
      .upload(thumbStoragePath, finalBuffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ success: false, error: "Gagal mengunggah thumbnail." }, { status: 500 });
    }

    const { data: { publicUrl: thumbnailUrl } } = supabase.storage
      .from("thumbnails")
      .getPublicUrl(thumbStoragePath);

    const { data: photo, error: insertError } = await supabase
      .from("photos")
      .insert({
        id: photoId,
        user_id: user.id,
        image_url: originalImageUrl,
        thumbnail_url: thumbnailUrl,
        caption_en: captionEn,
        caption_id: captionId,
        tags_en: tagsEn,
        tags_id: tagsId,
        status: insertStatus,
        microstock_url: publishDirectly ? null : undefined,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ success: false, error: "Gagal menyimpan ke database." }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: photo }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Kesalahan server internal." }, { status: 500 });
  }
}