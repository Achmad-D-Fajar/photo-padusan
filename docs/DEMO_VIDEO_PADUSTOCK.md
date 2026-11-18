# Panduan rekaman demo Padustock

Target durasi: **4 menit 20 detik**, dalam batas 3–5 menit. Satu narator, bahasa Indonesia, dan pengguna sudah login ketika video dimulai. Fokus utama adalah pengamanan dan pemulihan informasi; fitur galeri dan lisensi menjadi pendukung.

Kriteria: **“Demonstrasikan alur pengamanan dan pemulihan informasi serta fungsi utama sistem.”**

## Status dan syarat rekaman

Panduan ini menggunakan skenario akhir yang telah dipilih: **payload → AES-256-GCM → DCT/QIM → gambar tersimpan → ekstraksi → dekripsi → payload pulih**.

Saat panduan disusun, frontend payload masih bekerja di browser dan halaman ekstraksi belum memiliki adapter. Rekam bagian pengamanan dan pemulihan setelah kedua metode benar-benar terhubung. Naskah mengenai enkripsi dan hasil pemulihan di bawah hanya digunakan setelah proses tersebut terverifikasi.

Hasil tetap atau adapter simulasi dapat digunakan untuk latihan antarmuka, tetapi tidak menjadi bukti bahwa algoritma berjalan. Panduan ini tidak mengubah aplikasi atau membuat salinan demo.

## 1. Cerita yang ditunjukkan

Seorang fotografer mengunggah foto beserta informasi pengujian. Informasi dienkripsi dan ditanamkan pada pratinjau foto. Fotografer kemudian mengambil file pratinjau tersimpan, membukanya melalui halaman ekstraksi, dan mendapatkan kembali informasi awal. Gambar lain yang tidak memiliki watermark diuji sebagai pembanding.

| Kriteria | Adegan pembuktian |
| --- | --- |
| Pengamanan informasi | Tampilkan input awal, penjelasan dua metode, proses unggah, dan pratinjau yang dihasilkan. |
| Pemulihan informasi | Baca file pratinjau tersimpan melalui halaman ekstraksi dan bandingkan teks hasil dengan input. |
| Penanganan kegagalan | Gambar tanpa watermark menghasilkan kegagalan, tanpa menampilkan kembali hasil sebelumnya. |
| Fungsi utama | Unggah dan publikasi, galeri/detail, unduh gratis, dan tautan lisensi eksternal. |

## 2. Persiapan lingkungan

- Jalankan salinan demo aplikasi secara lokal dengan akun khusus demo. Gunakan layanan normal untuk login, unggah, penyimpanan, dan galeri.
- Pastikan layanan pengamanan dan pemulihan sudah terhubung. Konfigurasi kunci berada di server dan tidak ditampilkan dalam rekaman.
- Siapkan tab galeri, halaman unggah, dan halaman ekstraksi. Pengguna sudah login; proses pendaftaran dan login tidak masuk video.
- Pastikan koneksi penyimpanan dan penerjemahan caption tersedia. Caption manual pada aplikasi saat ini tetap menggunakan layanan AI untuk penerjemahan.
- Gunakan desktop dengan hasil rekaman 1920×1080, 30 fps. Sesuaikan pembesaran browser agar isi form dan hasil terbaca.
- Matikan notifikasi, tutup tab pribadi, dan gunakan folder khusus berisi file demo saja.
- Rekam narasi secara terpisah setelah pengambilan layar agar tempo lebih mudah disesuaikan.

## 3. Data yang disiapkan

Gunakan foto yang sudah dimiliki tim atau boleh digunakan. Tidak perlu membuat foto baru.

| Data | Nilai |
| --- | --- |
| Foto utama | `sawah-padusan-asli.jpg`, JPEG lanskap sekitar 1600×1000 piksel. |
| Caption | `Sawah Padusan — Demo Keamanan Data` |
| Tag | `padusan, sawah, demo` |
| Mode publikasi | Gratis: nonaktifkan pilihan menambahkan tautan eksternal agar langsung dipublikasikan. |
| File hasil | `sawah-padusan-preview.jpg`, berasal dari pratinjau unggahan yang sedang didemonstrasikan. |
| Gambar pembanding | `foto-tanpa-watermark.jpg`, gambar berbeda yang belum diproses sistem. |
| Listing pendukung | Satu foto lain yang sudah memiliki tautan lisensi eksternal. |

Simpan input berikut dalam `payload-awal.txt`, lalu salin persis ke kolom payload:

```text
demo_id=PADU-01
creator=Tim Padustock
message=Uji pemulihan informasi
```

Ini merupakan input khusus untuk demo, bukan informasi yang diklaim diambil otomatis dari akun atau database. Gunakan penghitung byte aplikasi untuk memastikan ukurannya sesuai.

### Mengambil file hasil yang benar

