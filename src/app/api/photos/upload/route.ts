import { NextRequest, NextResponse } from "next/server";
import { PHOTO_MIME_TYPES, PHOTO_UPLOAD_BUCKET, photoExtension, validatePhotoFile, isOwnedUploadPath } from "@/lib/photo-upload";
import { requirePhotoUser, removeStagedPhoto } from "@/lib/server/photo-upload";
import { ApiError, apiErrorResponse, readJson } from "@/lib/server/api-error";

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requirePhotoUser();
    const body = await readJson(request);
    const file = { name: typeof body.name === "string" ? body.name : "", type: typeof body.type === "string" ? body.type : "", size: typeof body.size === "number" ? body.size : 0 };
    const error = validatePhotoFile(file);
    if (error) throw new ApiError(400, error);
    const extension = photoExtension(file.name, file.type)!;
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { data, error: signingError } = await supabase.storage.from(PHOTO_UPLOAD_BUCKET).createSignedUploadUrl(path);
    if (signingError || !data) throw new ApiError(502, "Gagal menyiapkan unggahan.");
    return NextResponse.json({ success: true, data: { path, token: data.token, contentType: PHOTO_MIME_TYPES[extension] } });
  } catch (error) { return apiErrorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, user } = await requirePhotoUser();
    const { path } = await readJson(request);
    if (!isOwnedUploadPath(path, user.id)) throw new ApiError(400, "Lokasi unggahan tidak valid.");
    await removeStagedPhoto(supabase, user.id, path);
    return NextResponse.json({ success: true });
  } catch (error) { return apiErrorResponse(error); }
}
