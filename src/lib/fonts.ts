import localFont from "next/font/local";

export const atkinson = localFont({
  src: [{ path: "../assets/fonts/atkinson-400.woff2", weight: "400" }, { path: "../assets/fonts/atkinson-700.woff2", weight: "700" }],
  variable: "--font-atkinson", display: "swap",
});
export const spaceGrotesk = localFont({
  src: [{ path: "../assets/fonts/space-grotesk-400.woff2", weight: "400" }, { path: "../assets/fonts/space-grotesk-700.woff2", weight: "700" }],
  variable: "--font-space-grotesk", display: "swap",
});
export const delaGothic = localFont({
  src: "../assets/fonts/dela-gothic-one-400.woff2", weight: "400",
  variable: "--font-dela-gothic", display: "swap",
});
