import type { ExtractionOutcome } from "@/components/dashboard/ExtractionResult";

// Adapter ekstraksi NYATA: memanggil /api/photos/verify (ekstraksi paket DCT +
// dekripsi AES-256-GCM di server). Menggantikan simulasi nama file capstoneDemo.
export async function extractRealPayload(file: File, passphrase?: string): Promise<ExtractionOutcome> {
  const form = new FormData();
  form.append("file", file);
  form.append("passphrase", passphrase ?? "");
  const response = await fetch("/api/photos/verify", { method: "POST", body: form });
  const body = await response.json().catch(() => null) as {
    success?: boolean; code?: string; error?: string;
    data?: { certificate: Record<string, unknown>; hashMatch: boolean };
  } | null;
  if (!response.ok || !body?.success || !body.data) {
    if (body?.code === "not-found") return { detected: false };
    throw new Error(body?.error ?? "Ekstraksi gagal. Coba lagi atau pilih gambar lain.");
  }
  const payload = JSON.stringify(body.data.certificate, null, 2);
  return {
    payload,
    byteLength: new TextEncoder().encode(payload).byteLength,
    note: body.data.hashMatch
      ? "Hash gambar cocok — gambar belum berubah sejak watermark dipasang."
      : "Hash gambar tidak cocok — gambar telah berubah (mis. kompresi JPEG), tetapi sertifikat tetap sah menurut tag autentikasi GCM.",
  };
}