// PERINGATAN: FILE INI SERVER-ONLY.
// Jangan pernah diimpor dari Client Component atau file "use client".
// Sharp adalah native Node.js module dan tidak bisa dipakai di browser.

import sharp from "sharp";

export interface ProcessImageResult {
  downscaledBuffer: Buffer;   // Sebelum watermark — untuk Gemini
  watermarkedBuffer: Buffer;  // Sesudah watermark — untuk Storage
  finalWidth: number;
  finalHeight: number;
  mimeType: "image/jpeg";
}

interface ProcessOptions {
  maxLongestSidePx?: number;
  jpegQuality?: number;
  watermarkText?: string;
}

const DEFAULTS: Required<ProcessOptions> = {
  maxLongestSidePx: 1080,
  jpegQuality: 80,
  watermarkText: "Desa Padusan",
};

// Menghasilkan SVG watermark yang di-tile secara diagonal di atas gambar.
// Menggunakan teks biasa (tanpa filter/shadow) agar kompatibel dengan
// librsvg yang dipakai Sharp untuk merender SVG.
function buildWatermarkSvg(
  imageWidth: number,
  imageHeight: number,
  text: string
): Buffer {
  // Ukuran font adaptif: ~1/20 dari sisi terpendek, clamp antara 14–40px.
  const fontSize = Math.max(
    14,
    Math.min(40, Math.round(Math.min(imageWidth, imageHeight) / 20))
  );

  // Estimasi lebar teks (karakter rata-rata ~0.55× fontSize pada bold Arial).
  const approxTextWidth = Math.ceil(text.length * fontSize * 0.55);
  const spacingX = approxTextWidth + fontSize * 7;  // Jarak horizontal antar tile
  const spacingY = fontSize * 6;                  // Jarak vertikal antar tile

  const cx = imageWidth / 2;
  const cy = imageHeight / 2;

  // Diagonal gambar dipakai sebagai radius aman: memastikan tile menutupi
  // seluruh area gambar bahkan setelah dirotasi.
  const diagonal = Math.ceil(
    Math.sqrt(imageWidth ** 2 + imageHeight ** 2)
  );
  const tilesH = Math.ceil(diagonal / spacingX) + 1;
  const tilesV = Math.ceil(diagonal / spacingY) + 1;

  const textNodes: string[] = [];

  for (let row = -tilesV; row <= tilesV; row++) {
    for (let col = -tilesH; col <= tilesH; col++) {
      // Baris genap/ganjil di-stagger ½ spacingX agar pola terlihat lebih
      // padat dan lebih sulit di-crop dari salah satu sisi saja.
      const stagger = row % 2 === 0 ? 0 : spacingX / 2;
      const x = (cx + col * spacingX + stagger).toFixed(1);
      const y = (cy + row * spacingY).toFixed(1);

      // Dua layer teks (putih + hitam tipis) supaya watermark terbaca baik
      // di atas area terang maupun gelap dari foto.
      textNodes.push(
        `<text x="${x}" y="${y}"` +
          ` font-size="${fontSize}" font-family="sans-serif"` +
          ` font-weight="bold" text-anchor="middle" dominant-baseline="middle"` +
          ` fill="black" fill-opacity="0.07">${text}</text>`,
        `<text x="${x}" y="${y}"` +
          ` font-size="${fontSize}" font-family="sans-serif"` +
          ` font-weight="bold" text-anchor="middle" dominant-baseline="middle"` +
          ` fill="white" fill-opacity="0.16">${text}</text>`
      );
    }
  }

  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg"` +
    ` width="${imageWidth}" height="${imageHeight}"` +
    ` viewBox="0 0 ${imageWidth} ${imageHeight}">` +
    // Seluruh tile di-wrap dalam satu <g> dan dirotasi -35° terhadap
    // pusat gambar — teknik paling sederhana dan reliable di librsvg.
    `<g transform="rotate(-35 ${cx.toFixed(1)} ${cy.toFixed(1)})">` +
    textNodes.join("") +
    `</g></svg>`;

  return Buffer.from(svg, "utf-8");
}

// Entry point utama — dipanggil dari API route draft upload.
export async function processImageForStorage(
  inputBuffer: Buffer,
  options: ProcessOptions = {}
): Promise<ProcessImageResult> {
  const {
    maxLongestSidePx,
    jpegQuality,
    watermarkText,
  } = { ...DEFAULTS, ...options };

  // .rotate() tanpa argumen = auto-rotate berdasarkan metadata EXIF.
  // Penting untuk foto dari kamera/HP yang menyimpan orientasi di EXIF,
  // bukan dalam piksel sesungguhnya.
  const pipeline = sharp(inputBuffer).rotate();
  const { width = 0, height = 0 } = await pipeline.metadata();

  if (width === 0 || height === 0) {
    throw new Error("Tidak dapat membaca dimensi gambar.");
  }

  const longestSide = Math.max(width, height);
  const scale =
    longestSide > maxLongestSidePx ? maxLongestSidePx / longestSide : 1;

  const finalWidth = Math.round(width * scale);
  const finalHeight = Math.round(height * scale);

  // Tahap 1: downscale saja (tanpa watermark).
  // Buffer ini dikirim ke Gemini agar AI menganalisis gambar bersih.
  const downscaledBuffer = await sharp(inputBuffer)
    .rotate()
    .resize(finalWidth, finalHeight, {
      fit: "fill",
      withoutEnlargement: true,
    })
    .jpeg({ quality: jpegQuality, progressive: true, mozjpeg: true })
    .toBuffer();

  // Tahap 2: tambahkan watermark ke buffer downscaled.
  // Buffer ini yang diunggah ke Supabase Storage.
  const watermarkSvg = buildWatermarkSvg(finalWidth, finalHeight, watermarkText);

  const watermarkedBuffer = await sharp(downscaledBuffer)
    .composite([
      {
        input: watermarkSvg,
        // "over" = layer watermark di atas gambar menggunakan alpha blending.
        blend: "over",
      },
    ])
    .jpeg({ quality: jpegQuality, progressive: true, mozjpeg: true })
    .toBuffer();

  return {
    downscaledBuffer,
    watermarkedBuffer,
    finalWidth,
    finalHeight,
    mimeType: "image/jpeg",
  };
}