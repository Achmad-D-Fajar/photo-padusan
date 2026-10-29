"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { CC_LICENSE_URL, LEGAL_DOCUMENTS } from "@/lib/legal-documents";

type Status = "idle" | "loading" | "error";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);

  function handleDisplayNameChange(e: React.ChangeEvent<HTMLInputElement>) { setDisplayName(e.target.value.replace(/\s/g, "")); }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!acceptedLegal) { setStatus("error"); setErrorMessage("Persetujuan dokumen diperlukan untuk membuat akun."); return; }
    setStatus("loading"); setErrorMessage("");

    try {
      const registerResponse = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName, password, legalAcknowledgment: {
          accepted: acceptedLegal, termsVersion: LEGAL_DOCUMENTS.terms.version, privacyVersion: LEGAL_DOCUMENTS.privacy.version,
        } }),
      });
      const registerResult = await registerResponse.json();
      if (!registerResponse.ok || !registerResult.success) throw new Error(registerResult.error || "Registrasi gagal.");

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw new Error("Akun berhasil dibuat, tetapi gagal login otomatis. Silakan login secara manual.");

      router.push("/dashboard"); router.refresh();
    } catch (err) {
      setStatus("error"); setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan.");
    }
  }

  const inputClass = "input w-full rounded-none border-4 border-[#111111] bg-white text-[#111111] font-bold shadow-[4px_4px_0px_#111111] focus:ring-4 focus:ring-[#44AA99] h-14 text-lg";
  const labelClass = "font-bold text-sm uppercase tracking-widest text-[#111111] mb-2 block";
  const subLabelClass = "label-text-alt font-bold text-[#111111] text-sm mt-2 block bg-[#88CCEE] border-2 border-[#111111] p-2";

  return (
    <main className="container mx-auto px-4 py-16 max-w-xl">
      <div className="bg-[#E5E5E5] border-4 border-[#111111] p-8 sm:p-12 shadow-[16px_16px_0px_#111111]">
        <h1 className="font-display text-4xl font-bold uppercase tracking-tighter text-[#111111] mb-8 border-b-4 border-[#111111] pb-4">
          Daftar Fotografer
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="form-control">
            <label className="label p-0" htmlFor="email"><span className={labelClass}>Email Aktif</span></label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required disabled={status === "loading"} />
          </div>

          <div className="form-control">
            <label className="label p-0" htmlFor="displayName"><span className={labelClass}>Display Name</span></label>
            <input id="displayName" type="text" value={displayName} onChange={handleDisplayNameChange} className={inputClass} placeholder="misal: budi_photo" required minLength={3} maxLength={30} disabled={status === "loading"} />
            <span className={subLabelClass}>Tanpa spasi, 3-30 karakter (Huruf, angka, titik, strip).</span>
          </div>

          <div className="form-control">
            <label className="label p-0" htmlFor="password"><span className={labelClass}>Password Baru</span></label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} required minLength={8} disabled={status === "loading"} />
          </div>

          <div className="space-y-3 border-t-4 border-[#111111] pt-5 text-base font-bold leading-relaxed">
            <div className="flex items-start gap-3">
              <input id="legal-acknowledgment" type="checkbox" required checked={acceptedLegal} onChange={e => setAcceptedLegal(e.target.checked)} disabled={status === "loading"} className="checkbox shrink-0 rounded-none border-2 border-[#111111] mt-1" aria-labelledby="legal-acknowledgment-label" />
              <label id="legal-acknowledgment-label" htmlFor="legal-acknowledgment">Saya menyetujui <Link href={LEGAL_DOCUMENTS.terms.href} target="_blank" rel="noopener noreferrer" className="underline">Syarat & Ketentuan</Link> dan telah membaca <Link href={LEGAL_DOCUMENTS.privacy.href} target="_blank" rel="noopener noreferrer" className="underline">Kebijakan Privasi</Link>.</label>
            </div>
            <p>Publikasi gratis menggunakan <a className="underline" href={CC_LICENSE_URL} target="_blank" rel="noopener noreferrer">CC BY-NC-ND 4.0</a>. Foto dengan tautan pembelian mengikuti proses perolehan lisensi di penyedia eksternal.</p>
          </div>

          {status === "error" && (
            <div role="alert" className="alert bg-[#882255] text-white border-4 border-[#111111] rounded-none font-bold text-lg p-4 shadow-[4px_4px_0px_#111111]">
              <span>{errorMessage}</span>
            </div>
          )}

          <button type="submit" className="btn bg-[#117733] hover:bg-[#0e5c27] text-white border-4 border-[#111111] rounded-none font-bold text-xl uppercase h-16 mt-4 shadow-[6px_6px_0px_#111111] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_#111111] transition-all" disabled={status === "loading"}>
            {status === "loading" ? "Memproses..." : "BUAT AKUN SAYA"}
          </button>

          <p className="text-lg font-bold text-center text-[#111111] mt-4 border-2 border-[#111111] bg-white p-3 shadow-[4px_4px_0px_#111111]">
            Sudah punya akun?{" "}
            <a href="/login" className="text-[#332288] underline hover:bg-[#332288] hover:text-white px-2 py-1 transition-colors">
              Login
            </a>
          </p>
        </form>
      </div>
    </main>
  );
}
