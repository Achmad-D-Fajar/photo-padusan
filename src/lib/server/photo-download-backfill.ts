// SERVER-ONLY. Operator backfill helper for generating versioned full-resolution
// free-download copies in `photo-downloads` without modifying private `originals`
// or `photo_license_history`.
import crypto from "node:crypto";
import {
  DOWNLOAD_WATERMARK_VERSION_NONE,
  DOWNLOAD_WATERMARK_VERSION_PLACEHOLDER,
  MAX_PHOTO_SIZE,
  PHOTO_DOWNLOAD_BUCKET,
} from "@/lib/photo-upload";
import { LEGAL_DOCUMENTS, hasAuthorizedTermsAcceptance } from "@/lib/legal-documents";
import { externalLicenseLink } from "@/lib/photo-licensing";
import { extractStoragePath } from "@/lib/storage";
import { createWatermarkedDownloadCopy } from "@/lib/server/image-processing";
import { prepareWatermarkPayloadBytes } from "@/lib/server/watermark-bytes";

export { hasAuthorizedTermsAcceptance };

export interface BackfillPhotoRow {
  id: string;
  user_id: string | null;
  image_url: string | null;
  download_url: string | null;
  watermark_enabled: boolean | null;
  download_watermark_version: string | null;
  status: "draft" | "published" | "archived";
  microstock_url: string | null;
}

export interface BackfillAuthUser {
  id: string;
  app_metadata?: Record<string, unknown> | null;
}

