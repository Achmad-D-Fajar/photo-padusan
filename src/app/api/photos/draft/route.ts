import { NextRequest, NextResponse } from "next/server";
import { createWatermarkedDownloadCopy, processImageForStorage } from "@/lib/server/image-processing";
import { embedMetadata } from "@/lib/server/exif-writer";
import { requirePhotoUser, readStagedPhoto, removeStagedPhoto, removePhotoObject } from "@/lib/server/photo-upload";
import { ApiError, apiErrorResponse, readJson } from "@/lib/server/api-error";
import {
  DOWNLOAD_WATERMARK_VERSION_NONE,
  PHOTO_DOWNLOAD_BUCKET,
  PHOTO_UPLOAD_BUCKET,
  isOwnedUploadPath,
} from "@/lib/photo-upload";
import { captionToSlug } from "@/lib/slug";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  LEGAL_DOCUMENTS,
  hasAuthorizedTermsAcceptance,
  photoPageUrl,
  type LegalAcknowledgmentInput,
} from "@/lib/legal-documents";
import { watermarkPayload } from "@/lib/watermark-payload";
import { prepareWatermarkPayloadBytes } from "@/lib/server/watermark-bytes";
import { WatermarkError } from "@/lib/watermark/core";

export const runtime = "nodejs";
export const maxDuration = 120;

function parseOptionalLegalAcknowledgment(value: unknown): LegalAcknowledgmentInput | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("accepted" in value) ||
    (value as Record<string, unknown>).accepted !== true ||
    typeof (value as Record<string, unknown>).termsVersion !== "string" ||
    typeof (value as Record<string, unknown>).privacyVersion !== "string"
  ) {
    throw new ApiError(400, "Konfirmasi Syarat & Ketentuan dan Kebijakan Privasi tidak valid.");
  }
  const ack = value as LegalAcknowledgmentInput;
  if (
    ack.termsVersion !== LEGAL_DOCUMENTS.terms.version ||
    ack.privacyVersion !== LEGAL_DOCUMENTS.privacy.version
  ) {
    throw new ApiError(409, "Versi dokumen hukum telah berubah. Muat ulang halaman dan tinjau dokumen terbaru.");
  }
  return ack;
}

function parseTags(value: unknown, required: string[]): string[] {
  if (!Array.isArray(value) || value.length > 30 || value.some(tag => typeof tag !== "string" || tag.length > 64)) {
    throw new ApiError(400, "Tags harus berupa maksimal 30 teks (maks. 64 karakter per tag).");
  }
  return [...new Set([...required, ...value.map(tag => tag.trim()).filter(Boolean)])].slice(0, 30);
}

