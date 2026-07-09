import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Dela_Gothic_One } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layouts/Navbar";

const atkinson = Atkinson_Hyperlegible({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-atkinson",
});

// Menggunakan Dela Gothic One untuk identitas logo & display header yang radikal
const delaGothic = Dela_Gothic_One({
  weight: "400", 
  subsets: ["latin"],
  variable: "--font-dela-gothic",
});

export const metadata: Metadata = {
  title: "PaduPhoto",
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
      <body 
        className={`${atkinson.variable} ${delaGothic.variable} font-content antialiased bg-[#E5E5E5] text-[#111111] min-h-screen`}
      >
        <Navbar />
        {children}
        {modal}
      </body>
    </html>
  );
}