1. Setelah unggahan selesai, identifikasi URL pratinjau JPEG yang baru tersimpan.
2. Buka URL tersebut dalam tab tersendiri dan simpan sebagai `sawah-padusan-preview.jpg` tanpa mengubah piksel atau formatnya.
3. Pengambilan URL dapat dilakukan di luar rekaman utama. Rekaman kemudian berlanjut saat file hasil dipilih untuk ekstraksi.
4. Gunakan file dari unggahan yang sama, bukan file contoh dengan hasil yang sudah ditentukan.

Jangan mengambilnya melalui tombol unduh resolusi asli: pada rancangan saat ini, file asli dipertahankan tanpa perubahan. Objek yang membawa watermark demo ini adalah pratinjau.

## 4. Storyboard: yang terjadi di layar

| Waktu | Tampilan dan tindakan | Fokus perhatian |
| --- | --- | --- |
| 00:00–00:15 | Galeri dalam keadaan login. Teks pembuka singkat berisi judul dan nama anggota. Buka satu detail foto. | Konteks Padustock dan tujuan demo. |
| 00:15–00:40 | Tampilkan foto sumber dan `payload-awal.txt`. Sorot tiga baris input, lalu kembali ke browser. | Informasi awal yang akan dipulihkan. |
| 00:40–01:25 | Buka unggah, pilih foto, isi caption/tag, buka bagian payload, lalu tempel teks. Tunjukkan penghitung byte. Nonaktifkan tautan eksternal dan klik publikasi. | Input pengguna dan dimulainya proses pengamanan. |
| 01:25–01:55 | Tampilkan diagram teks sederhana dalam penyuntingan: `Payload → AES-256-GCM → Ciphertext → DCT/QIM → Pratinjau JPEG`. Beri judul “Alur proses internal”, lalu kembali ke aplikasi. | Peran masing-masing metode. |
| 01:55–02:20 | Tampilkan foto yang baru dipublikasikan pada galeri dan detail. Perlihatkan gambar secara utuh. Lanjutkan ke file pratinjau hasil penyimpanan. | File hasil yang akan menjadi sumber pemulihan. |
| 02:20–03:15 | Buka ekstraksi, pilih `sawah-padusan-preview.jpg`, lalu jalankan. Setelah hasil muncul, tampilkan input awal sebagai inset atau berdampingan. Sorot kecocokan teks, klik salin, dan tahan hasil terbaca sekitar empat detik. | Informasi kembali dari file gambar. |
| 03:15–03:40 | Ganti dengan `foto-tanpa-watermark.jpg`, jalankan ekstraksi, lalu tampilkan kegagalan. Hasil sukses sebelumnya harus sudah bersih. | Gambar berbeda tidak otomatis menghasilkan payload valid. |
| 03:40–04:05 | Kembali ke detail foto gratis: tunjukkan unduhan dan informasi lisensinya. Beralih ke listing eksternal yang sudah disiapkan dan tunjukkan tombol ke penyedia. Tidak perlu melakukan pembelian. | Fungsi utama pendukung. |
| 04:05–04:20 | Tutup dengan cuplikan input, gambar hasil, dan informasi yang pulih. Gunakan teks `Input → Gambar → Informasi pulih`. | Hasil utama demonstrasi. |

## 5. Naskah narasi

Naskah tidak harus dibaca terus-menerus. Sisakan jeda untuk tindakan pengguna dan hasil yang perlu dilihat.

### 00:00–00:15 — Pembukaan

“Padustock merupakan galeri foto Desa Padusan. Pada demo ini, kami menunjukkan bagaimana informasi ditanamkan secara tersembunyi ke dalam foto, kemudian dipulihkan kembali dari file gambarnya.”

### 00:15–00:40 — Input awal

“Kami menggunakan satu foto dan payload berisi kode demo, nama pembuat, serta pesan pengujian. Teks ini menjadi informasi awal yang akan diamankan. Nantinya, hasil pemulihan harus sama persis dengan input ini.”

### 00:40–01:25 — Unggah

“Fotografer mengunggah gambar melalui halaman ini. Caption dapat ditulis manual atau dibantu AI. Pada bagian payload, kami memasukkan informasi pengujian. Ukurannya dihitung dalam byte agar sesuai dengan batas penyisipan. Jika kolom dikosongkan, aplikasi menggunakan teks bawaan. Untuk contoh ini, kami memakai payload khusus dan memublikasikan foto sebagai foto gratis.”

### 01:25–01:55 — Dua metode pengamanan

“Payload dienkripsi menggunakan AES-256-GCM. Hasil enkripsinya kemudian disisipkan ke komponen kecerahan gambar menggunakan DCT dan QIM. Setiap bit ditempatkan pada tiga lokasi berbeda untuk membantu pemulihan ketika sebagian informasi mengalami perubahan. Penyisipan dilakukan setelah pengolahan pratinjau dan watermark terlihat.”

### 01:55–02:20 — Hasil unggahan

