import type { Metadata } from "next";
import VerifyForm from "@/components/verify/VerifyForm";

export const metadata: Metadata = {
  title: "Verifikasi Hak Cipta | Padustock - Galeri Foto Desa Padusan",
  description: "Buktikan kepemilikan foto Desa Padusan: unggah foto sengketa dan passphrase fotografer asli untuk membuka sertifikat hak cipta terenkripsi (AES-256-GCM) yang tertanam tak kasat mata pada domain frekuensi DCT.",
};

export default function VerifyPage() {
  return (
    <main className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="mb-12 border-b-8 border-[#111111] pb-8">
        <h1 className="font-display text-3xl sm:text-5xl uppercase tracking-tight break-words text-[#111111] mb-6">
          Verifikasi Hak Cipta Foto
        </h1>
        <p className="text-xl font-bold text-[#111111] bg-[#88CCEE] border-4 border-[#111111] shadow-[4px_4px_0px_#111111] p-4 inline-block uppercase tracking-wide">
          Bukti kepemilikan kriptografis — tanpa perlu percaya pada stempel visual.
        </p>
        <p className="text-lg font-bold text-[#111111] mt-6 leading-relaxed">
          Setiap foto asli Padustock dapat ditanami sertifikat hak cipta terenkripsi (AES-256-GCM + PBKDF2)
          yang tak kasat mata pada domain frekuensi DCT. Halaman ini membuka sertifikat tersebut:
          unggah foto sengketa, masukkan passphrase fotografer asli, dan sistem membuktikan kepemilikan
          secara matematis — bahkan bila stempel visual telah dihapus.
        </p>
      </div>
      <VerifyForm />
    </main>
  );
}