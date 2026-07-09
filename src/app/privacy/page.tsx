import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kebijakan Privasi | Padustock",
  description: "Kebijakan privasi pengumpulan dan penggunaan data di Padustock.",
};

export default function PrivacyPage() {
  return (
    <main className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="mb-12 border-b-8 border-[#111111] pb-8">
        <h1 className="font-display text-5xl md:text-7xl font-bold uppercase tracking-tighter text-[#111111] mb-6">
          Kebijakan Privasi
        </h1>
        <p className="text-xl font-bold text-[#111111] bg-white border-4 border-[#111111] shadow-[4px_4px_0px_#111111] p-4 inline-block uppercase tracking-wide">
          Pembaruan Terakhir: 9 Juli 2026
        </p>
      </div>

      <div className="bg-[#E5E5E5] border-4 border-[#111111] shadow-[12px_12px_0px_#111111] p-8 sm:p-12 space-y-10">
        
        <section>
          <h2 className="font-bold text-2xl uppercase tracking-widest bg-white border-4 border-[#111111] px-4 py-2 inline-block shadow-[4px_4px_0px_#111111] mb-6">
            1. Pengumpulan Data
          </h2>
          <p className="text-lg font-bold text-[#111111] leading-relaxed">
            Ketika Anda mendaftar atau masuk menggunakan akun Google, kami mengumpulkan data profil dasar yang diberikan oleh penyedia layanan autentikasi, termasuk:
          </p>
          <ul className="list-disc list-inside text-lg font-bold text-[#111111] leading-relaxed mt-4 space-y-2">
            <li>Alamat Email</li>
            <li>Nama Lengkap / Nama Tampilan</li>
            <li>Foto Profil (Avatar)</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-2xl uppercase tracking-widest bg-white border-4 border-[#111111] px-4 py-2 inline-block shadow-[4px_4px_0px_#111111] mb-6">
            2. Penggunaan Data
          </h2>
          <p className="text-lg font-bold text-[#111111] leading-relaxed">
            Data yang kami kumpulkan semata-mata digunakan untuk:
          </p>
          <ul className="list-disc list-inside text-lg font-bold text-[#111111] leading-relaxed mt-4 space-y-2 bg-[#88CCEE] border-4 border-[#111111] p-6 shadow-[6px_6px_0px_#111111]">
            <li>Membangun profil publik Anda sebagai fotografer di platform kami.</li>
            <li>Mengaitkan dan memberikan atribusi hak cipta pada foto yang Anda unggah.</li>
            <li>Mengamankan akun Anda dari aktivitas yang tidak sah.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-2xl uppercase tracking-widest bg-white border-4 border-[#111111] px-4 py-2 inline-block shadow-[4px_4px_0px_#111111] mb-6">
            3. Pihak Ketiga & Infrastruktur
          </h2>
          <p className="text-lg font-bold text-[#111111] leading-relaxed mb-4">
            Kami tidak pernah menjual data pribadi Anda. Namun, data Anda disimpan secara aman melalui layanan infrastruktur pihak ketiga:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border-4 border-[#111111] p-4 shadow-[4px_4px_0px_#111111]">
              <p className="font-bold uppercase tracking-wider text-[#332288]">Supabase</p>
              <p className="font-bold text-sm mt-1">Sebagai penyedia autentikasi, database, dan penyimpanan file utama.</p>
            </div>
            <div className="bg-white border-4 border-[#111111] p-4 shadow-[4px_4px_0px_#111111]">
              <p className="font-bold uppercase tracking-wider text-[#332288]">Google Auth</p>
              <p className="font-bold text-sm mt-1">Sebagai protokol masuk (Single Sign-On).</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-bold text-2xl uppercase tracking-widest bg-[#111111] text-[#E5E5E5] border-4 border-[#111111] px-4 py-2 inline-block shadow-[4px_4px_0px_#111111] mb-6">
            4. Hak Pengguna
          </h2>
          <p className="text-lg font-bold text-[#111111] leading-relaxed">
            Anda berhak mengubah informasi profil publik Anda kapan saja melalui halaman Pengaturan Dasbor. Jika Anda ingin menghapus akun beserta seluruh foto Anda dari database kami secara permanen, silakan hubungi pengelola platform.
          </p>
        </section>

      </div>
    </main>
  );
}