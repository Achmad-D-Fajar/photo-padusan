import type { Metadata } from "next";
import Link from "next/link";
import { Dela_Gothic_One } from "next/font/google";
import { createClient } from "@/lib/supabase/server";

const delaGothic = Dela_Gothic_One({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tentang Kami | Padustock - Galeri Foto Desa Padusan",
  description: "Platform galeri fotografi dan microstock lokal Desa Padusan, Pacet, Mojokerto. Temukan dan unduh foto resolusi tinggi alam, wisata, dan budaya lokal.",
  keywords: ["Padusan", "Pacet", "Mojokerto", "Fotografi", "Microstock", "Galeri Foto", "Unduh Foto Gratis", "Wisata Padusan", "Fotografer Lokal", "Pemandian Air Panas Padusan"],
};

export default async function AboutPage() {
  const supabase = await createClient();
  
  const { data: latestPhotos } = await supabase
    .from("vw_public_photos")
    .select("id, thumbnail_url, caption_id")
    .order("created_at", { ascending: false })
    .limit(4);

  return (
    <main className="container mx-auto px-4 py-12 max-w-6xl">
      
      {/* Header Section */}
      <div className="mb-12 border-b-8 border-[#111111] pb-8">
        <h1 className={`${delaGothic.className} text-5xl md:text-7xl uppercase tracking-wider text-[#111111] mb-6`}>
          TENTANG PADUSTOCK
        </h1>
        <p className="text-xl font-bold text-[#111111] bg-[#88CCEE] border-4 border-[#111111] shadow-[4px_4px_0px_#111111] p-4 inline-block uppercase tracking-wide">
          Menghubungkan Lensa Lokal dengan Dunia Global.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        
        {/* Kolom Kiri: Teks Long-Form untuk SEO (Span 7) */}
        <div className="lg:col-span-7 space-y-8">
          
          <div className="bg-white border-4 border-[#111111] p-6 sm:p-8 shadow-[8px_8px_0px_#111111]">
            <h2 className="font-bold text-2xl uppercase tracking-widest text-[#111111] border-b-4 border-[#111111] pb-2 mb-4">
              Jendela Visual Mojokerto
            </h2>
            <p className="text-lg font-bold text-[#111111] leading-relaxed">
              Padustock adalah galeri foto digital dan platform <em>microstock</em> komunitas yang menyoroti pesona alam, destinasi wisata, dan lanskap budaya <strong>Desa Padusan, Kecamatan Pacet, Kabupaten Mojokerto</strong>. Kami hadir untuk menghubungkan karya visual eksklusif dari kreator lokal langsung kepada desainer grafis, pembuat konten, dan agensi di seluruh dunia.
            </p>
          </div>

          <div className="bg-[#E5E5E5] border-4 border-[#111111] p-6 sm:p-8 shadow-[8px_8px_0px_#111111]">
            <h2 className="font-bold text-2xl uppercase tracking-widest text-[#111111] border-b-4 border-[#111111] pb-2 mb-4">
              Mengapa Kami Hadir?
            </h2>
            <p className="text-lg font-bold text-[#111111] leading-relaxed mb-4">
              Desa Padusan dikenal luas dengan potensi wisata pegunungan dan pemandian air panasnya yang ikonik. Setiap harinya, ribuan momen indah terekam oleh kamera pemuda dan fotografer lokal.
            </p>
            <p className="text-lg font-bold text-[#111111] leading-relaxed">
              Namun, aset-aset digital bernilai tinggi ini seringkali hanya berujung di penyimpanan pribadi atau tenggelam di media sosial tanpa nilai monetisasi. Padustock dibangun sebagai inkubator digital; sebuah etalase profesional yang memberdayakan komunitas untuk mulai bersaing di industri aset kreatif (<em>microstock</em>) global.
            </p>
          </div>

          <div className="bg-white border-4 border-[#111111] p-6 sm:p-8 shadow-[8px_8px_0px_#111111]">
            <h2 className="font-bold text-2xl uppercase tracking-widest text-[#111111] border-b-4 border-[#111111] pb-2 mb-4">
              Ekosistem & Hak Cipta
            </h2>
            <p className="text-lg font-bold text-[#111111] leading-relaxed mb-4">
              Platform ini dirancang dengan pendekatan hibrida yang menguntungkan semua pihak:
            </p>
            <ul className="list-disc list-inside text-lg font-bold text-[#111111] space-y-3">
              <li><strong>Untuk Pengunjung:</strong> Tersedia akses unduh gratis (resolusi asli) untuk kebutuhan personal dan non-komersial di bawah lisensi CC BY-NC-ND 4.0.</li>
              <li><strong>Untuk Pembeli Komersial:</strong> Kami menjembatani pembeli langsung ke portofolio agensi <em>microstock</em> fotografer (seperti Shutterstock atau Adobe Stock) untuk pembelian lisensi komersial.</li>
              <li><strong>Untuk Kreator:</strong> Dukungan penuh teknologi AI untuk menghasilkan metadata (<em>caption</em> & <em>tag</em> dwibahasa) secara otomatis guna menembus algoritma pencarian global.</li>
            </ul>
          </div>
        </div>

        {/* Kolom Kanan: Kolase Dinamis & CTA (Span 5, Sticky) */}
        <div className="lg:col-span-5 space-y-8 lg:sticky lg:top-24 h-max">
          
          {/* Kolase Foto Database */}
          <div className="bg-[#111111] border-4 border-[#111111] shadow-[8px_8px_0px_#111111] p-2 relative overflow-hidden">
             {latestPhotos && latestPhotos.length > 0 ? (
               <div className="grid grid-cols-2 gap-2 h-full min-h-[350px]">
                 {latestPhotos.map((photo, index) => (
                   <Link href={`/photo/${photo.id}`} key={photo.id} className={`block relative overflow-hidden border-2 border-[#111111] bg-white group ${index === 0 ? 'row-span-2' : ''}`}>
                     {photo.thumbnail_url ? (
                       <img 
                         src={photo.thumbnail_url} 
                         alt={photo.caption_id || "Karya fotografi alam dan wisata Padusan"} 
                         className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 group-hover:scale-105 transition-all duration-300"
                       />
                     ) : (
                       <div className="w-full h-full bg-[#E5E5E5] flex items-center justify-center font-bold text-[#111111]">FOTO</div>
                     )}
                   </Link>
                 ))}
               </div>
             ) : (
               <div className="min-h-[350px] flex flex-col justify-center items-center text-center">
                 <span className={`${delaGothic.className} text-4xl text-[#E5E5E5] opacity-20 absolute rotate-[-15deg] whitespace-nowrap`}>
                    KARYA KOMUNITAS
                 </span>
                 <p className="text-[#88CCEE] font-bold text-xl relative z-10 border-2 border-[#88CCEE] p-4">
                   Karya segera hadir.
                 </p>
               </div>
             )}
             
             {/* Lencana Melayang */}
             <div className="absolute top-4 right-4 bg-[#CC6677] border-2 border-[#111111] px-3 py-1 text-white font-bold text-sm uppercase shadow-[2px_2px_0px_#111111] z-10 pointer-events-none">
               KARYA TERBARU
             </div>
          </div>

          {/* Kotak Aksi (Call to Action) */}
          <div className="bg-[#88CCEE] border-4 border-[#111111] p-6 sm:p-8 shadow-[8px_8px_0px_#111111]">
            <h2 className="font-bold text-2xl uppercase tracking-widest text-[#111111] mb-4">
              Mari Berkembang Bersama
            </h2>
            <p className="text-base font-bold text-[#111111] leading-relaxed mb-6">
              Platform ini milik komunitas. Buka jalan bagi karya Anda untuk ditemukan oleh dunia, didukung oleh infrastruktur teknologi modern.
            </p>
            <div className="flex flex-col gap-3">
              <Link 
                href="/register" 
                className="btn bg-[#111111] hover:bg-[#333333] text-white border-4 border-[#111111] rounded-none font-bold text-lg uppercase shadow-[4px_4px_0px_#111111] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#111111] transition-all w-full h-14"
              >
                DAFTAR SEKARANG
              </Link>
              <Link 
                href="/" 
                className="btn bg-white hover:bg-[#E5E5E5] text-[#111111] border-4 border-[#111111] rounded-none font-bold text-lg uppercase shadow-[4px_4px_0px_#111111] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#111111] transition-all w-full h-14"
              >
                EKSPLORASI GALERI
              </Link>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}