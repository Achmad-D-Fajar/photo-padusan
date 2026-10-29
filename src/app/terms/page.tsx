import type { Metadata } from "next";
import Link from "next/link";
import LegalDocument from "@/components/shared/LegalDocument";
import { CC_LICENSE_URL, LEGAL_DOCUMENTS, OWNERSHIP_REPORT_URL } from "@/lib/legal-documents";

export const metadata: Metadata = { title: "Syarat & Ketentuan | Padustock", description: "Hak fotografer, publikasi gratis, lisensi eksternal, dan penggunaan Padustock." };

export default function TermsPage() {
  return <LegalDocument title="Syarat & Ketentuan" document={LEGAL_DOCUMENTS.terms}>
    <section id="akun"><h2>1. Akun dan penggunaan layanan</h2>
      <p>Padustock merupakan galeri foto komunitas Desa Padusan. Pendaftaran fotografer memerlukan persetujuan syarat ini dan pernyataan telah membaca <Link href="/privacy">Kebijakan Privasi</Link>. Pengunjung dapat mengunduh foto gratis tanpa akun dan tanpa persetujuan tambahan. Ketentuan situs tidak mengurangi hak yang diberikan oleh lisensi CC atau pengecualian hukum yang berlaku.</p>
    </section>
    <section id="kepemilikan"><h2>2. Kepemilikan dan tanggung jawab fotografer</h2>
      <p>Hak cipta foto tetap dimiliki fotografer atau pemegang hak yang sah. Pengunggah harus memiliki hak atau izin yang diperlukan untuk mengunggah, menampilkan, dan menawarkan foto melalui alur publikasi. Pengunggah bertanggung jawab atas hak pihak lain, termasuk privasi, hak atas potret, merek, serta izin subjek atau properti jika diperlukan.</p>
      <p>Dengan mengunggah foto, fotografer memberi Padustock izin non-eksklusif untuk menyimpan dan menampilkan karya, membuat pratinjau berukuran lebih kecil dengan tanda air dan metadata atribusi, serta menyediakan unduhan saat foto dipublikasikan gratis. Izin operasional ini tidak memindahkan kepemilikan hak cipta kepada Padustock.</p>
    </section>
    <section id="lisensi"><h2>3. Publikasi gratis: CC BY-NC-ND 4.0</h2>
      <p>Foto yang dipublikasikan tanpa tautan pembelian eksternal otomatis ditawarkan dengan <a href={CC_LICENSE_URL} target="_blank" rel="noopener noreferrer">Creative Commons Attribution–NonCommercial–NoDerivatives 4.0 International</a>. Anda boleh menyalin dan membagikan materi sesuai lisensi: berikan atribusi yang layak, pertahankan pemberitahuan yang relevan, sertakan tautan ke lisensi dan sumber foto, serta nyatakan perubahan jika ada tanpa menyiratkan dukungan fotografer.</p>
      <p>Penggunaan harus untuk tujuan nonkomersial. Anda boleh membuat adaptasi untuk penggunaan yang diizinkan lisensi, tetapi tidak boleh membagikan materi hasil adaptasi berdasarkan lisensi ini. Perubahan teknis format tidak dengan sendirinya merupakan adaptasi. Jangan menerapkan syarat atau pembatasan teknologi tambahan yang membatasi hak penerima menurut lisensi.</p>
      <p>Contoh atribusi: “Foto oleh [nama fotografer], Padustock, [tautan halaman foto], CC BY-NC-ND 4.0 [tautan lisensi].” Ikuti ketentuan lengkap lisensi untuk penggunaan Anda.</p>
    </section>
    <section id="lisensi-eksternal"><h2>4. Perolehan lisensi melalui penyedia</h2>
      <p>Foto yang dipublikasikan dengan tautan eksternal mengarahkan pengunjung ke penyedia untuk membeli atau memperoleh lisensi yang sesuai. Menampilkan pratinjau di Padustock tidak dengan sendirinya memberikan izin penggunaan ulang secara umum. Halaman penawaran bukan teks hukum lisensi.</p>
      <p>Periksa ketentuan penyedia yang berlaku untuk foto dan penggunaan yang Anda perlukan. Izin komersial, penggunaan editorial, biaya, dan batas lainnya dapat berbeda; Padustock tidak menjanjikan bahwa setiap lisensi eksternal memberikan izin yang sama. Foto draf atau arsip tidak tersedia untuk unduhan publik melalui Padustock.</p>
    </section>
    <section id="riwayat-cc"><h2>5. Riwayat dan keberlanjutan izin CC</h2>
      <p>Tampilan Padustock sebelumnya memuat pemberitahuan CC secara umum, termasuk pada foto bertautan pembelian. Karena itu, catatan lama ditandai secara konservatif sebagai kemungkinan paparan CC, tanpa menganggap tanggal unggah sebagai tanggal pemberian lisensi. Catatan publikasi gratis yang benar-benar teramati setelah pencatatan dimulai dibedakan dari ketidakpastian tersebut.</p>
      <p>Memperbaiki keterangan situs, menambahkan tautan pembelian, menyimpan draf, mengarsipkan, atau menghapus foto tidak mencabut izin CC yang telah diberikan secara sah selama penerima memenuhi ketentuan lisensinya. Catatan kemungkinan bukan kepastian bahwa pengunggah memiliki kewenangan memberikan izin. Lihat <a href="https://creativecommons.org/faq/#what-if-i-change-my-mind-about-using-a-cc-license" target="_blank" rel="noopener noreferrer">penjelasan Creative Commons</a>.</p>
    </section>
    <section id="pengecualian"><h2>6. Pengecualian dan hak lain</h2>
      <p>Ketentuan lisensi tidak membatasi penggunaan yang diperbolehkan oleh pengecualian atau pembatasan hak cipta yang berlaku, maupun unsur domain publik. Lisensi hak cipta belum tentu mencakup semua hak yang diperlukan, seperti hak privasi atau hak atas potret. Materi diberikan tanpa jaminan sejauh diizinkan hukum; ketentuan ini tidak menghapus hak wajib yang diberikan hukum kepada Anda.</p>
    </section>
    <section id="laporan"><h2>7. Laporan kepemilikan</h2>
      <p>Laporkan kekhawatiran kepemilikan melalui <a href={OWNERSHIP_REPORT_URL} target="_blank" rel="noopener noreferrer">GitHub Issues proyek Padustock</a> dengan tautan halaman foto dan ringkasan masalah. Kanal ini bersifat publik: jangan kirim kata sandi, dokumen identitas, kontak pribadi, atau bukti sensitif di sana. Pengelola dapat meninjau laporan dan membatasi atau menghapus konten yang melanggar hak pihak lain.</p>
    </section>
  </LegalDocument>;
}
