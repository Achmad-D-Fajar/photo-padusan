"use client";

import ExtractForm from "./ExtractForm";
import { extractDemoPayload } from "@/lib/demo-extraction";

export default function DemoExtractForm() {
  return <div className="space-y-8">
    <aside role="note" className="watermark-panel">
      <h2>Mode simulasi — Padustock Demo</h2>
      <p>Hasil ditentukan oleh nama file dan konfigurasi tetap. Aplikasi ini tidak membaca watermark dari data gambar dan tidak menjalankan algoritme ekstraksi atau dekripsi.</p>
      <p>File pilihan tetap di browser. Nama unduhan “padustock demo” membawa ID foto dan pengunggah untuk menampilkan contoh atribusi Wafa. “no watermark” menampilkan hasil tidak terdeteksi; nama lain menampilkan teks Lorem ipsum yang sudah ditentukan.</p>
      <p>Pengaturan payload dan pilihan menonaktifkan watermark saat unggah tidak menentukan hasil simulasi ini. Data gambar dan berkas asli tidak diubah.</p>
    </aside>
    <ExtractForm onExtract={extractDemoPayload} />
  </div>;
}