“Foto sekarang tersedia di galeri. Informasi tersembunyi berada pada file pratinjau yang tersimpan. File inilah yang kami gunakan pada tahap pemulihan. Foto asli untuk unduhan tetap dipertahankan sesuai mekanisme Padustock.”

### 02:20–03:15 — Pemulihan

“Berikutnya, kami memilih file pratinjau tersebut melalui halaman ekstraksi. Sistem membaca kembali bit watermark dari gambar, menyusun data terenkripsi, lalu melakukan dekripsi dan pemeriksaan autentikasi. Teks awal tidak diberikan kepada proses ekstraksi sebagai jawaban pembanding. Hasil yang tampil adalah payload yang berhasil dipulihkan. Ketiga barisnya sesuai dengan input awal, termasuk kode demo dan pesan pengujian. Hasilnya juga dapat disalin.”

### 03:15–03:40 — Pembanding negatif

“Sebagai pembanding, kami mencoba gambar yang tidak memiliki watermark sistem ini. Aplikasi menampilkan kegagalan pemulihan dan tidak mengembalikan payload sebelumnya. Pemilihan gambar yang berbeda tidak otomatis dianggap menghasilkan data yang valid.”

### 03:40–04:05 — Fitur pendukung

“Selain pengamanan informasi, Padustock menyediakan galeri dan pengelolaan publikasi foto. Foto gratis memiliki pilihan unduh dengan ketentuan lisensinya. Untuk foto bertautan eksternal, pengguna diarahkan memperoleh lisensi melalui penyedia terkait.”

### 04:05–04:20 — Penutup

“Demo ini menunjukkan pengamanan dan pemulihan informasi melalui integrasi kriptografi dan watermarking. Data hasil pemulihan sesuai dengan input. Hasil tersebut membantu pelacakan informasi, tetapi tidak dengan sendirinya membuktikan kepemilikan hukum sebuah foto.”

## 6. Urutan produksi dan penyuntingan

1. Lakukan latihan lengkap tanpa merekam, termasuk mengambil file pratinjau hasil unggahan.
2. Rekam unggah, publikasi, dan pemulihan sebagai satu rangkaian data yang konsisten. Boleh dipisah menjadi beberapa klip.
3. Rekam pengujian gagal dan fitur pendukung sebagai klip terpisah.
4. Ambil cuplikan input dan hasil aktual untuk tampilan perbandingan.
5. Rekam suara berdasarkan naskah, lalu sesuaikan durasi klip dengan narasi.
6. Tambahkan subtitle Indonesia, judul pembuka, serta diagram proses sebagai teks dalam penyunting video.
7. Pangkas waktu tunggu jaringan yang panjang. Gunakan transisi “Proses selesai” jika dibutuhkan; tetap gunakan hasil dari operasi yang direkam.
8. Ekspor video akhir dengan durasi antara tiga dan lima menit.

Jangan membuat ciphertext, hasil pemulihan, atau angka metrik untuk mengisi layar. Diagram menjelaskan proses internal, sedangkan panel hasil memperlihatkan keluaran aktual.

### Bila perlu dipadatkan menjadi tiga menit

Persingkat pembukaan, pengisian caption, penjelasan diagram, dan fitur pendukung. Pertahankan input awal, hasil pratinjau, pemulihan sukses, perbandingan teks, dan kegagalan pada gambar tanpa watermark.

### Bila ingin mendekati lima menit

Tambahkan satu contoh kompresi JPEG ulang hanya setelah hasilnya benar-benar diuji. Sebut pengaturan yang digunakan. Jangan menambahkan klaim tahan crop, screenshot, atau penghapusan watermark terlihat tanpa hasil pengujian yang mendukungnya.

## 7. Checklist sebelum rekaman final

- [ ] Akun sudah login; layar tidak menampilkan kredensial atau konfigurasi rahasia.
- [ ] Enkripsi, penyisipan, ekstraksi, dan dekripsi sudah terhubung dan diverifikasi.
- [ ] Foto unggahan dan file ekstraksi berasal dari rangkaian proses yang sama.
- [ ] Ekstraksi tidak membaca kembali jawaban dari form, database, atau hasil tetap.
- [ ] Pemulihan tetap berhasil setelah halaman unggah ditutup atau dimuat ulang.
- [ ] Payload hasil dekripsi identik dengan input awal.
- [ ] Gambar tanpa watermark menghasilkan kegagalan yang sesuai dan membersihkan hasil sebelumnya.
- [ ] File pratinjau tidak tertukar dengan file asli untuk unduhan.
- [ ] Narasi sesuai dengan perilaku aplikasi yang benar-benar direkam.
- [ ] Teks, kursor, dan hasil dapat dibaca pada video akhir.
- [ ] Durasi akhir berada pada tiga sampai lima menit.

Evaluasi 10 ukuran payload, metrik kualitas, tabel, dan grafik tetap menjadi pekerjaan evaluasi tugas akhir yang terpisah dari rekaman singkat ini.
