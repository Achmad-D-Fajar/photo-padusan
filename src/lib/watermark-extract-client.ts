import { createClient } from "@/lib/supabase/client";
import { PHOTO_UPLOAD_BUCKET } from "@/lib/photo-upload";
import { readPhotoApiData, storageUploadError } from "@/lib/photo-api";
import { ExtractFailureError } from "@/components/dashboard/ExtractForm";
import type { ExtractedPayload } from "@/components/dashboard/ExtractionResult";

async function discardStagedUpload(path: string) {
  await fetch("/api/photos/upload", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
    keepalive: true,
  }).catch(() => undefined);
}

// Stages the selected image into the user's private photo-uploads bucket via the
// existing signed-upload flow, invokes POST /api/photos/extract (which uses the
// shared watermark core and cleans up the temporary file in finally), attempts
// best-effort client cleanup on unsuccessful responses, and surfaces explicit
// Indonesian extraction errors.
export async function extractPhotoWatermark(file: File): Promise<ExtractedPayload> {
  let staged: { path: string; token: string; contentType: string };
  try {
    const prepResponse = await fetch("/api/photos/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
    });
    staged = await readPhotoApiData<{ path: string; token: string; contentType: string }>(
      prepResponse,
      "Gagal menyiapkan ekstraksi."
    );
  } catch (error) {
    throw new ExtractFailureError(
      error instanceof Error ? error.message : "Gagal menyiapkan ekstraksi."
    );
  }

  try {
    const supabase = createClient();
    const upload = new Blob([file], { type: staged.contentType });
    const { error } = await supabase.storage
      .from(PHOTO_UPLOAD_BUCKET)
      .uploadToSignedUrl(staged.path, staged.token, upload, { contentType: staged.contentType });
    if (error) throw error;
  } catch (error) {
    await discardStagedUpload(staged.path);
    throw new ExtractFailureError(storageUploadError(error).message);
  }

  let succeeded = false;
  try {
    let extractResponse: Response;
    try {
      extractResponse = await fetch("/api/photos/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: staged.path }),
      });
    } catch {
      throw new ExtractFailureError("Gagal menghubungi layanan ekstraksi. Periksa koneksi lalu coba lagi.");
    }

    const rawText = await extractResponse.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const synthetic = new Response(rawText, {
        status: extractResponse.status,
        headers: extractResponse.headers,
      });
      try {
        await readPhotoApiData(synthetic, "Ekstraksi gagal.");
      } catch (error) {
        throw new ExtractFailureError(error instanceof Error ? error.message : "Ekstraksi gagal.");
      }
      throw new ExtractFailureError("Ekstraksi gagal. Server mengirim respons yang tidak valid.");
    }

    const record =
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;

    if (!extractResponse.ok || !record || record.success !== true) {
      if (record && typeof record.error === "string" && record.error.trim()) {
        throw new ExtractFailureError(record.error);
      }
      if (extractResponse.status === 401) {
        throw new ExtractFailureError("Sesi telah berakhir. Silakan login kembali.");
      }
      throw new ExtractFailureError("Ekstraksi gagal. Coba lagi atau pilih gambar lain.");
    }

    const data =
      typeof record.data === "object" && record.data !== null && !Array.isArray(record.data)
        ? (record.data as Record<string, unknown>)
        : null;

    if (!data || typeof data.payload !== "string" || !Number.isSafeInteger(data.byteLength)) {
      throw new ExtractFailureError("Hasil ekstraksi tidak valid. Coba lagi atau pilih gambar lain.");
    }

    succeeded = true;
    return { payload: data.payload, byteLength: data.byteLength as number };
  } finally {
    if (!succeeded) {
      await discardStagedUpload(staged.path);
    }
  }
}
