import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/layouts/Navbar";

export const metadata: Metadata = {
  title: "Etalase Digital Padusan",
  description: "Galeri foto digital Desa Padusan",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" data-theme="light">
      <body>
        <Navbar />
        {children}
      </body>
    </html>
  );
}