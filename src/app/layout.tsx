import type { Metadata } from "next";
import { atkinson, spaceGrotesk, delaGothic } from "@/lib/fonts";
import "./globals.css";
import "../../tokens.css";
import "../components/dashboard/watermark.css";
import Navbar from "@/components/layouts/Navbar";
import Footer from "@/components/layouts/Footer";

export const metadata: Metadata = {
  title: "Padustock",
  description: "Galeri foto digital Desa Padusan",
};

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html lang="id" data-theme="light">
      {/* Tambahkan flex dan flex-col agar footer selalu terdorong ke bawah layar */}
      <body className={`${atkinson.variable} ${spaceGrotesk.variable} ${delaGothic.variable} font-content antialiased bg-[#E5E5E5] text-[#111111] min-h-screen flex flex-col`}>
        <Navbar />
        
        {/* Konten utama di-wrap agar mengisi ruang kosong (flex-grow) */}
        <div className="flex-grow">
          {children}
        </div>
        
        <Footer />
        {modal}
      </body>
    </html>
  );
}
