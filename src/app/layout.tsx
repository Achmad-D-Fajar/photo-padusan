import type { Metadata } from "next";
import "./globals.css";

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
        <div className="navbar bg-base-100 border-b border-base-300 px-4 sm:px-8">
          <div className="flex-1">
            <a href="/" className="btn btn-ghost text-xl">
              Etalase Digital Padusan
            </a>
          </div>
          <div className="flex-none">
            <ul className="menu menu-horizontal px-1 gap-1">
              <li>
                <a href="/">Home</a>
              </li>
              <li>
                <a href="/upload">Upload</a>
              </li>
            </ul>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}