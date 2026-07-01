// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'your-project-id.supabase.co', // Ganti dengan URL Supabase Anda
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // Sharp adalah native Node.js module (menggunakan binary C++).
  // Tanpa ini, Next.js akan mencoba mem-bundle Sharp ke dalam
  // worker yang tidak mendukung native modules, menyebabkan error
  // "Cannot find module sharp" saat runtime.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;