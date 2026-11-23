import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requirePhotoUser, removePhotoObject } from "@/lib/server/photo-upload";
import { ApiError, apiErrorResponse, readJson } from "@/lib/server/api-error";
import {
  DOWNLOAD_WATERMARK_VERSION_NONE,
  DOWNLOAD_WATERMARK_VERSION_PLACEHOLDER,
  MAX_PHOTO_SIZE,
  PHOTO_DOWNLOAD_BUCKET,
} from "@/lib/photo-upload";
import {
  LEGAL_DOCUMENTS,
  hasAuthorizedTermsAcceptance,
  photoPageUrl,
  type LegalAcknowledgmentInput,
} from "@/lib/legal-documents";
import { captionToSlug } from "@/lib/slug";
import { extractStoragePath } from "@/lib/storage";
import { externalLicenseLink } from "@/lib/photo-licensing";
import { attachLicenseHistory } from "@/lib/queries/photo-license-history";
import { createAdminClient } from "@/lib/supabase/admin";
import { embedMetadata } from "@/lib/server/exif-writer";
import { createWatermarkedDownloadCopy, processImageForStorage } from "@/lib/server/image-processing";
import { prepareWatermarkPayloadBytes } from "@/lib/server/watermark-bytes";
import { WatermarkError, extractWatermark } from "@/lib/watermark/core";

export const runtime = "nodejs";
export const maxDuration = 120;

const URL_REGEX = /^https?:\/\/.+/i;

function parseTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 30 || value.some(tag => typeof tag !== "string" || tag.length > 64)) {
    throw new ApiError(400, "Tags harus berupa maksimal 30 teks (maks. 64 karakter per tag).");
  }
  return value.map(tag => tag.trim()).filter(Boolean).slice(0, 30);
}

function parseOptionalCaption(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new ApiError(400, "Caption harus berupa teks.");
  return value.trim();
}

function parseMicrostockUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ApiError(400, "Format URL eksternal tidak valid.");
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!URL_REGEX.test(trimmed)) throw new ApiError(400, "Format URL tidak valid (http/https).");
  return trimmed;
}

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

