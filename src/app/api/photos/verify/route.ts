import { NextRequest, NextResponse } from "next/server";
import { verifyImageWatermark } from "@/lib/server/watermark-image";
import { WatermarkNotFoundError } from "@/lib/server/watermark-dct";
import { WatermarkCryptoError } from "@/lib/server/watermark-crypto";
import { ApiError, apiErrorResponse } from "@/lib/server/api-error";
import { MAX_PHOTO_SIZE, MAX_PHOTO_SIZE_MB } from "@/lib/photo-upload";

export const runtime = "nodejs";
export const maxDuration = 120;

// Alur pemulihan/publik (spesifikasi §3 & §11): unggah foto sengketa + passphrase
// → ekstrak paket DCT → verifikasi tag AES-256-GCM → sertifikat + status hash.
// Tanpa autentikasi: siapa pun boleh membuktikan kepemilikan, tetapi hanya
// pemegang passphrase asli yang bisa membuka sertifikat.
export async function POST(request: NextRequest) {
  try {
    let form: FormData;
    try { form = await request.formData(); } catch { throw new ApiError(400, "Permintaan harus berupa formulir multipart (file + passphrase)."); }
    const file = form.get("file");
    const passphrase = form.get("passphrase");
    if (!(file instanceof File) || file.size === 0) throw new ApiError(400, "Berkas foto sengketa wajib diunggah.");
    if (file.size > MAX_PHOTO_SIZE) throw new ApiError(413, `Ukuran file maksimal ${MAX_PHOTO_SIZE_MB} MB.`);
    if (typeof passphrase !== "string" || passphrase.length < 8 || passphrase.length > 128) {
      throw new ApiError(400, "Passphrase harus sepanjang 8–128 karakter.");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const result = await verifyImageWatermark(buffer, passphrase);
      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      if (error instanceof WatermarkNotFoundError) throw new ApiError(422, error.message);
      if (error instanceof WatermarkCryptoError) throw new ApiError(422, error.message);
      throw error;
    }
  } catch (error) { return apiErrorResponse(error); }
}