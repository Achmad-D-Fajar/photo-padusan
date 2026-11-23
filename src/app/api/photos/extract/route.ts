import { NextRequest, NextResponse } from "next/server";
import { requirePhotoUser, readStagedPhoto, removeStagedPhoto } from "@/lib/server/photo-upload";
import { ApiError, apiErrorResponse, readJson } from "@/lib/server/api-error";
import { isOwnedUploadPath } from "@/lib/photo-upload";

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
      try {
        core = await import("@/lib/watermark/core");
      } catch (error) {
        console.error("[photo-extract:load]", error);
        throw new ApiError(503, "Pemroses gambar belum tersedia. Silakan coba lagi nanti.");
      }

      try {
        const result = await core.extractWatermarkText(rawBuffer);
        return NextResponse.json({
          success: true,
          data: {
            payload: result.payload,
            byteLength: result.byteLength,
            version: result.version,
            profile: result.profile,
          },
        });
      } catch (error) {
        if (error instanceof core.WatermarkError) {
          return NextResponse.json(
            { success: false, code: error.code, error: error.message },
            { status: 422 }
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
