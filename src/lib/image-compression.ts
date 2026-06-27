// Utilitas kompresi gambar client-side (Canvas API bawaan browser).
// Dipisah dari UploadForm agar bisa dipakai ulang oleh fitur lain
// (avatar) tanpa duplikasi logika encoding WebP/JPEG.

const DEFAULT_QUALITY = 0.85;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (webpBlob) => {
        if (webpBlob) {
          resolve(webpBlob);
          return;
        }
        // Fallback ke JPEG jika browser tidak mendukung encoding WebP.
        canvas.toBlob(
          (jpegBlob) => {
            if (jpegBlob) {
              resolve(jpegBlob);
            } else {
              reject(new Error("Browser tidak dapat memproses gambar ini."));
            }
          },
          "image/jpeg",
          quality
        );
      },
      "image/webp",
      quality
    );
  });
}

// Khusus avatar: resize SEKALIGUS center-crop menjadi persegi (1:1).
// Avatar selalu dirender bundar, jadi tanpa crop di sini, ukuran file
// yang disimpan akan lebih besar dari yang diperlukan (menyimpan area
// gambar yang toh akan terpotong oleh CSS `rounded-full` saat tampil).
export async function compressImageToSquare(
  file: File,
  sizePx: number,
  quality: number = DEFAULT_QUALITY
): Promise<Blob> {
  // `imageOrientation: "from-image"` membaca metadata EXIF agar foto yang
  // diambil dari HP (sering punya rotasi EXIF) tidak tersimpan miring.
  const imageBitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  const sourceSize = Math.min(imageBitmap.width, imageBitmap.height);
  const sourceX = (imageBitmap.width - sourceSize) / 2;
  const sourceY = (imageBitmap.height - sourceSize) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas tidak tersedia di browser ini.");
  }

  ctx.drawImage(
    imageBitmap,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    sizePx,
    sizePx
  );
  imageBitmap.close();

  return canvasToBlob(canvas, quality);
}

export function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  return "jpg";
}