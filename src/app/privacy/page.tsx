import type { Metadata } from "next";
import LegalDocument from "@/components/shared/LegalDocument";
import { LEGAL_DOCUMENTS, OWNERSHIP_REPORT_URL } from "@/lib/legal-documents";

export const metadata: Metadata = { title: "Kebijakan Privasi | Padustock", description: "Penggunaan data akun, profil publik, foto, layanan AI, dan riwayat lisensi di Padustock." };

export default function PrivacyPage() {
  return <LegalDocument title="Kebijakan Privasi" document={LEGAL_DOCUMENTS.privacy}>
    <section id="akun"><h2>1. Akun dan autentikasi</h2>
      <p>Pendaftaran menggunakan email, kata sandi, dan nama tampilan melalui Supabase Auth. Email autentikasi tidak ditampilkan sebagai email publik pada profil. Kata sandi diproses oleh layanan autentikasi; jangan mengirimkannya melalui kanal laporan. Padustock menggunakan kuki autentikasi untuk mempertahankan sesi dan mengakses dasbor. Saat ini tidak ada alur masuk dengan Google pada aplikasi ini.</p>
      <p>Untuk pendaftaran baru, server mencatat versi Syarat & Ketentuan, versi Kebijakan Privasi, dan waktu pernyataan persetujuan dalam metadata aplikasi akun yang dikelola admin. Catatan ini bukan bagian dari profil publik dan tidak dapat diubah melalui penyuntingan profil. Akun lama tidak diberi catatan persetujuan buatan. Fitur ini tidak menambahkan pencatatan alamat IP atau pelacakan lainnya.</p>
    </section>
    <section id="profil"><h2>2. Informasi publik dan foto</h2>
      <p>Nama tampilan, nama lengkap, bio, avatar, tautan portofolio, dan foto yang dipublikasikan dapat dilihat pengunjung. Nomor WhatsApp dan email publik hanya ditampilkan jika Anda mengisinya pada profil; alamat tersebut dapat berbeda dari email autentikasi. Jangan masukkan informasi yang tidak ingin Anda publikasikan.</p>
      <p>Kami menyimpan foto asli, pratinjau bertanda air, caption dan tag dalam bahasa Indonesia dan Inggris, status publikasi, serta tautan eksternal yang Anda berikan. Data ini digunakan untuk galeri, pencarian, atribusi, dan unduhan sesuai status publikasi.</p>
    </section>
    <section id="ai"><h2>3. Pemrosesan dengan Gemini</h2>
      <p>Jika Anda menjalankan analisis AI, pratinjau foto dan konteks yang Anda isi dikirim ke Google Gemini untuk membuat caption dan tag. Pada alur caption manual, caption dan tag bahasa Indonesia juga dikirim ke Gemini untuk diterjemahkan ke bahasa Inggris, meskipun kotak bantuan analisis AI tidak dicentang. Tahap penyuntingan menyimpan teks yang Anda pilih.</p>
      <p>Untuk membatasi penggunaan layanan AI, database menyimpan ID akun, jendela waktu, dan jumlah permintaan AI pada jendela tersebut.</p>
      <p>Jangan masukkan informasi sensitif yang tidak diperlukan dalam foto, konteks, caption, atau tag. Pemrosesan oleh penyedia mengikuti ketentuan penyedia; halaman ini tidak menjanjikan masa simpan atau penggunaan data di luar kendali Padustock.</p>
    </section>
    <section id="infrastruktur"><h2>4. Infrastruktur dan tautan eksternal</h2>
      <p>Supabase menyediakan autentikasi, database, dan penyimpanan file. Aplikasi yang diterapkan menggunakan hosting Vercel untuk menyajikan halaman dan memproses permintaan. Tautan pembelian mengarah ke penyedia eksternal yang memiliki ketentuan dan kebijakan privasinya sendiri. Padustock tidak memproses pembayaran pembelian foto pada situs ini.</p>
    </section>
    <section id="retensi"><h2>5. Penyimpanan dan penghapusan</h2>
      <p>Anda dapat memperbarui profil dan menghapus foto milik sendiri melalui dasbor. Penghapusan foto memeriksa dan menghapus file asli serta thumbnail sebelum menghapus baris foto. Menjadikan foto draf atau arsip hanya mengubah ketersediaan publik, bukan menghapus file.</p>
      <p>Unggahan sementara berada di bucket privat. Unggahan yang ditinggalkan selama lebih dari 24 jam memenuhi syarat untuk pembersihan harian, apabila pekerjaan terjadwal dan konfigurasi otorisasinya berjalan. Kegagalan penyimpanan juga memicu upaya pembersihan; ini bukan jaminan bahwa setiap file selalu terhapus tepat pada jam ke-24.</p>
      <p>Catatan minimal ID foto, kemungkinan paparan CC lama, dan waktu publikasi gratis yang teramati dipertahankan setelah foto dihapus untuk menjelaskan riwayat izin. Catatan itu tidak berisi gambar atau kontak fotografer dan tidak tersedia melalui kueri publik setelah foto dihapus. Penghapusan tidak mencabut izin CC terdahulu atau menghapus salinan yang telah diperoleh pihak lain.</p>
      <p>Belum tersedia fitur penghapusan akun mandiri. Untuk pertanyaan atau permintaan terkait data, gunakan <a href={OWNERSHIP_REPORT_URL} target="_blank" rel="noopener noreferrer">GitHub Issues proyek</a> sebagai kontak awal dengan ringkasan yang tidak sensitif. Kanal ini publik; jangan unggah dokumen identitas atau kredensial.</p>
    </section>
  </LegalDocument>;
}
