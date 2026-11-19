import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_WATERMARK_PAYLOAD, MAX_WATERMARK_PAYLOAD_BYTES } from "@/lib/watermark-payload";
import { OWNERSHIP_REPORT_URL } from "@/lib/legal-documents";

export const metadata: Metadata = {
  title: "Tentang Watermark Tersembunyi | Padustock",
  description: "Watermark hak cipta terenkripsi AES-256-GCM yang ditanam ke koefisien DCT foto: cara kerja, pilihan payload, risiko menonaktifkan, dan batasannya.",
};

export default function HiddenWatermarkPage() {
  return <main className="container mx-auto px-4 py-12 max-w-4xl watermark-page">
    <header className="watermark-page-header">
      <h1>Tentang watermark tersembunyi</h1>
      <p>Lindungi hak cipta foto Anda dengan sertifikat terenkripsi yang tertanam tak kasat mata di dalam gambar.</p>
    </header>
    <div className="watermark-article">
      <aside className="watermark-panel" aria-label="Ringkasan dan status fitur">
        <h2>Watermark hak cipta terenkripsi</h2>
        <p><strong>Fitur aktif.</strong> Saat watermark diaktifkan, sertifikat hak cipta dienkripsi AES-256-GCM dan ditanam ke koefisien DCT gambar. Halaman ekstraksi membaca kembali data gambar sungguhan dan mendekripsi sertifikat dengan passphrase Anda — bukan simulasi.</p>
        <p>Informasi kepemilikan tetap menyatu dengan gambarnya ke mana pun foto disalin, tanpa menambah tulisan yang terlihat.</p>
        <ul>
          <li>Hanya pemegang passphrase yang dapat membuka sertifikat; kunci salah ditolak oleh tag autentikasi GCM.</li>
          <li>Membuktikan kepemilikan dan mendeteksi manipulasi, bukan mencegah penyalinan.</li>
          <li>Anda dapat menyiapkan payload khusus atau menonaktifkan pilihannya. <Link href="#risiko">Baca akibat menonaktifkan</Link>. Pilihan ini terpisah dari lisensi.</li>
        </ul>
      </aside>

      <section id="pengertian">
        <h2>Apa itu watermark tersembunyi?</h2>
        <p>Watermark tersembunyi adalah informasi yang disisipkan ke data gambar, bukan logo atau tulisan yang terlihat. Padustock menanamkan sertifikat hak cipta terenkripsi pada koefisien frekuensi menengah DCT blok 8×8 di kanal luminance — cukup kuat untuk bertahan kompresi, cukup halus untuk tidak terlihat mata.</p>
        <p>Padustock juga memiliki watermark terlihat pada pratinjau. Keduanya fitur terpisah: mengubah pengaturan watermark tersembunyi tidak mengubah watermark terlihat yang sudah ada.</p>
      </section>
      <section id="manfaat">
        <h2>Mengapa fitur ini berguna?</h2>
        <p>Saat gambar disalin atau dibagikan, caption, kredit fotografer, dan tautan sumber dapat terpisah dari gambarnya. Sertifikat yang tertanam di dalam data gambar tetap bisa dipulihkan dan membuktikan siapa fotografer asli, foto yang mana, dan apa lisensinya.</p>
        <p>Ini bukan layanan pemantauan internet. Padustock tidak otomatis mencari salinan atau melaporkan penggunaan foto; fitur ini memberi Anda bukti kriptografis saat sengketa terjadi.</p>
      </section>
      <section id="perubahan">
        <h2>Apa yang berubah pada foto saya?</h2>
        <p>Penyisipan mengubah nilai koefisien DCT sedikit pada sebagian blok gambar. Perubahan ini tak kasat mata: pengukuran kami menunjukkan PSNR di atas 44 dB antara foto asli dan ber-watermark. Foto ber-watermark diarsipkan sebagai PNG lossless agar watermark tidak rusak oleh kompresi penyimpanan.</p>
        <p>Thumbnail dan pratinjau tetap memakai pipeline yang sudah ada. File yang dihosting oleh penyedia microstock eksternal berada di luar cakupan fitur ini.</p>
      </section>
      <section id="informasi">
        <h2>Informasi apa yang disisipkan?</h2>
        <p>Sertifikat hak cipta dirakit otomatis di server: ID foto, nama fotografer, lisensi, waktu tanam, hash gambar ternormalisasi, penanda server, dan asal situs. Seluruh sertifikat dienkripsi AES-256-GCM dengan kunci yang diturunkan dari passphrase Anda melalui PBKDF2-HMAC-SHA256 (100.000 iterasi, salt acak).</p>
        <p>Di atas itu, Anda dapat menambahkan satu teks payload bebas, maksimal {MAX_WATERMARK_PAYLOAD_BYTES} byte UTF-8. Jika teks kosong atau hanya spasi, nilai bawaannya adalah <code>{DEFAULT_WATERMARK_PAYLOAD}</code> — penanda bawaan bersama, bukan identitas unik foto. Teks lain, termasuk spasi dan baris baru, dipertahankan persis.</p>
        <p>Passphrase tidak pernah disimpan, dicatat, atau dikirim ke pihak lain; hanya Anda yang memegangnya. Tanpa passphrase yang benar, sertifikat tidak dapat dibaca siapa pun — termasuk pengelola Padustock. Jangan gunakan passphrase yang Anda pakai di layanan lain, dan jangan masukkan informasi rahasia ke teks payload bila Anda tidak ingin informasi itu ikut tersemat dalam gambar.</p>
      </section>
      <section id="penggunaan">
        <h2>Bagaimana cara menggunakannya?</h2>
        <h3>Saat mengunggah</h3>
        <p>Di bagian bawah <Link href="/dashboard/upload">formulir unggah</Link>, isi passphrase hak cipta (8–128 karakter, wajib saat watermark aktif), lalu buka “Edit watermark (opsional)” jika ingin mengganti teks payload atau menonaktifkan watermark. Periksa penghitung byte, lalu lanjutkan alur unggah biasa. Pilihan ini juga dapat diubah saat meninjau hasil AI.</p>
        <p>Ingat passphrase Anda baik-baik. Passphrase tidak dapat dipulihkan oleh siapa pun; tanpa itu, sertifikat yang sudah tertanam tidak bisa dibuka lagi.</p>
        <h3>Membaca kembali informasi</h3>
        <p>Masuk ke akun dan buka <Link href="/dashboard/extract">halaman ekstraksi</Link>, atau gunakan halaman publik <Link href="/verify">/verify</Link> tanpa login. Unggah gambar dan masukkan passphrase: paket watermark diekstrak dari koefisien DCT, tag autentikasi GCM diverifikasi, lalu sertifikat ditampilkan beserta status hash gambar.</p>
        <p>Hasil “tidak terdeteksi” berarti tidak ditemukan paket watermark yang valid; itu tidak membuktikan bahwa gambar tidak pernah memiliki watermark. Kunci salah atau data yang dimanipulasi menghasilkan penolakan autentikasi, bukan isi sertifikat yang rusak.</p>
      </section>
      <section id="risiko">
        <h2>Apa akibatnya jika saya menonaktifkan?</h2>
        <p>Tombol “Nonaktifkan watermark” membuat <strong>unggahan ini disimpan tanpa watermark tersembunyi</strong>. Foto tersebut tidak membawa sertifikat terenkripsi, sehingga kepemilikannya tidak dapat dibuktikan lewat ekstraksi di kemudian hari.</p>
        <p>Pilihan ini tidak menghapus watermark dari foto lama, file yang sudah diunduh, atau salinan yang sudah beredar.</p>
        <p>Menonaktifkan pilihan tidak menghilangkan hak fotografer dan tidak berarti foto boleh diambil atau digunakan tanpa izin. Caption, kredit, watermark terlihat, dan <Link href="/terms#riwayat-cc">ketentuan lisensi</Link> tetap terpisah. Mengaktifkannya pun tidak menjamin foto aman dari penyalinan.</p>
      </section>
      <section id="batasan">
        <h2>Apa batasannya?</h2>
        <p>Pengujian kami menunjukkan watermark bertahan pada kompresi JPEG kualitas 70–90 dengan bit error rate 0%. Pemotongan (crop), perubahan ukuran, dan penyuntingan berat belum dijamin — ketahanan terhadap serangan tersebut adalah pekerjaan lanjutan. Hash gambar yang tidak cocok menandakan gambar telah berubah; sertifikat tetap sah bila tag GCM valid.</p>
        <p>Hasil ekstraksi merupakan bukti kriptografis yang kuat, tetapi tetap perlu diperiksa bersama sumber lain dalam sengketa nyata. Teks payload dapat berupa klaim yang keliru. Ekstraksi gagal juga tidak membuktikan bahwa gambar tidak pernah memiliki watermark.</p>
      </section>
      <section id="pertanyaan">
        <h2>Pertanyaan umum dan langkah berikutnya</h2>
        <h3>Apakah watermark akan terlihat?</h3>
        <p>Tidak. Penyisipan hanya mengubah koefisien frekuensi menengah secara halus (PSNR &gt; 44 dB terukur). Watermark terlihat pada pratinjau Padustock adalah fitur lain yang sudah ada.</p>
        <h3>Apakah file asli ikut berubah?</h3>
        <p>Ya, secara tak kasat mata: arsip asli disimpan sebagai PNG ber-watermark agar sertifikat tetap utuh. Perubahan tidak terlihat mata dan tidak menurunkan kualitas secara terukur berarti.</p>
        <h3>Apakah foto gratis dan tautan eksternal punya aturan yang sama?</h3>
        <p>Pilihan watermark tidak menentukan izin penggunaan. Publikasi gratis dan foto bertautan eksternal tetap mengikuti <Link href="/terms">penjelasan lisensi masing-masing</Link>.</p>
        <h3>Bisakah saya berubah pikiran?</h3>
        <p>Selama formulir belum ditinggalkan, Anda dapat mengaktifkan kembali pilihan ini; teks yang sudah diketik tetap tersedia. Untuk foto yang sudah terunggah, watermark tidak dapat ditambah atau dihapus tanpa mengunggah ulang.</p>
        <h3>Bagaimana jika saya menduga foto disalahgunakan?</h3>
        <p>Buktikan lewat <Link href="/verify">halaman verifikasi</Link> dengan passphrase Anda, lalu gunakan <a href={OWNERSHIP_REPORT_URL} target="_blank" rel="noopener noreferrer">GitHub Issues Padustock</a> dengan tautan foto dan uraian singkat. Jangan unggah bukti pribadi atau informasi rahasia secara publik.</p>
        <p>Lanjut ke <Link href="/dashboard/upload">unggah foto</Link>, <Link href="/dashboard/extract">ekstraksi</Link>, <Link href="/privacy">kebijakan privasi</Link>, atau <Link href="/terms#riwayat-cc">riwayat lisensi</Link>.</p>
      </section>
    </div>
  </main>;
}