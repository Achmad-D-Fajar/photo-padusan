import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layouts/Navbar";

const atkinson = Atkinson_Hyperlegible({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-atkinson",
});

const spaceGrotesk = Space_Grotesk({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-space-grotesk",
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
        className={`${atkinson.variable} ${spaceGrotesk.variable} font-content antialiased bg-[#E5E5E5] text-[#111111] min-h-screen`}
      >
        <Navbar />
        {children}
        {modal}
      </body>
    </html>
  );
}