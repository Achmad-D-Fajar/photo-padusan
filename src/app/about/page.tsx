export default function AboutPage() {
  return (
    <main className="container mx-auto px-4 py-16 max-w-4xl">
      <div className="bg-[#E5E5E5] border-4 border-[#111111] p-8 sm:p-12 shadow-[16px_16px_0px_#111111]">
        <h1 className="font-display text-5xl sm:text-6xl font-bold uppercase tracking-tighter text-[#111111] border-b-4 border-[#111111] pb-6 mb-8">
          Tentang Kami
        </h1>

        <div className="prose prose-lg sm:prose-xl max-w-none text-[#111111] font-bold leading-relaxed space-y-6">
          <p className="bg-white border-4 border-[#111111] p-6 shadow-[6px_6px_0px_#111111]">
            PaduPhoto adalah platform agregator foto yang menghubungkan fotografer komunitas Desa Padusan dengan dunia luar. Setiap karya yang dipublikasikan di sini dikurasi langsung oleh fotografernya, lengkap dengan caption dan tag yang dibantu dihasilkan oleh kecerdasan buatan agar lebih mudah ditemukan.
          </p>
          <p className="bg-white border-4 border-[#111111] p-6 shadow-[6px_6px_0px_#111111]">
            Tujuan kami sederhana: memberi ruang bagi fotografer lokal untuk memamerkan hasil jepretan terbaik mereka, sekaligus membuka jalan bagi siapa pun yang ingin menggunakan foto tersebut secara resmi melalui tautan microstock yang disediakan setiap fotografer.
          </p>
          <p className="bg-white border-4 border-[#111111] p-6 shadow-[6px_6px_0px_#111111]">
            Platform ini terus berkembang. Jika Anda seorang fotografer dan ingin bergabung, silakan daftar dan mulai unggah karya pertama Anda — sistem kami akan membantu membuat draf caption dan tag secara otomatis sebelum Anda mempublikasikannya.
          </p>
        </div>
      </div>
    </main>
  );
}