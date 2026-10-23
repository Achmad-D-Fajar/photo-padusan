import type { NextConfig } from "next";

// Sharp loads its native binary and libvips shared libraries at runtime.
// Trace both explicitly so Vercel includes the Linux .so files as well as JS.
const sharpRuntimeFiles = [
  "./node_modules/sharp/**/*",
  "./node_modules/@img/sharp-*/**/*",
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "heic-decode"],
  outputFileTracingIncludes: {
    "/api/photos/preview": sharpRuntimeFiles,
    "/api/photos/analyze": sharpRuntimeFiles,
    "/api/photos/draft": sharpRuntimeFiles,
  },
};

export default nextConfig;
