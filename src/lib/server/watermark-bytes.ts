// SERVER-ONLY. Single payload-preparation boundary for invisible watermarking.
// Builds and encrypts Wafa's AES-256-GCM + PBKDF2-HMAC-SHA256 CopyrightCertificate
// ONCE per photo using the agreed server-managed key (WATERMARK_SECRET_KEY, no
// passphrase UI field) so the exact same encrypted bytes are embedded into both
// the preview (thumbnails) and the full-resolution free-download copy (photo-downloads).
import { DOWNLOAD_WATERMARK_VERSION_ENCRYPTED } from "@/lib/photo-upload";
import { DEFAULT_WATERMARK_PAYLOAD, watermarkPayload } from "@/lib/watermark-payload";
import {
  buildCertificate,
  encryptCertificate,
  getWatermarkSecretKey,
  type CertificateLicenseMode,
  type CopyrightCertificate,
} from "./watermark-crypto";

export interface PrepareWatermarkPayloadInput {
  photoId: string;
  userId: string;
  photographer?: string;
  licenseMode?: CertificateLicenseMode;
  imageHash?: string;
  customPayload?: string;
}

export interface PreparedWatermarkPayload {
  payloadBytes: Uint8Array;
  version: string;
  certificate: CopyrightCertificate;
}

export async function prepareWatermarkPayloadBytes(
  input: PrepareWatermarkPayloadInput,
): Promise<PreparedWatermarkPayload> {
  const rawCustom = input.customPayload ?? "";
  const resolved = watermarkPayload(rawCustom);
  if (!resolved.valid) {
    throw new RangeError(
      "Payload watermark melebihi batas 512 byte UTF-8. Kurangi teks payload tanpa pemotongan otomatis.",
    );
  }
  const hasExplicitCustomText =
    rawCustom.trim().length > 0 && resolved.payload !== DEFAULT_WATERMARK_PAYLOAD;

  const secretKey = getWatermarkSecretKey();
  const certificate = buildCertificate({
    photoId: input.photoId,
    photographer: input.photographer || "Fotografer Padustock",
    licenseMode: input.licenseMode ?? "draft",
    imageHash: input.imageHash && /^[0-9a-f]{64}$/.test(input.imageHash) ? input.imageHash : "0".repeat(64),
    referencePayload: hasExplicitCustomText ? resolved.payload : undefined,
  });

  const { packet } = await encryptCertificate(certificate, secretKey);
  return {
    payloadBytes: new Uint8Array(packet.buffer, packet.byteOffset, packet.byteLength),
    version: DOWNLOAD_WATERMARK_VERSION_ENCRYPTED,
    certificate,
  };
}
