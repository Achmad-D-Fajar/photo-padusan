// SERVER-ONLY. Never import from Client Components.
// Sharp is a native Node.js module — not safe for browser bundles.

import sharp from "sharp";
import type { OverlayOptions } from "sharp";

export interface ProcessImageResult {
  downscaledBuffer: Buffer;   // Clean (no watermark) — sent to Gemini
  watermarkedBuffer: Buffer;  // Watermarked — ready for EXIF inject → Storage
  finalWidth: number;
  finalHeight: number;
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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Root-cause explanation (important — do not remove this comment)
// ─────────────────────────────────────────────────────────────────────────────
//
// WHAT BROKE ON VERCEL:
//   The previous implementation passed an SVG Buffer to Sharp's composite().
//   Sharp renders SVG via librsvg. librsvg renders <text> elements via
//   fontconfig + system font files. Vercel's Amazon Linux 2 Lambda runtime
//   has NO font files installed. librsvg silently produces a fully-transparent
//   output instead of throwing — watermark "applies" but is 100% invisible.
//
// WHY THIS WORKS:
//   Sharp's `{ text: { ... } }` input uses Pango (a completely separate text
//   rendering stack that is bundled directly in Sharp's prebuilt npm binary).
//   Pango does not depend on system fonts. It works identically on macOS,
//   Windows, and Vercel Lambda — wherever Sharp's prebuilt binary runs.
//
// DIAGNOSTIC SIGNATURE OF THE OLD BUG:
//   watermarkedBytes < downscaledBytes → transparent overlay, re-encode shrinks JPEG
//   watermarkedBytes > downscaledBytes → real pixels added, watermark visible ✓
// ─────────────────────────────────────────────────────────────────────────────

async function buildWatermarkOverlay(
  imageWidth: number,
  imageHeight: number,
  text: string
): Promise<Buffer> {
  const fontSize = Math.max(
    14,
    Math.min(38, Math.round(Math.min(imageWidth, imageHeight) / 20))
  );
  const safeText = escapeXml(text);

  // Estimated bounding box — Pango uses actual glyph metrics,
  // so the rendered PNG may differ slightly. We read back real
  // dimensions after rendering.
  const estW = Math.round(text.length * fontSize * 0.65) + fontSize * 2;
  const estH = Math.round(fontSize * 2.2);

  // ── Two text layers ────────────────────────────────────────────────────────
  // White layer:  readable on dark photo areas
  // Dark layer:   readable on bright photo areas (subtle shadow effect)
  //
  // Pango alpha attribute: 0 = transparent, 65535 = fully opaque.
  //   18000 ≈ 27.5% opacity (white layer)
  //    8000 ≈ 12.2% opacity (dark layer)
  //
  // If a given Pango build ignores the alpha attribute, text renders at
  // 100% opacity — still a valid (bolder) watermark. No silent failure.
  const [whiteLayer, darkLayer] = await Promise.all([
    sharp({
      text: {
        text: `<span foreground="white" alpha="18000">${safeText}</span>`,
        rgba: true,
        width: estW,
        height: estH,
      },
    })
      .png()
      .toBuffer(),

    sharp({
      text: {
        text: `<span foreground="black" alpha="8000">${safeText}</span>`,
        rgba: true,
        width: estW,
        height: estH,
      },
    })
      .png()
      .toBuffer(),
  ]);

  // Merge shadow (dark) + text (white) into a single stamp PNG
  const mergedStamp = await sharp(darkLayer)
    .composite([{ input: whiteLayer, blend: "over" }])
    .png()
    .toBuffer();

  // Rotate −35° with transparent fill so the bounding box expansion
  // after rotation doesn't produce a visible rectangular border
  const rotatedStamp = await sharp(mergedStamp)
    .rotate(-35, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Read back actual post-rotation dimensions
  const { width: sw = 160, height: sh = 60 } =
    await sharp(rotatedStamp).metadata();

  // Tile grid: stamp + padding, alternate rows staggered by half a step
  const stepX = sw + Math.round(fontSize * 3);
  const stepY = sh + Math.round(fontSize * 1.5);

  // Sharp composite requires top/left >= 0.
  // Starting from row=0, col=0 guarantees this. Odd rows are staggered
  // rightward, which leaves a small gap at the left edge — acceptable.
  const tiles: OverlayOptions[] = [];

  for (let row = 0; row * stepY < imageHeight + sh; row++) {
    const stagger = row % 2 === 1 ? Math.round(stepX / 2) : 0;

    for (let col = 0; col * stepX + stagger < imageWidth + sw; col++) {
      const top = row * stepY;
      const left = col * stepX + stagger;

      // Skip tiles whose top-left corner is already outside the canvas —
      // libvips clips correctly, but filtering here avoids redundant calls.
      if (top < imageHeight && left < imageWidth) {
        tiles.push({ input: rotatedStamp, top, left, blend: "over" });
      }
    }
  }

  // Composite all tiles onto a transparent canvas matching the photo size.
  // This single PNG is then blended onto the photo in one operation below.
  return sharp({
    create: {
      width: imageWidth,
      height: imageHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(tiles)
    .png()
    .toBuffer();
}

export async function processImageForStorage(
  inputBuffer: Buffer,
  options: ProcessOptions = {}
): Promise<ProcessImageResult> {
  const { maxLongestSidePx, jpegQuality, watermarkText } = {
    ...DEFAULTS,
    ...options,
  };

  // Auto-rotate from EXIF before reading dimensions — photos from phones
  // store orientation in EXIF metadata, not actual pixel layout.
  const { width = 0, height = 0 } = await sharp(inputBuffer)
    .rotate()
    .metadata();

  if (width === 0 || height === 0) {
    throw new Error("Tidak dapat membaca dimensi gambar.");
  }

  const longestSide = Math.max(width, height);
  const scale =
    longestSide > maxLongestSidePx ? maxLongestSidePx / longestSide : 1;
  const finalWidth = Math.round(width * scale);
  const finalHeight = Math.round(height * scale);

  const jpegOptions = {
    quality: jpegQuality,
    progressive: true,
    mozjpeg: true,
  } as const;

  // Step 1: Downscale only — no watermark.
  // Sent to Gemini so AI analyses clean pixel content.
  // Watermark text in a photo caption would produce nonsensical results.
  const downscaledBuffer = await sharp(inputBuffer)
    .rotate()
    .resize(finalWidth, finalHeight, {
      fit: "fill",
      withoutEnlargement: true,
    })
    .jpeg(jpegOptions)
    .toBuffer();

  // Step 2: Build the watermark overlay via Pango (no SVG/librsvg)
  const watermarkOverlay = await buildWatermarkOverlay(
    finalWidth,
    finalHeight,
    watermarkText
  );

  // Step 3: Composite watermark PNG onto downscaled image
  const watermarkedBuffer = await sharp(downscaledBuffer)
    .composite([{ input: watermarkOverlay, blend: "over" }])
    .jpeg(jpegOptions)
    .toBuffer();

  // ── Diagnostic log — remove after confirming fix in production ─────────────
  // Expected AFTER fix: watermarkedBytes > downscaledBytes
  // (adding white/black pixels increases JPEG entropy → larger file)
  //
  // If you still see watermarkedBytes < downscaledBytes after deploying this,
  // Pango itself has an issue — open a Sharp GitHub issue with your Node.js
  // version and Sharp version from `npm list sharp`.
  console.log("[image-processing] watermark check:", {
    downscaledBytes: downscaledBuffer.length,
    watermarkedBytes: watermarkedBuffer.length,
    applied: watermarkedBuffer.length > downscaledBuffer.length,
    tiles: "see buildWatermarkOverlay",
  });
  // ──────────────────────────────────────────────────────────────────────────

  return { downscaledBuffer, watermarkedBuffer, finalWidth, finalHeight };
}