export interface BackfillStorageBucket {
  info(path: string): Promise<{ data: { size?: number } | null; error: { message: string } | null }>;
  download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
  upload(path: string, body: Buffer, options: { contentType: string; upsert: boolean }): Promise<{ error: { message: string } | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
}

export interface BackfillAdminAdapter {
  listPublishedPhotos(): Promise<BackfillPhotoRow[]>;
  getAuthUser(userId: string): Promise<BackfillAuthUser | null>;
  storageFrom(bucket: string): BackfillStorageBucket;
  updatePhotoDownload(
    photoId: string,
    userId: string,
    fields: { download_url: string; download_watermark_version: string }
  ): Promise<{ error: { message: string } | null }>;
}

export type BackfillOutcomeStatus =
  | "eligible"
  | "updated"
  | "skipped_not_free"
  | "skipped_already_current"
  | "skipped_unknown_preference"
  | "skipped_unauthorized_terms"
  | "failed";

export interface BackfillItemReport {
  photoId: string;
  status: BackfillOutcomeStatus;
  reason?: string;
  targetVersion?: string;
}

export interface BackfillSummary {
  mode: "dry-run" | "apply";
  requiredTermsVersion: string;
  termsPublishedOn: string | null;
  targetWatermarkVersion: string;
  regenerateVersion: string | null;
  counts: Record<BackfillOutcomeStatus, number>;
  items: BackfillItemReport[];
}

export interface BackfillOptions {
  apply?: boolean;
  requiredTermsVersion?: string;
  targetWatermarkVersion?: string;
  regenerateVersion?: string | null;
  resolvePayload?: (photo: BackfillPhotoRow) => Promise<Uint8Array> | Uint8Array;
  createDownloadCopy?: typeof createWatermarkedDownloadCopy;
}

export async function runPhotoDownloadBackfill(
  adapter: BackfillAdminAdapter,
  options: BackfillOptions = {}
): Promise<BackfillSummary> {
  const apply = options.apply === true;
  const requiredTermsVersion = options.requiredTermsVersion ?? LEGAL_DOCUMENTS.terms.version;
  if (apply) {
    if (requiredTermsVersion !== LEGAL_DOCUMENTS.terms.version) {
      throw new Error(
        `Refusing --apply: requiredTermsVersion ('${requiredTermsVersion}') must match current LEGAL_DOCUMENTS.terms.version ('${LEGAL_DOCUMENTS.terms.version}').`,
      );
    }
    if (LEGAL_DOCUMENTS.terms.publishedOn === null || LEGAL_DOCUMENTS.privacy.publishedOn === null) {
      throw new Error(
        `Refusing --apply: LEGAL_DOCUMENTS.terms (${LEGAL_DOCUMENTS.terms.version}) or privacy (${LEGAL_DOCUMENTS.privacy.version}) has publishedOn=null. Publish the updated legal documents first before applying backfill.`,
      );
    }
  }
  const targetWatermarkVersion = options.targetWatermarkVersion ?? DOWNLOAD_WATERMARK_VERSION_PLACEHOLDER;
  const regenerateVersion = options.regenerateVersion ?? null;
  const createDownloadCopy = options.createDownloadCopy ?? createWatermarkedDownloadCopy;
  const resolvePayload =
    options.resolvePayload ??
    (async (photo: BackfillPhotoRow) => {
      const prepared = await prepareWatermarkPayloadBytes({
        photoId: photo.id,
        userId: photo.user_id ?? "",
      });
      return prepared.payloadBytes;
    });

  const counts: Record<BackfillOutcomeStatus, number> = {
    eligible: 0,
    updated: 0,
    skipped_not_free: 0,
    skipped_already_current: 0,
    skipped_unknown_preference: 0,
    skipped_unauthorized_terms: 0,
    failed: 0,
  };
  const items: BackfillItemReport[] = [];
  const authCache = new Map<string, BackfillAuthUser | null>();

  async function getCachedAuthUser(userId: string): Promise<BackfillAuthUser | null> {
    if (!authCache.has(userId)) {
      authCache.set(userId, await adapter.getAuthUser(userId));
    }
    return authCache.get(userId) ?? null;
  }

  function record(item: BackfillItemReport) {
    counts[item.status]++;
    items.push(item);
  }

  const photos = await adapter.listPublishedPhotos();

  for (const photo of photos) {
    if (photo.status !== "published" || externalLicenseLink(photo.microstock_url)) {
      record({ photoId: photo.id, status: "skipped_not_free", reason: "Not a published free photo." });
      continue;
    }

    if (!photo.user_id) {
      record({ photoId: photo.id, status: "failed", reason: "Missing owner user_id." });
      continue;
    }

    // Check idempotency before authorization/processing: already-current photos need no action.
    if (photo.download_url) {
      const needsRegen =
        regenerateVersion !== null && photo.download_watermark_version === regenerateVersion;
      if (!needsRegen) {
        record({
          photoId: photo.id,
          status: "skipped_already_current",
          reason: `Already has download_url (version: ${photo.download_watermark_version ?? "unversioned"}).`,
        });
        continue;
      }
    }

    // Never treat missing watermark_enabled (NULL) as consent or opt-out.
    if (typeof photo.watermark_enabled !== "boolean") {
      record({
        photoId: photo.id,
        status: "skipped_unknown_preference",
        reason: "watermark_enabled is NULL/unknown; refusing to infer consent or opt-out.",
      });
      continue;
    }

    // Require explicit legal acknowledgment of the current terms and privacy versions before processing.
    const authUser = await getCachedAuthUser(photo.user_id);
    if (!hasAuthorizedTermsAcceptance(authUser, requiredTermsVersion, LEGAL_DOCUMENTS.privacy.version)) {
      record({
        photoId: photo.id,
        status: "skipped_unauthorized_terms",
        reason: `Owner lacks accepted legal_acknowledgment for terms '${requiredTermsVersion}' and privacy '${LEGAL_DOCUMENTS.privacy.version}'.`,
      });
      continue;
    }

    const desiredVersion = photo.watermark_enabled
      ? targetWatermarkVersion
      : DOWNLOAD_WATERMARK_VERSION_NONE;

    if (!apply) {
      record({
        photoId: photo.id,
        status: "eligible",
        targetVersion: desiredVersion,
        reason: photo.download_url
          ? `Would regenerate ${photo.download_watermark_version} -> ${desiredVersion}.`
          : `Would generate ${desiredVersion} download copy.`,
      });
      continue;
    }

    const sourcePath = photo.image_url ? extractStoragePath(photo.image_url, "originals") : null;
    if (!sourcePath || !sourcePath.startsWith(`${photo.user_id}/`) || sourcePath.includes("..")) {
      record({ photoId: photo.id, status: "failed", reason: "Invalid private originals path." });
      continue;
    }

    const previousDownloadPath = photo.download_url
      ? extractStoragePath(photo.download_url, PHOTO_DOWNLOAD_BUCKET)
      : null;

    let uploadedPath: string | null = null;
    let committed = false;

    try {
      const originals = adapter.storageFrom("originals");
      const { data: info, error: infoErr } = await originals.info(sourcePath);
      if (infoErr || !info) {
        throw new Error(`Original not found: ${infoErr?.message ?? "missing"}`);
      }
      if (typeof info.size !== "number" || info.size <= 0 || info.size > MAX_PHOTO_SIZE) {
        throw new Error("Original size out of bounds (1 B .. 50 MiB).");
      }
      const { data: blob, error: dlErr } = await originals.download(sourcePath);
      if (dlErr || !blob) {
        throw new Error(`Failed reading original: ${dlErr?.message ?? "empty"}`);
      }
      const rawBuffer = Buffer.from(await blob.arrayBuffer());

      const payload = photo.watermark_enabled ? await resolvePayload(photo) : null;
      const { downloadBuffer } = await createDownloadCopy(rawBuffer, payload);

      const safeVersion = desiredVersion.replace(/[^a-z0-9_-]/gi, "-");
      const suffix = crypto.randomBytes(4).toString("hex");
      const nextPath = `${photo.user_id}/download_${photo.id}_${safeVersion}_${suffix}.jpg`;

      const downloads = adapter.storageFrom(PHOTO_DOWNLOAD_BUCKET);
      const { error: upErr } = await downloads.upload(nextPath, downloadBuffer, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (upErr) {
        throw new Error(`Failed uploading download copy: ${upErr.message}`);
      }
      uploadedPath = nextPath;
      const { data: { publicUrl: nextDownloadUrl } } = downloads.getPublicUrl(nextPath);

      const { error: dbErr } = await adapter.updatePhotoDownload(photo.id, photo.user_id, {
        download_url: nextDownloadUrl,
        download_watermark_version: desiredVersion,
      });
      if (dbErr) {
        throw new Error(`Failed updating photos row: ${dbErr.message}`);
      }
      committed = true;

      // Best-effort cleanup of superseded download copy after DB update commits.
      if (
        previousDownloadPath &&
        previousDownloadPath !== nextPath &&
        previousDownloadPath.startsWith(`${photo.user_id}/`) &&
        !previousDownloadPath.includes("..")
      ) {
        await downloads.remove([previousDownloadPath]).catch(() => undefined);
      }

      record({
        photoId: photo.id,
        status: "updated",
        targetVersion: desiredVersion,
      });
    } catch (error) {
      if (!committed && uploadedPath) {
        await adapter.storageFrom(PHOTO_DOWNLOAD_BUCKET).remove([uploadedPath]).catch(() => undefined);
      }
      record({
        photoId: photo.id,
        status: "failed",
        reason: error instanceof Error ? error.message : "Unexpected backfill error.",
      });
    }
  }

  return {
    mode: apply ? "apply" : "dry-run",
    requiredTermsVersion,
    termsPublishedOn: LEGAL_DOCUMENTS.terms.publishedOn,
    targetWatermarkVersion,
    regenerateVersion,
    counts,
    items,
  };
}
