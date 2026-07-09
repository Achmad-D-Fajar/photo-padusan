export default function AboutPage() {
  return (
    <main className="container mx-auto px-4 py-16 max-w-2xl">
      <h1 className="text-4xl font-bold mb-6">Tentang Kami</h1>

      <div className="prose prose-base max-w-none space-y-4 text-base-content/80">
        <p>
          PaduPhoto adalah platform agregator foto yang
          menghubungkan fotografer komunitas Desa Padusan dengan dunia luar.
          Setiap karya yang dipublikasikan di sini dikurasi langsung oleh
          fotografernya, lengkap dengan caption dan tag yang dibantu
          dihasilkan oleh kecerdasan buatan agar lebih mudah ditemukan.
        </p>
        <p>
          Tujuan kami sederhana: memberi ruang bagi fotografer lokal untuk
          memamerkan hasil jepretan terbaik mereka, sekaligus membuka jalan
          bagi siapa pun yang ingin menggunakan foto tersebut secara resmi
          melalui tautan microstock yang disediakan setiap fotografer.
        </p>
        <p>
          Platform ini terus berkembang. Jika Anda seorang fotografer dan
          ingin bergabung, silakan daftar dan mulai unggah karya pertama
          Anda — sistem kami akan membantu membuat draf caption dan tag
          secara otomatis sebelum Anda mempublikasikannya.
        </p>
      </div>
    </main>
  );
}