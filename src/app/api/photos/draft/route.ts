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
      ? parsed
          .filter((t): t is string => typeof t === "string")
          .map(t => t.trim())
          .filter(Boolean)
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
      return NextResponse.json(
        { success: false, error: "Unauthorized. Silakan login terlebih dahulu." },
        { status: 401 }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, full_name")
      .eq("id", user.id)
      .single();

    const artistName =
      profile?.full_name || profile?.display_name || user.email || "Unknown";
    const copyrightText = `© ${new Date().getUTCFullYear()} ${artistName} / Etalase Padusan. All rights reserved.`;

    const formData = await request.formData();

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Tidak ada file yang dikirim." },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "Ukuran file terlalu besar (maks. 20MB)." },
        { status: 400 }
      );
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "File harus berupa gambar." },
        { status: 400 }
      );
    }

    // Bilingual content confirmed (and optionally edited) by the user in the popup
    const captionEn =
      (formData.get("caption_en") as string | null)?.trim() || "Untitled photo";
    const captionId =
      (formData.get("caption_id") as string | null)?.trim() || "Foto tanpa judul";
    const tagsEn = parseTagsField(formData.get("tags_en"));
    const tagsId = parseTagsField(formData.get("tags_id"));

    const rawBuffer = Buffer.from(await file.arrayBuffer());

// Full processing: downscale → watermark
    let processingResult;
    try {
      processingResult = await processImageForStorage(rawBuffer);
    } catch (sharpError) {
      console.error("[draft] Sharp processing failed:", sharpError);
      return NextResponse.json(
        { success: false, error: "Gagal memproses gambar. Pastikan file tidak rusak." },
        { status: 422 }
      );
    }

    const { watermarkedBuffer } = processingResult;

    const photoId = crypto.randomUUID();
    let finalBuffer: Buffer;
    try {
      finalBuffer = embedMetadata(watermarkedBuffer, {
        // Primary caption field — combine both languages for maximum tool compatibility
        caption: `${captionEn} | ${captionId}`,
        // IPTC Keywords: deduplicated union of both tag arrays (max 30)
        tags: [...new Set([...tagsEn, ...tagsId])].slice(0, 30),
        artist: artistName,
        copyright: copyrightText,
        software: "Etalase Padusan",
      });
    } catch (metaError) {
      console.error("[draft] Metadata embedding failed (non-fatal):", metaError);
      finalBuffer = watermarkedBuffer;
    }

    // Slug uses the English caption — more URL-safe across global CDNs
    const storagePath = `${user.id}/${captionToSlug(captionEn, photoId)}`;

    const { error: uploadError } = await supabase.storage
      .from("thumbnails")
      .upload(storagePath, finalBuffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { success: false, error: `Gagal mengunggah gambar: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: { publicUrl } } = supabase.storage
      .from("thumbnails")
      .getPublicUrl(storagePath);

    const { data: photo, error: insertError } = await supabase
      .from("photos")
      .insert({
        id: photoId,
        user_id: user.id,
        thumbnail_url: publicUrl,
        caption_en: captionEn,
        caption_id: captionId,
        tags_en: tagsEn,
        tags_id: tagsId,
        status: "draft",
      })
      .select()
      .single();

    if (insertError) {
      await supabase.storage.from("thumbnails").remove([storagePath]);
      return NextResponse.json(
        { success: false, error: `Gagal menyimpan draf: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: photo }, { status: 201 });
  } catch (error) {
    console.error("[/api/photos/draft]", error);
    return NextResponse.json(
      { success: false, error: "Terjadi kesalahan tak terduga di server." },
      { status: 500 }
    );
  }
}