async function tryReusePreviewWatermarkPayload(
  supabase: Awaited<ReturnType<typeof requirePhotoUser>>["supabase"],
  userId: string,
  thumbnailUrl: string | null,
): Promise<{ payload: Uint8Array | null; thumbnailPath: string | null }> {
  if (!thumbnailUrl) return { payload: null, thumbnailPath: null };
  const thumbPath = extractStoragePath(thumbnailUrl, "thumbnails");
  if (!thumbPath || !thumbPath.startsWith(`${userId}/`) || thumbPath.includes("..")) {
    return { payload: null, thumbnailPath: null };
  }
  try {
    const { data: blob, error } = await supabase.storage.from("thumbnails").download(thumbPath);
    if (error || !blob) return { payload: null, thumbnailPath: thumbPath };
    const thumbBuffer = Buffer.from(await blob.arrayBuffer());
    const extracted = await extractWatermark(thumbBuffer);
    if (extracted.payload.length > 0) {
      return { payload: extracted.payload, thumbnailPath: thumbPath };
    }
    return { payload: null, thumbnailPath: thumbPath };
  } catch {
    return { payload: null, thumbnailPath: thumbPath };
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requirePhotoUser();
    const { id } = await params;
    const body = await readJson(request);

    if (body.status !== "draft" && body.status !== "published") {
      throw new ApiError(400, "Status publikasi tidak valid.");
    }
    const status: "draft" | "published" = body.status;
    const captionId = parseOptionalCaption(body.caption_id);
    const captionEn = parseOptionalCaption(body.caption_en);
    if ((!captionId && !captionEn) || captionId.length > 300 || captionEn.length > 300) {
      throw new ApiError(400, "Isi minimal satu caption (maks. 300 karakter per bahasa).");
    }
    const tagsId = parseTags(body.tags_id);
    const tagsEn = parseTags(body.tags_en);
    const microstockUrl = parseMicrostockUrl(body.microstock_url);
    const legalAcknowledgment = parseOptionalLegalAcknowledgment(body.legalAcknowledgment);

    if (
      body.watermark_enabled !== undefined &&
      body.watermark_enabled !== null &&
      typeof body.watermark_enabled !== "boolean"
    ) {
      throw new ApiError(400, "Preferensi watermark tidak valid.");
    }

    const { data: photo, error } = await supabase
      .from("photos")
      .select(
        "id, user_id, image_url, thumbnail_url, download_url, watermark_enabled, download_watermark_version, status, microstock_url",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (error || !photo) throw new ApiError(404, "Foto tidak ditemukan.");

    // Preserve already-recorded per-photo watermark preference; only allow owner confirmation
    // to set watermark_enabled when the existing row is NULL (unknown legacy preference).
    const effectiveWatermarkEnabled =
      typeof photo.watermark_enabled === "boolean"
        ? photo.watermark_enabled
        : typeof body.watermark_enabled === "boolean"
          ? body.watermark_enabled
          : null;
    const confirmingLegacyPreference =
      photo.watermark_enabled === null && typeof effectiveWatermarkEnabled === "boolean";

    const alreadyAcceptedCurrentTerms = hasAuthorizedTermsAcceptance(user, LEGAL_DOCUMENTS.terms.version);
    const hasCurrentTermsAfterRequest = alreadyAcceptedCurrentTerms || legalAcknowledgment !== null;

    const isPublishingFree = status === "published" && !externalLicenseLink(microstockUrl);
    if (isPublishingFree && !photo.download_url) {
      if (typeof effectiveWatermarkEnabled !== "boolean") {
        throw new ApiError(
          409,
          "Preferensi watermark foto ini belum tercatat. Konfirmasi pilihan watermark terlebih dahulu sebelum mempublikasikan foto gratis.",
        );
      }
      if (!hasCurrentTermsAfterRequest) {
        throw new ApiError(
          409,
          "Setujui Syarat & Ketentuan terbaru sebelum mempublikasikan foto unduhan gratis.",
        );
      }
    }

    let uploadedDownloadPath: string | null = null;
    let uploadedThumbnailPath: string | null = null;
    let supersededThumbnailPath: string | null = null;
    let nextDownloadUrl: string | undefined;
    let nextDownloadWatermarkVersion: string | undefined;
    let nextThumbnailUrl: string | undefined;
    let committed = false;

    try {
      if (isPublishingFree && !photo.download_url && typeof effectiveWatermarkEnabled === "boolean") {
        const sourcePath = photo.image_url ? extractStoragePath(photo.image_url, "originals") : null;
        if (!sourcePath || !sourcePath.startsWith(`${user.id}/`) || sourcePath.includes("..")) {
          throw new ApiError(409, "Lokasi berkas sumber asli tidak valid. Hubungi pengelola.");
        }

        const originalsBucket = supabase.storage.from("originals");
        const { data: info, error: infoError } = await originalsBucket.info(sourcePath);
        if (infoError || !info) {
          throw new ApiError(404, "Berkas sumber asli tidak ditemukan.");
        }
        if (typeof info.size !== "number" || info.size <= 0 || info.size > MAX_PHOTO_SIZE) {
          throw new ApiError(413, "Ukuran berkas sumber melebihi batas 50 MB.");
        }
        const { data: file, error: downloadErr } = await originalsBucket.download(sourcePath);
        if (downloadErr || !file) {
          throw new ApiError(502, "Gagal membaca berkas sumber asli.");
        }
        const rawBuffer = Buffer.from(await file.arrayBuffer());

        let downloadBuffer: Buffer;
        let regeneratedPreviewBuffer: Buffer | null = null;

        if (!effectiveWatermarkEnabled) {
          // If opting out on a legacy photo or if the existing preview still carries an
          // invisible watermark, regenerate the preview with its visible watermark only so
          // both preview and download copy agree (no hidden watermark in either copy).
          const { payload: existingPreviewPayload, thumbnailPath: existingThumbPath } =
            await tryReusePreviewWatermarkPayload(supabase, user.id, photo.thumbnail_url);
          const shouldRegeneratePreview = photo.watermark_enabled === null || existingPreviewPayload !== null;

          try {
            ({ downloadBuffer } = await createWatermarkedDownloadCopy(rawBuffer, null));
            if (shouldRegeneratePreview) {
              const { watermarkedBuffer } = await processImageForStorage(rawBuffer, {
                invisibleWatermarkPayload: null,
              });
              const { data: profile } = await supabase
                .from("profiles")
                .select("display_name, full_name")
                .eq("id", user.id)
                .single();
              const artist = profile?.full_name || profile?.display_name || "Fotografer Padustock";
              regeneratedPreviewBuffer = embedMetadata(watermarkedBuffer, {
                caption: `${captionEn} | ${captionId}`,
                tags: [...new Set([...tagsEn, ...tagsId])].slice(0, 30),
                artist,
                copyright: `© ${new Date().getUTCFullYear()} ${artist}`,
                software: "Padustock",
                photoPageUrl: photoPageUrl(photo.id),
              });
              supersededThumbnailPath = existingThumbPath;
            }
          } catch (wmError) {
            if (wmError instanceof WatermarkError) {
              throw new ApiError(422, wmError.message);
            }
            throw wmError;
          }
          nextDownloadWatermarkVersion = DOWNLOAD_WATERMARK_VERSION_NONE;
        } else {
          // Reuse the opaque payload bytes already embedded in the photo's preview so
          // custom test payloads and encrypted payloads stay identical without DB storage.
          const { payload: reusedPayload, thumbnailPath: existingThumbPath } =
            await tryReusePreviewWatermarkPayload(supabase, user.id, photo.thumbnail_url);

          if (reusedPayload) {
            try {
              ({ downloadBuffer } = await createWatermarkedDownloadCopy(rawBuffer, reusedPayload));
            } catch (wmError) {
              if (wmError instanceof WatermarkError) {
                throw new ApiError(422, wmError.message);
              }
              throw wmError;
            }
            nextDownloadWatermarkVersion = DOWNLOAD_WATERMARK_VERSION_PLACEHOLDER;
          } else {
            // Existing preview had no safely extractable watermark (e.g., unmarked legacy photo
            // confirmed by owner, or damaged preview). Prepare ONE payload and regenerate BOTH
            // preview and full-resolution download copy from those exact same bytes.
            const prepared = await prepareWatermarkPayloadBytes({
              photoId: photo.id,
              userId: user.id,
            });
            try {
              const { watermarkedBuffer } = await processImageForStorage(rawBuffer, {
                invisibleWatermarkPayload: prepared.payloadBytes,
              });
              ({ downloadBuffer } = await createWatermarkedDownloadCopy(rawBuffer, prepared.payloadBytes));

              const { data: profile } = await supabase
                .from("profiles")
                .select("display_name, full_name")
                .eq("id", user.id)
                .single();
              const artist = profile?.full_name || profile?.display_name || "Fotografer Padustock";
              regeneratedPreviewBuffer = embedMetadata(watermarkedBuffer, {
                caption: `${captionEn} | ${captionId}`,
                tags: [...new Set([...tagsEn, ...tagsId])].slice(0, 30),
                artist,
                copyright: `© ${new Date().getUTCFullYear()} ${artist}`,
                software: "Padustock",
                photoPageUrl: photoPageUrl(photo.id),
              });
            } catch (wmError) {
              if (wmError instanceof WatermarkError) {
                throw new ApiError(422, wmError.message);
              }
              throw wmError;
            }
            supersededThumbnailPath = existingThumbPath;
            nextDownloadWatermarkVersion = prepared.version;
          }
        }

        if (regeneratedPreviewBuffer) {
          const suffix = crypto.randomBytes(4).toString("hex");
          const newThumbPath = `${user.id}/${captionToSlug(captionEn || captionId, `${photo.id}-${suffix}`)}`;
          const { error: thumbUploadError } = await supabase.storage
            .from("thumbnails")
            .upload(newThumbPath, regeneratedPreviewBuffer, { contentType: "image/jpeg", upsert: false });
          if (thumbUploadError) {
            throw new ApiError(502, "Gagal mengunggah pratinjau yang diperbarui.");
          }
          uploadedThumbnailPath = newThumbPath;
          ({ data: { publicUrl: nextThumbnailUrl } } = supabase.storage.from("thumbnails").getPublicUrl(newThumbPath));
        }

        const dlSuffix = crypto.randomBytes(4).toString("hex");
        const dlPath = `${user.id}/download_${photo.id}_${dlSuffix}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from(PHOTO_DOWNLOAD_BUCKET)
          .upload(dlPath, downloadBuffer, { contentType: "image/jpeg", upsert: false });
        if (uploadError) {
          throw new ApiError(502, "Gagal mengunggah salinan unduhan.");
        }
        uploadedDownloadPath = dlPath;
        ({ data: { publicUrl: nextDownloadUrl } } = supabase.storage.from(PHOTO_DOWNLOAD_BUCKET).getPublicUrl(dlPath));
      }

      if (legalAcknowledgment && !alreadyAcceptedCurrentTerms) {
        const supabaseAdmin = createAdminClient();
        const { error: ackError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
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

      const updateFields = {
        caption_id: captionId || null,
        caption_en: captionEn || null,
        tags_id: tagsId,
        tags_en: tagsEn,
        microstock_url: microstockUrl,
        status,
        ...(confirmingLegacyPreference ? { watermark_enabled: effectiveWatermarkEnabled } : {}),
        ...(nextThumbnailUrl !== undefined ? { thumbnail_url: nextThumbnailUrl } : {}),
        ...(nextDownloadUrl !== undefined
          ? {
              download_url: nextDownloadUrl,
              download_watermark_version: nextDownloadWatermarkVersion ?? null,
            }
          : {}),
      };

      const { data: updated, error: updateError } = await supabase
        .from("photos")
        .update(updateFields)
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id, status, microstock_url, thumbnail_url, download_url, watermark_enabled, download_watermark_version")
        .single();
      if (updateError || !updated) {
        throw new ApiError(500, "Gagal memperbarui foto.");
      }

      committed = true;

      if (supersededThumbnailPath && supersededThumbnailPath !== uploadedThumbnailPath) {
        await removePhotoObject(supabase, "thumbnails", supersededThumbnailPath).catch(cleanupError => {
          console.error("[photo-patch superseded thumbnail cleanup]", cleanupError);
        });
      }

      const [{ license_history }] = await attachLicenseHistory(supabase, [{ id: updated.id }]);
      return NextResponse.json({
        success: true,
        data: {
          ...updated,
          license_history,
          has_accepted_current_terms: hasCurrentTermsAfterRequest,
        },
      });
    } finally {
      if (!committed) {
        const cleanupTasks: Promise<unknown>[] = [];
        if (uploadedDownloadPath) {
          cleanupTasks.push(removePhotoObject(supabase, PHOTO_DOWNLOAD_BUCKET, uploadedDownloadPath));
        }
        if (uploadedThumbnailPath) {
          cleanupTasks.push(removePhotoObject(supabase, "thumbnails", uploadedThumbnailPath));
        }
        const results = await Promise.allSettled(cleanupTasks);
        for (const result of results) {
          if (result.status === "rejected") {
            console.error("[photo-patch cleanup]", result.reason);
          }
        }
      }
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requirePhotoUser();
    const { id } = await params;
    const { data: photo, error } = await supabase
      .from("photos")
      .select("id, image_url, download_url, thumbnail_url")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (error || !photo) throw new ApiError(404, "Foto tidak ditemukan.");
    for (const [bucket, url] of [
      ["originals", photo.image_url],
      [PHOTO_DOWNLOAD_BUCKET, photo.download_url],
      ["thumbnails", photo.thumbnail_url],
    ] as const) {
      if (!url) continue;
      const path = extractStoragePath(url, bucket);
      if (!path || !path.startsWith(`${user.id}/`) || path.includes("..")) {
        throw new ApiError(409, "Lokasi gambar tidak valid. Hubungi pengelola.");
      }
      await removePhotoObject(supabase, bucket, path);
    }
    const { error: deleteError } = await supabase
      .from("photos")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .single();
    if (deleteError) throw new ApiError(500, "Gagal menghapus foto dari database. Silakan coba lagi.");
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
