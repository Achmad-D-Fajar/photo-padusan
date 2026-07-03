import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/layouts/Navbar";

export const metadata: Metadata = {
  title: "Etalase Digital Padusan",
  description: "Galeri foto digital Desa Padusan",
};

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  // Next.js injects the @modal parallel route slot here automatically.
  // When no intercepting route matches, @modal/default.tsx returns null
  // so this renders nothing and does not affect the page.
  modal: React.ReactNode;
}) {
  return (
    <html lang="id" data-theme="light">
      <body>
        <Navbar />
        {children}
        {modal}
      </body>
    </html>
  );
}