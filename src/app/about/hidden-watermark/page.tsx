import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_WATERMARK_PAYLOAD, MAX_WATERMARK_PAYLOAD_BYTES } from "@/lib/watermark-payload";
import { OWNERSHIP_REPORT_URL } from "@/lib/legal-documents";

export const metadata: Metadata = {
  title: "Tentang Watermark Tersembunyi | Padustock",
  description: "Pilihan payload, risiko menonaktifkan, dan batasan watermark tersembunyi Padustock. Ekstraksi saat ini menggunakan simulasi berdasarkan nama file.",
};

export default function HiddenWatermarkPage() {
  return <main className="container mx-auto px-4 py-12 max-w-4xl watermark-page">
    <header className="watermark-page-header">
      <h1>Tentang watermark tersembunyi</h1>
      <p>Pilih apakah Anda ingin menyiapkan rujukan tambahan untuk pratinjau foto Anda.</p>
    </header>
    <div className="watermark-article">
      <aside className="watermark-panel" aria-label="Ringkasan dan status fitur">
        <h2>Informasi sumber untuk pratinjau</h2>
        <p><strong>Mode simulasi — Padustock Demo.</strong> Tidak ada payload yang disisipkan ke gambar. Halaman ekstraksi menampilkan teks tetap berdasarkan nama file; hasil tersebut bukan pembacaan watermark atau dekripsi.</p>
        <p>Rancangannya adalah menyertakan informasi rujukan di pratinjau tanpa menambahkan tulisan yang terlihat. Jika informasi berhasil dibaca kembali, rujukan tersebut dapat membantu menelusuri sumber foto.</p>
        <ul>
          <li>Cakupan yang direncanakan hanya pratinjau dari unggahan tersebut. File asli tetap dipertahankan.</li>
          <li>Membantu penelusuran, tanpa mencegah penyalinan atau menjamin pemulihan informasi.</li>
          <li>Anda dapat menyiapkan payload khusus atau menonaktifkan pilihannya. <Link href="#risiko">Baca akibat menonaktifkan</Link>. Pilihan ini terpisah dari lisensi.</li>
        </ul>
      </aside>

      <section id="pengertian">
        <h2>Apa itu watermark tersembunyi?</h2>
        <p>Watermark tersembunyi adalah informasi yang disisipkan ke data gambar, bukan logo atau tulisan yang terlihat. Pada rancangan ini, informasi itu dimaksudkan sebagai rujukan tambahan ke sumber foto.</p>
        <p>Padustock sudah memiliki watermark yang terlihat pada pratinjau. Pengaturan baru ini membahas watermark tersembunyi yang masih disiapkan; mengubahnya tidak mengubah watermark terlihat yang sudah ada.</p>
      </section>
      <section id="manfaat">
        <h2>Mengapa fitur ini berguna?</h2>
        <p>Saat gambar disalin atau dibagikan, caption, kredit fotografer, dan tautan sumber dapat terpisah dari gambarnya. Rujukan yang dapat dipulihkan memberi cara tambahan untuk mencari halaman foto dan fotografernya.</p>
        <p>Ini bukan layanan pemantauan internet. Padustock tidak otomatis mencari salinan atau melaporkan penggunaan foto melalui rancangan fitur ini.</p>
      </section>
      <section id="perubahan">
        <h2>Apa yang berubah pada foto saya?</h2>
        <p>Jika penyisipan dihubungkan kelak, prosesnya akan membuat perubahan kecil pada data gambar pratinjau. Tujuannya agar tampilan tetap tidak mengganggu, tetapi tidak ada janji bahwa kualitas sama sekali tidak berubah.</p>
        <p>File asli tetap dipertahankan. File yang dihosting oleh penyedia microstock eksternal berada di luar cakupan fitur ini. Saat ini pengaturan payload belum memengaruhi gambar mana pun.</p>
      </section>
      <section id="informasi">
        <h2>Informasi apa yang disisipkan?</h2>
        <p><strong>Belum ada informasi yang disisipkan.</strong> Formulir menyiapkan satu teks payload, maksimal {MAX_WATERMARK_PAYLOAD_BYTES} byte UTF-8. Jika teks kosong atau hanya spasi, nilai bawaannya adalah <code>{DEFAULT_WATERMARK_PAYLOAD}</code>. Nilai ini merupakan penanda bawaan bersama, bukan identitas unik foto atau bukti siapa pemiliknya.</p>
        <p>Teks lain, termasuk spasi dan baris baru, dipertahankan persis. Daftar informasi yang benar-benar disisipkan baru dapat dijelaskan setelah integrasi ditetapkan; saat ini tidak ada ID foto, identitas fotografer, atau tautan sumber yang otomatis ditambahkan ke payload ini.</p>
        <p>Jangan masukkan password, kontak pribadi yang tidak ingin dibagikan, atau informasi rahasia. Tersembunyi tidak berarti privat atau terenkripsi: setelah penyisipan tersedia, orang yang memiliki salinan gambar dan alat yang sesuai mungkin dapat membaca informasi yang berhasil dipulihkan. Akses ekstraksi Padustock direncanakan melalui akun yang masuk.</p>
      </section>
      <section id="penggunaan">
        <h2>Bagaimana cara menggunakannya?</h2>
        <h3>Saat mengunggah</h3>
        <p>Di bagian bawah <Link href="/dashboard/upload">formulir unggah</Link>, lihat nilai bawaan lalu buka “Edit watermark (opsional)” jika ingin mengganti teks atau menonaktifkan pilihannya. Periksa penghitung byte, lalu lanjutkan alur unggah biasa. Pilihan ini juga dapat diubah saat meninjau hasil AI.</p>
        <p>Untuk saat ini, pilihan hanya bertahan selama Anda berada di formulir tersebut dan tidak ikut tersimpan bersama foto. Setelah fitur dihubungkan, cakupan yang dimaksud adalah pratinjau yang dibuat dari unggahan itu.</p>
        <h3>Membaca kembali informasi</h3>
        <p>Masuk ke akun, buka <Link href="/dashboard/extract">halaman ekstraksi</Link>, dan pilih gambar. Pada salinan demo ini Anda dapat menjalankan skenario ekstraksi. Hasilnya ditentukan konfigurasi dan nama file, bukan data gambar.</p>
        <p>Ketika tersedia kelak, hasil berhasil berarti ada informasi yang dapat ditampilkan untuk Anda periksa. Hasil “tidak terdeteksi” berarti proses tersebut tidak berhasil membaca informasi; itu tidak membuktikan bahwa gambar tidak pernah memiliki watermark.</p>
      </section>
      <section id="risiko">
        <h2>Apa akibatnya jika saya menonaktifkan?</h2>
        <p>Tombol “Nonaktifkan watermark” mengubah pilihan untuk <strong>pratinjau yang akan dibuat dari unggahan ini</strong>, ketika penyisipan tersedia. Pratinjau itu tidak akan memiliki rujukan tambahan dari fitur ini, sehingga ekstraksi tidak dapat memulihkan rujukan yang memang tidak disisipkan.</p>
        <p>Saat ini tombol hanya mengubah persiapan di browser. Pilihan ini tidak menghapus watermark dari foto lama, file yang sudah diunduh, atau salinan yang sudah beredar.</p>
        <p>Menonaktifkan pilihan tidak menghilangkan hak fotografer dan tidak berarti foto boleh diambil atau digunakan tanpa izin. Caption, kredit, watermark terlihat, dan <Link href="/terms#riwayat-cc">ketentuan lisensi</Link> tetap terpisah. Mengaktifkannya pun tidak menjamin foto aman dari penyalinan.</p>
      </section>
      <section id="batasan">
        <h2>Apa batasannya?</h2>
        <p>Kompresi, pemotongan, perubahan ukuran, tangkapan layar, dan penyuntingan dapat merusak informasi yang hendak dibaca kembali. Kemampuan dan ketahanan rancangan Padustock belum diuji dengan algoritme nyata; belum ada jaminan pemulihan pada perubahan tersebut.</p>
        <p>Hasil ekstraksi merupakan informasi pendukung yang perlu diperiksa bersama sumber lain, bukan bukti kepemilikan yang menentukan. Teks payload dapat berupa klaim yang keliru. Ekstraksi gagal juga tidak membuktikan bahwa gambar tidak pernah memiliki watermark.</p>
      </section>
      <section id="pertanyaan">
        <h2>Pertanyaan umum dan langkah berikutnya</h2>
        <h3>Apakah watermark akan terlihat?</h3>
        <p>Rancangan watermark tersembunyi bertujuan tidak menambah tulisan terlihat. Watermark terlihat pada pratinjau Padustock adalah fitur lain yang sudah ada.</p>
        <h3>Apakah file asli ikut berubah?</h3>
        <p>Tidak. Cakupan yang direncanakan adalah pratinjau dari unggahan; file asli tetap dipertahankan.</p>
        <h3>Apakah foto gratis dan tautan eksternal punya aturan yang sama?</h3>
        <p>Pilihan watermark tidak menentukan izin penggunaan. Publikasi gratis dan foto bertautan eksternal tetap mengikuti <Link href="/terms">penjelasan lisensi masing-masing</Link>.</p>
        <h3>Bisakah saya berubah pikiran?</h3>
        <p>Selama formulir belum ditinggalkan, Anda dapat mengaktifkan kembali pilihan ini; teks yang sudah diketik tetap tersedia. Pilihan ini bukan alat untuk mengubah salinan foto yang sudah beredar.</p>
        <h3>Bagaimana jika saya menduga foto disalahgunakan?</h3>
        <p>Gunakan <a href={OWNERSHIP_REPORT_URL} target="_blank" rel="noopener noreferrer">GitHub Issues Padustock</a> dengan tautan foto dan uraian singkat. Jangan unggah bukti pribadi atau informasi rahasia secara publik.</p>
        <p>Lanjut ke <Link href="/dashboard/upload">unggah foto</Link>, <Link href="/dashboard/extract">ekstraksi</Link>, <Link href="/privacy">kebijakan privasi</Link>, atau <Link href="/terms#riwayat-cc">riwayat lisensi</Link>.</p>
      </section>
    </div>
  </main>;
}
