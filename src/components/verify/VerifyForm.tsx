"use client";

import { useRef, useState } from "react";
import { MAX_PHOTO_SIZE_MB, PHOTO_ACCEPT, validatePhotoFile } from "@/lib/photo-upload";

interface VerifyCertificate {
  protocol: string;
  photo_id: string;
  photographer: string;
  license_terms: string;
  creation_timestamp: string;
  image_hash: string;
  server_signature: string;
  site_origin: string;
}

interface VerifyData {
  certificate: VerifyCertificate;
  hashMatch: boolean;
  packetBytes: number;
  width: number;
  height: number;
}

type Phase = "idle" | "checking" | "success" | "error";

export default function VerifyForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<VerifyData | null>(null);

  const inputClass = "file-input file-input-bordered w-full rounded-none border-4 border-[#111111] bg-white text-[#111111] text-lg font-bold h-16 shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99]";
  const textInputClass = "input input-bordered w-full rounded-none border-4 border-[#111111] bg-white text-[#111111] text-lg font-bold shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99] p-4 h-auto";
  const labelClass = "label-text font-bold text-xl text-[#111111] uppercase tracking-wide whitespace-normal break-words";
  const subLabelClass = "label-text-alt font-bold text-[#111111] text-base whitespace-normal break-words";
  const primaryBtnClass = "btn bg-[#117733] hover:bg-[#0e5c27] text-[#E5E5E5] border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-16 shadow-[6px_6px_0px_#111111] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_#111111] transition-all";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setPhase("idle"); setErrorMessage(""); setResult(null);
    if (!selected) { setFile(null); return; }
    const validationError = validatePhotoFile(selected);
    if (validationError) { setFile(null); setErrorMessage(validationError); if (fileInputRef.current) fileInputRef.current.value = ""; return; }
    setFile(selected);
  }

  async function handleVerify() {
    if (!file) { setErrorMessage("Pilih berkas foto sengketa terlebih dahulu."); return; }
    if (passphrase.length < 8) { setErrorMessage("Passphrase minimal 8 karakter."); return; }
    setPhase("checking"); setErrorMessage(""); setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("passphrase", passphrase);
      const res = await fetch("/api/photos/verify", { method: "POST", body: form });
      const body = await res.json().catch(() => null) as { success?: boolean; data?: VerifyData; error?: string } | null;
      if (!res.ok || !body?.success || !body.data) {
        throw new Error(body?.error ?? "Verifikasi gagal. Silakan coba lagi.");
      }
      setResult(body.data);
      setPhase("success");
    } catch (error) {
      setPhase("error");
      setErrorMessage(error instanceof Error ? error.message : "Verifikasi gagal. Silakan coba lagi.");
    }
  }

  const isBusy = phase === "checking";

  return (
    <div className="space-y-8">
      <div className="card bg-white border-4 border-[#111111] shadow-[12px_12px_0px_#111111] rounded-none p-4 sm:p-8">
        <div className="card-body gap-8 p-0">
          <div className="form-control">
            <label className="label items-start p-0 mb-2" htmlFor="verify-file">
              <span className={labelClass}>Foto sengketa (maks. {MAX_PHOTO_SIZE_MB} MB)</span>
            </label>
            <input id="verify-file" ref={fileInputRef} type="file" accept={PHOTO_ACCEPT} onChange={handleFileChange} className={inputClass} disabled={isBusy} />
            <label className="label p-0 mt-2"><span className={subLabelClass}>Unggah foto yang diduga dicuri. Gunakan berkas resolusi asli dari Padustock untuk hasil terbaik.</span></label>
          </div>

          <div className="form-control">
            <label className="label items-start p-0 mb-2" htmlFor="verify-passphrase"><span className={labelClass}>Passphrase fotografer asli</span></label>
            <input id="verify-passphrase" type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value.slice(0, 128))} className={textInputClass} placeholder="Passphrase yang dibuat saat unggah" disabled={isBusy} autoComplete="off" />
            <label className="label p-0 mt-2"><span className={subLabelClass}>Tanpa passphrase yang benar, sertifikat tidak bisa dibuka — inilah bukti kriptografis kepemilikan.</span></label>
          </div>

          <button type="button" onClick={handleVerify} className={primaryBtnClass} disabled={!file || isBusy}>
            {isBusy ? "MEMERIKSA WATERMARK..." : "BUKTIKAN KEPEMILIKAN"}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className="alert rounded-none border-4 border-[#111111] bg-[#882255] text-white font-bold text-lg p-6 shadow-[6px_6px_0px_#111111]">
          <span>{errorMessage}</span>
        </div>
      )}

      {phase === "success" && result && (
        <div className="card bg-white border-4 border-[#111111] shadow-[12px_12px_0px_#111111] rounded-none p-4 sm:p-8">
          <div className="card-body gap-6 p-0">
            <h2 className="font-display font-bold text-3xl uppercase text-[#117733] border-b-4 border-[#111111] pb-4">Hak Cipta Sah Terbukti</h2>
            <p className="text-lg font-bold text-[#111111]">Tag autentikasi AES-256-GCM valid — sertifikat dibuka dengan passphrase yang benar dan tidak dimanipulasi.</p>

            <div className={result.hashMatch
              ? "bg-[#117733] text-white border-4 border-[#111111] p-4 font-bold text-lg shadow-[4px_4px_0px_#111111]"
              : "bg-[#EECC33] text-[#111111] border-4 border-[#111111] p-4 font-bold text-lg shadow-[4px_4px_0px_#111111]"}>
              {result.hashMatch
                ? "HASH FOTO COCOK — piksel identik dengan arsip asli Padustock."
                : "HASH FOTO TIDAK COCOK — foto telah dikompresi ulang atau dimodifikasi (mis. JPEG/media sosial). Sertifikat tetap valid secara kriptografis; bila foto ini bukan milik pengklaim, sertifikat ini membuktikan milik fotografer asli."}
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[#111111]">
              {([
                ["ID Foto", result.certificate.photo_id],
                ["Fotografer", result.certificate.photographer],
                ["Lisensi", result.certificate.license_terms],
                ["Waktu Tanam", result.certificate.creation_timestamp],
                ["Asal Situs", result.certificate.site_origin],
                ["Penanda Server", result.certificate.server_signature],
                ["Protokol", result.certificate.protocol],
                ["Ukuran Paket", `${result.packetBytes} byte (${result.width}×${result.height} px)`],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="bg-[#E5E5E5] border-4 border-[#111111] p-4 shadow-[4px_4px_0px_#111111]">
                  <dt className="font-bold uppercase text-sm tracking-wide">{label}</dt>
                  <dd className="font-bold text-lg break-all">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="bg-[#E5E5E5] border-4 border-[#111111] p-4 shadow-[4px_4px_0px_#111111]">
              <p className="font-bold uppercase text-sm tracking-wide text-[#111111]">Image Hash (SHA-256 ternormalisasi)</p>
              <p className="font-mono text-sm break-all text-[#111111]">{result.certificate.image_hash}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}