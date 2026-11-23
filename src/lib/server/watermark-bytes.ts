// SERVER-ONLY. Single payload-preparation boundary for invisible watermarking.
// Prepares (and, once Wafa's server-managed-key crypto module is integrated,
// encrypts) the watermark payload ONCE per photo so the exact same opaque
// bytes are embedded into both the preview and the full-resolution download copy.
import { DOWNLOAD_WATERMARK_VERSION_PLACEHOLDER } from "@/lib/photo-upload";
import { watermarkPayload } from "@/lib/watermark-payload";
import { encodeWatermarkText } from "@/lib/watermark/core";

export interface PrepareWatermarkPayloadInput {
  photoId: string;
  userId: string;
  customPayload?: string;
}

export interface PreparedWatermarkPayload {
  payloadBytes: Uint8Array;
  version: string;
}

/**
 * Resolve and encode the transient watermark payload bytes once for a photo.
 *
 * Key model (agreed decision): server-managed key with no photographer
 * passphrase field. When Wafa's crypto module is integrated, plug its
 * server-side ownership serialization + encryption here so callers receive
 * opaque encrypted bytes and embed the exact same buffer into both preview
 * and free-download derivatives without storing payload text in the database.
 */
export async function prepareWatermarkPayloadBytes(
  input: PrepareWatermarkPayloadInput,
): Promise<PreparedWatermarkPayload> {
  const resolved = watermarkPayload(input.customPayload ?? "");
  if (!resolved.valid) {
    throw new RangeError(
      "Payload watermark melebihi batas 512 byte UTF-8. Kurangi teks payload tanpa pemotongan otomatis.",
    );
  }
  return {
    payloadBytes: encodeWatermarkText(resolved.payload),
    version: DOWNLOAD_WATERMARK_VERSION_PLACEHOLDER,
  };
}
