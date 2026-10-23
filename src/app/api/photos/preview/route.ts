import { NextRequest, NextResponse } from "next/server";
import { createPhotoPreview } from "@/lib/server/photo-image";
import { requirePhotoUser, readStagedPhoto, removeStagedPhoto } from "@/lib/server/photo-upload";
import { apiErrorResponse, readJson } from "@/lib/server/api-error";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requirePhotoUser();
    const { path } = await readJson(request);
    try {
      const buffer = await readStagedPhoto(supabase, user.id, path);
      const { data } = await createPhotoPreview(buffer);
      return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
    } catch (error) {
      await removeStagedPhoto(supabase, user.id, path).catch(cleanupError => console.error(cleanupError));
      throw error;
    }
  } catch (error) { return apiErrorResponse(error); }
}