async function parseWatermarkSetting(
  body: Record<string, unknown>,
  context: { photoId: string; userId: string },
): Promise<{
  watermarkEnabled: boolean;
  payload: Uint8Array | null;
  watermarkVersion: string;
}> {
  if (body.watermark_enabled !== undefined && typeof body.watermark_enabled !== "boolean") {
    throw new ApiError(400, "Pengaturan watermark tidak valid.");
  }
  if (body.watermark_enabled === false) {
    return { watermarkEnabled: false, payload: null, watermarkVersion: DOWNLOAD_WATERMARK_VERSION_NONE };
  }
  if (body.watermark_payload !== undefined && typeof body.watermark_payload !== "string") {
    throw new ApiError(400, "Payload watermark harus berupa teks.");
  }
  const resolved = watermarkPayload(body.watermark_payload ?? "");
  if (!resolved.valid) {
    throw new ApiError(400, "Payload watermark melebihi batas 512 byte UTF-8. Kurangi teks payload tanpa pemotongan otomatis.");
  }
  // Prepare / encrypt payload bytes ONCE so both preview and free-download copy receive identical bytes.
  const prepared = await prepareWatermarkPayloadBytes({
    photoId: context.photoId,
    userId: context.userId,
    customPayload: resolved.payload,
  });
  return { watermarkEnabled: true, payload: prepared.payloadBytes, watermarkVersion: prepared.version };
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requirePhotoUser();
    const body = await readJson(request);
    const path = body.path;
    if (!isOwnedUploadPath(path, user.id)) throw new ApiError(400, "Lokasi unggahan tidak valid.");
    const photoId = crypto.randomUUID();
    const publishDirectly = body.publish_directly === true;
    let originalPath: string | null = null;
    let downloadPath: string | null = null;
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
      const legalAcknowledgment = parseOptionalLegalAcknowledgment(body.legalAcknowledgment);
      const alreadyAcceptedCurrentTerms = hasAuthorizedTermsAcceptance(user, LEGAL_DOCUMENTS.terms.version);
      if (publishDirectly && !alreadyAcceptedCurrentTerms && !legalAcknowledgment) {
        throw new ApiError(
          409,
          "Setujui Syarat & Ketentuan terbaru sebelum mempublikasikan foto unduhan gratis.",
        );
      }
      const { watermarkEnabled, payload: invisibleWatermarkPayload, watermarkVersion } = await parseWatermarkSetting(
        body,
        { photoId, userId: user.id },
      );
      const rawBuffer = await readStagedPhoto(supabase, user.id, path);

      // Generate and verify all required outputs before writing any permanent storage object.
      let watermarkedBuffer: Buffer;
      let downloadBuffer: Buffer | null = null;
      try {
        ({ watermarkedBuffer } = await processImageForStorage(rawBuffer, {
          invisibleWatermarkPayload,
        }));
        if (publishDirectly) {
          ({ downloadBuffer } = await createWatermarkedDownloadCopy(rawBuffer, invisibleWatermarkPayload));
        }
      } catch (error) {
        if (error instanceof WatermarkError) {
          throw new ApiError(422, error.message);
        }
        throw error;
      }

      if (legalAcknowledgment && !alreadyAcceptedCurrentTerms) {
        const { error: ackError } = await createAdminClient().auth.admin.updateUserById(user.id, {
          app_metadata: {
            ...(user.app_metadata ?? {}),
            legal_acknowledgment: {
              terms_version: LEGAL_DOCUMENTS.terms.version,
              privacy_version: LEGAL_DOCUMENTS.privacy.version,
              accepted_at: new Date().toISOString(),
            },
          },
        });
        if (ackError) {
          throw new ApiError(500, "Gagal mencatat persetujuan Syarat & Ketentuan.");
        }
      }

      const { data: profile } = await supabase.from("profiles").select("display_name, full_name").eq("id", user.id).single();
      const artist = profile?.full_name || profile?.display_name || "Fotografer Padustock";
      const finalBuffer = embedMetadata(watermarkedBuffer, {
        caption: `${captionEn} | ${captionId}`,
        tags: [...new Set([...tagsEn, ...tagsId])].slice(0, 30), artist,
        copyright: `© ${new Date().getUTCFullYear()} ${artist}`, software: "Padustock", photoPageUrl: photoPageUrl(photoId),
      });
      const thumbPath = `${user.id}/${captionToSlug(captionEn || captionId, photoId)}`;
      const { error: thumbnailError } = await supabase.storage.from("thumbnails").upload(thumbPath, finalBuffer, { contentType: "image/jpeg", upsert: false });
      if (thumbnailError) throw new ApiError(502, "Gagal mengunggah thumbnail.");
      thumbnailPath = thumbPath;

      let downloadUrl: string | null = null;
      if (publishDirectly && downloadBuffer) {
        const dlPath = `${user.id}/download_${photoId}.jpg`;
        const { error: downloadError } = await supabase.storage.from(PHOTO_DOWNLOAD_BUCKET).upload(dlPath, downloadBuffer, { contentType: "image/jpeg", upsert: false });
        if (downloadError) throw new ApiError(502, "Gagal mengunggah salinan unduhan.");
        downloadPath = dlPath;
        ({ data: { publicUrl: downloadUrl } } = supabase.storage.from(PHOTO_DOWNLOAD_BUCKET).getPublicUrl(dlPath));
      }

      const destination = `${user.id}/original_${photoId}.${path.split(".").pop()}`;
      const { error: moveError } = await createAdminClient().storage.from(PHOTO_UPLOAD_BUCKET).move(path, destination, { destinationBucket: "originals" });
      if (moveError) throw new ApiError(502, "Gagal menyimpan gambar asli.");
      originalPath = destination;
      const { data: { publicUrl: imageUrl } } = supabase.storage.from("originals").getPublicUrl(destination);
      const { data: { publicUrl: thumbnailUrl } } = supabase.storage.from("thumbnails").getPublicUrl(thumbPath);
      const downloadWatermarkVersion = publishDirectly ? watermarkVersion : null;
      const { data: photo, error: insertError } = await supabase.from("photos").insert({
        id: photoId, user_id: user.id, image_url: imageUrl, download_url: downloadUrl,
        watermark_enabled: watermarkEnabled, download_watermark_version: downloadWatermarkVersion,
        thumbnail_url: thumbnailUrl,
        caption_en: captionEn || null, caption_id: captionId || null, tags_en: tagsEn, tags_id: tagsId,
        status: publishDirectly ? "published" : "draft", microstock_url: null,
      }).select("id").single();
      if (insertError || !photo) throw new ApiError(500, "Gagal menyimpan foto ke database.");
      committed = true;
      return NextResponse.json({ success: true, data: photo }, { status: 201 });
    } finally {
      if (!committed) {
        const results = await Promise.allSettled([
          removeStagedPhoto(supabase, user.id, path),
          ...(originalPath ? [removePhotoObject(supabase, "originals", originalPath)] : []),
          ...(downloadPath ? [removePhotoObject(supabase, PHOTO_DOWNLOAD_BUCKET, downloadPath)] : []),
          ...(thumbnailPath ? [removePhotoObject(supabase, "thumbnails", thumbnailPath)] : []),
        ]);
        for (const result of results) if (result.status === "rejected") console.error("[upload cleanup]", result.reason);
      }
    }
  } catch (error) { return apiErrorResponse(error); }
}
