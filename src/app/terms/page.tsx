import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan | Padustock",
  description: "Syarat dan ketentuan penggunaan layanan Padustock.",
};

export default function TermsPage() {
  return (
    <main className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="mb-12 border-b-8 border-[#111111] pb-8">
        <h1 className="font-display text-5xl md:text-7xl font-bold uppercase tracking-tighter text-[#111111] mb-6">
          Syarat & Ketentuan
        </h1>
        <p className="text-xl font-bold text-[#111111] bg-white border-4 border-[#111111] shadow-[4px_4px_0px_#111111] p-4 inline-block uppercase tracking-wide">
          Pembaruan Terakhir: 9 Juli 2026
        </p>
      </div>

      <div className="bg-white border-4 border-[#111111] shadow-[12px_12px_0px_#111111] p-8 sm:p-12 space-y-10">
        
        <section>
          <h2 className="font-bold text-2xl uppercase tracking-widest bg-[#88CCEE] border-4 border-[#111111] px-4 py-2 inline-block shadow-[4px_4px_0px_#111111] mb-6">
            1. Penerimaan Syarat
          </h2>
          <p className="text-lg font-bold text-[#111111] leading-relaxed">
            Dengan mengakses dan menggunakan platform Padustock, Anda setuju untuk terikat oleh Syarat dan Ketentuan ini. Jika Anda tidak setuju dengan bagian mana pun dari syarat ini, Anda dilarang menggunakan atau mengakses situs ini.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-2xl uppercase tracking-widest bg-[#44AA99] text-[#111111] border-4 border-[#111111] px-4 py-2 inline-block shadow-[4px_4px_0px_#111111] mb-6">
            2. Lisensi & Hak Cipta
          </h2>
          <ul className="list-disc list-inside text-lg font-bold text-[#111111] leading-relaxed space-y-3">
            <li>Kecuali dinyatakan lain, foto yang diunduh secara gratis dari Padustock dilisensikan di bawah <strong>Creative Commons (CC BY-NC-ND 4.0)</strong>.</li>
            <li>Penggunaan komersial dari materi yang diunduh secara gratis sangat dilarang tanpa izin eksplisit atau pembelian lisensi dari fotografer terkait melalui platform microstock eksternal mereka.</li>
            <li>Hak cipta asli tetap menjadi milik fotografer (kreator).</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-2xl uppercase tracking-widest bg-[#CC6677] text-white border-4 border-[#111111] px-4 py-2 inline-block shadow-[4px_4px_0px_#111111] mb-6">
            3. Tanggung Jawab Pengunggah
          </h2>
          <p className="text-lg font-bold text-[#111111] leading-relaxed mb-4">
            Bagi pengguna yang mengunggah karya ke Padustock:
          </p>
          <ul className="list-disc list-inside text-lg font-bold text-[#111111] leading-relaxed space-y-3 bg-[#E5E5E5] border-4 border-[#111111] p-6 shadow-[6px_6px_0px_#111111]">
            <li>Anda menjamin bahwa Anda adalah pemilik sah dari foto yang diunggah.</li>
            <li>Anda bertanggung jawab penuh atas subjek di dalam foto (termasuk <em>model release</em> atau <em>property release</em> jika diperlukan).</li>
            <li>Padustock berhak menghapus konten yang melanggar hak cipta pihak ketiga atau dianggap tidak pantas tanpa pemberitahuan sebelumnya.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-2xl uppercase tracking-widest bg-[#E5E5E5] border-4 border-[#111111] px-4 py-2 inline-block shadow-[4px_4px_0px_#111111] mb-6">
            4. Batasan Tanggung Jawab
          </h2>
          <p className="text-lg font-bold text-[#111111] leading-relaxed">
            Padustock dan pengelola Desa Padusan tidak bertanggung jawab atas kerugian langsung, tidak langsung, atau konsekuensial yang timbul dari penggunaan atau ketidakmampuan menggunakan materi di platform ini. Pengguna mengunduh dan menggunakan aset dengan risiko sendiri.
          </p>
        </section>

      </div>
    </main>
  );
}