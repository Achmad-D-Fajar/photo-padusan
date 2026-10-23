function responseError(response: Response, message: string): Error {
  const detail = response.status === 401
    ? "Sesi telah berakhir. Silakan login kembali."
    : response.status === 404 || response.status === 405
      ? "Layanan unggahan belum tersedia. Muat ulang halaman dan coba lagi."
      : response.status === 413
        ? "Permintaan ditolak karena terlalu besar."
        : response.status === 504
          ? "Server terlalu lama merespons. Silakan coba lagi."
          : "Server mengirim respons yang tidak valid. Silakan coba lagi.";
  return new Error(`${message} ${detail} (HTTP ${response.status}).`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A proxy, deployment failure, or expired session may return HTML/plain text
// before the route handler can produce its normal JSON response.
export async function readPhotoApiData<T>(response: Response, message: string): Promise<T> {
  let result: unknown;
  try {
    result = JSON.parse(await response.text());
  } catch {
    throw responseError(response, message);
  }
  if (!response.ok || !isRecord(result) || result.success !== true) {
    if (isRecord(result) && typeof result.error === "string" && result.error.trim()) {
      throw new Error(`${message} ${result.error} (HTTP ${response.status}).`);
    }
    throw responseError(response, message);
  }
  if (!("data" in result) || !isRecord(result.data)) throw responseError(response, message);
  return result.data as T;
}

export async function readPhotoPreview(response: Response): Promise<Blob> {
  const message = "Gagal membuat pratinjau gambar.";
  if (!response.ok) {
    await readPhotoApiData(response, message);
    throw responseError(response, message);
  }
  // A followed login redirect or an HTML error page must not become a broken
  // object URL, even when the final response status is 200.
  if (response.headers.get("content-type")?.split(";")[0].trim() !== "image/jpeg") {
    throw responseError(response, message);
  }
  const image = await response.blob();
  if (image.size === 0) throw responseError(response, message);
  return image;
}

export function storageUploadError(error: unknown): Error {
  const message = error instanceof Error ? error.message : "";
  // storage-js also calls Response.json() internally for successful uploads.
  // Keep its parser errors from leaking into the form when a proxy returns text.
  if (error instanceof SyntaxError || /JSON\.parse|Unexpected (?:token|character|end)|JSON (?:input|data)/i.test(message)) {
    return new Error("Gagal mengunggah gambar ke penyimpanan. Server penyimpanan mengirim respons yang tidak valid. Silakan coba lagi.");
  }
  return new Error(`Gagal mengunggah gambar ke penyimpanan.${message ? ` ${message}` : " Silakan coba lagi."}`);
}
