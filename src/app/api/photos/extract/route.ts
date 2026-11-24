import { NextRequest, NextResponse } from "next/server";
import { requirePhotoUser, readStagedPhoto, removeStagedPhoto } from "@/lib/server/photo-upload";
import { ApiError, apiErrorResponse, readJson } from "@/lib/server/api-error";
import { isOwnedUploadPath } from "@/lib/photo-upload";
import {
  WatermarkCryptoError,
  decryptPacket,
  formatCertificateText,
  getWatermarkSecretKey,
  isEncryptedWatermarkPacket,
} from "@/lib/server/watermark-crypto";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requirePhotoUser();
    const body = await readJson(request);
    const path = body.path;
    if (!isOwnedUploadPath(path, user.id)) {
      throw new ApiError(400, "Lokasi unggahan tidak valid.");
    }

    try {
      const rawBuffer = await readStagedPhoto(supabase, user.id, path);

      // Load inside the authenticated request's error boundary so a missing
      // native sharp/libvips library returns a clean 503 JSON error.
      let core: typeof import("@/lib/watermark/core");
      let imageProcessing: typeof import("@/lib/server/image-processing");
      try {
        [core, imageProcessing] = await Promise.all([
          import("@/lib/watermark/core"),
          import("@/lib/server/image-processing"),
        ]);
      } catch (error) {
        console.error("[photo-extract:load]", error);
        throw new ApiError(503, "Pemroses gambar belum tersedia. Silakan coba lagi nanti.");
      }

      try {
        const extracted = await core.extractWatermark(rawBuffer);

        if (!isEncryptedWatermarkPacket(extracted.payload)) {
          return NextResponse.json(
            {
              success: false,
              code: "UNAUTHENTICATED_PAYLOAD",
              error:
                "Watermark ditemukan tetapi tidak terenkripsi atau tidak terautentikasi oleh server Padustock.",
            },
            { status: 422 },
          );
        }

        const secretKey = getWatermarkSecretKey();
        const { certificate, packetBytes } = await decryptPacket(
          Buffer.from(
            extracted.payload.buffer,
            extracted.payload.byteOffset,
            extracted.payload.byteLength,
          ),
          secretKey,
        );

        const actualHash = await imageProcessing.computeNormalizedImageHash(rawBuffer);
        const hashMatch = imageProcessing.isNormalizedImageHashMatch(certificate.image_hash, actualHash);
        const payloadText = formatCertificateText(certificate);

        return NextResponse.json({
          success: true,
          data: {
            authenticated: true,
            payload: payloadText,
            byteLength: Buffer.byteLength(payloadText, "utf8"),
            packetBytes,
            certificate,
            hashMatch,
            version: extracted.version,
            profile: extracted.profile,
          },
        });
      } catch (error) {
        if (error instanceof core.WatermarkError) {
          return NextResponse.json(
            { success: false, code: error.code, error: error.message },
            { status: 422 },
          );
        }
        if (error instanceof WatermarkCryptoError) {
          if (error.code === "KEY_UNAVAILABLE") {
            return NextResponse.json(
              { success: false, code: error.code, error: error.message },
              { status: 503 },
            );
          }
          return NextResponse.json(
            { success: false, code: error.code, error: error.message },
            { status: 422 },
          );
        }
        throw error;
      }
    } finally {
      await removeStagedPhoto(supabase, user.id, path).catch(cleanupError => {
        console.error("[extract cleanup]", cleanupError);
      });
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
