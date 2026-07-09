import Link from "next/link";
import { Dela_Gothic_One } from "next/font/google";

const delaGothic = Dela_Gothic_One({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t-8 border-[#111111] mt-auto">
      <div className="container mx-auto px-4 py-16 max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
          
          {/* Kolom 1: Identitas */}
          <div className="flex flex-col items-start gap-4">
            <Link
              href="/"
              className={`${delaGothic.className} text-2xl uppercase tracking-wide text-[#111111] bg-[#88CCEE] border-4 border-[#111111] px-4 py-1 shadow-[4px_4px_0px_#111111] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#111111] transition-all`}
            >
              PADUSTOCK
            </Link>
            <p className="font-bold text-[#111111] text-lg leading-snug mt-2 border-l-4 border-[#111111] pl-4">
              Galeri foto digital dan platform microstock berbasis komunitas.
            </p>
          </div>

          {/* Kolom 2: Navigasi */}
          <div className="flex flex-col gap-3">
            <h3 className="font-bold text-base uppercase tracking-widest text-[#111111] border-b-4 border-[#111111] pb-2 inline-block w-max">
              Eksplorasi
            </h3>
            <nav className="flex flex-col gap-2 mt-2">
              <Link href="/" className="font-bold text-lg text-[#111111] hover:text-[#E5E5E5] hover:bg-[#332288] w-max px-2 -ml-2 transition-colors">
                Galeri Foto
              </Link>
              <Link href="/about" className="font-bold text-lg text-[#111111] hover:text-[#E5E5E5] hover:bg-[#332288] w-max px-2 -ml-2 transition-colors">
                Tentang Komunitas
              </Link>
              <Link href="/dashboard/upload" className="font-bold text-lg text-[#111111] hover:text-[#E5E5E5] hover:bg-[#117733] w-max px-2 -ml-2 transition-colors">
                Unggah Karya
              </Link>
            </nav>
          </div>

          {/* Kolom 3: Legal & Lisensi */}
          <div className="flex flex-col gap-3">
            <h3 className="font-bold text-base uppercase tracking-widest text-[#111111] border-b-4 border-[#111111] pb-2 inline-block w-max">
              Lisensi & Legal
            </h3>
            <p className="font-bold text-sm text-[#111111] mt-2 leading-relaxed bg-[#E5E5E5] p-3 border-2 border-[#111111]">
              Kecuali dinyatakan lain, seluruh foto berlisensi <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/" target="_blank" rel="noopener noreferrer" className="text-[#332288] underline hover:bg-[#332288] hover:text-white px-1">CC BY-NC-ND 4.0</a>.
            </p>
            <nav className="flex flex-col gap-2 mt-2">
              <Link href="/terms" className="font-bold text-base text-[#111111] hover:text-[#E5E5E5] hover:bg-[#111111] w-max px-2 -ml-2 transition-colors">
                Syarat & Ketentuan
              </Link>
              <Link href="/privacy" className="font-bold text-base text-[#111111] hover:text-[#E5E5E5] hover:bg-[#111111] w-max px-2 -ml-2 transition-colors">
                Kebijakan Privasi
              </Link>
            </nav>
          </div>

        </div>
      </div>

      {/* Baris Hak Cipta */}
      <div className="bg-[#111111] text-[#E5E5E5] py-4 border-t-4 border-[#111111]">
        <div className="container mx-auto px-4 max-w-6xl flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
          <p className="font-bold text-sm uppercase tracking-wider">
            &copy; {currentYear} Padustock. Semua hak dilindungi.
          </p>
          <p className="font-bold text-sm">
            Sistem oleh <span className="text-[#88CCEE] px-1">Desa Padusan</span>
          </p>
        </div>
      </div>
    </footer>
  );
}