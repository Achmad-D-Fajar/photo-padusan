// next.config.ts
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'your-project-id.supabase.co', // Ganti dengan URL Supabase Anda
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};