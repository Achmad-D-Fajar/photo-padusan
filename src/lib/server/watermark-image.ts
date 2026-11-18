// SERVER-ONLY. Never import from Client Components.
// Pipeline citra untuk watermark hak cipta: decode RGB, hash piksel ternormalisasi,
// penanaman dua tahap (agar image_hash stabil), dan ekstraksi paket dari citra sengketa.
import sharp from "sharp";
import { openPhotoImage } from "./photo-image";
import {
  buildCertificate, encryptCertificate, decryptPacket, sha256Hex,
  type CertificateInput, type CopyrightCertificate,
} from "./watermark-crypto";
import { embedPacketRgb, extractPacketRgb, capacityBytes, CapacityExceededError } from "./watermark-dct";

const HASH_SIDE = 32; // normalisasi: grayscale 32x32, kuantisasi 4-bit per sampel
const MAX_HASH_PASSES = 3;

export interface RgbImage { rgb: Buffer; width: number; height: number }

// Decode + orientasi EXIF + flatten, konsisten antara alur tanam dan alur verifikasi.
export async function decodeToRgb(buffer: Buffer): Promise<RgbImage> {
  const image = await openPhotoImage(buffer);
  const { data, info } = await image.rotate().flatten({ background: "#ffffff" }).removeAlpha()
    .raw().toBuffer({ resolveWithObject: true });
  return { rgb: data, width: info.width, height: info.height };
}

// image_hash = SHA-256 atas representasi piksel ternormalisasi (grayscale 32x32,
// tiap sampel dikuantisasi ke 4 bit atas) dari REGION DI BAWAH blok pembawa watermark.
// Region itu tidak disentuh penanaman → hash dijamin stabil (happy path cocok),
// namun tetap mengikat sertifikat pada foto ini: copy-paste ke foto lain mengubah
// region tersebut. Hash resolusi penuh mustahil stabil karena watermark sendiri
// mengubah piksel (dependensi sirkular) dan JPEG lossy mengubah semua bit.
export function hashRegionTopPx(packetBytes: number, width: number, height: number): number {
  const blocksPerRow = Math.floor(width / 8);
  if (blocksPerRow <= 0) return 0;
  const rows = Math.ceil((packetBytes * 8) / blocksPerRow) + 1; // +1 baris blok margin
  const top = rows * 8;
  return top < height - 8 ? top : 0; // citra terlalu pendek: fallback seluruh citra
}

export async function computeNormalizedHash(image: RgbImage, topPx = 0): Promise<string> {
  const { data } = await sharp(image.rgb, { raw: { width: image.width, height: image.height, channels: 3 } })
    .extract({ left: 0, top: topPx, width: image.width, height: image.height - topPx })
    .grayscale().resize(HASH_SIDE, HASH_SIDE, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const quantized = Buffer.alloc(HASH_SIDE * HASH_SIDE);
  for (let i = 0; i < quantized.length; i++) quantized[i] = data[i] >> 4;
  return sha256Hex(quantized);
}

export interface EmbedResult {
  pngBuffer: Buffer; // original ber-watermark, lossless agar BER = 0 saat verifikasi
  certificate: CopyrightCertificate;
  imageHash: string;
  packetBytes: number;
  width: number;
  height: number;
}

// Tanam sertifikat terenkripsi ke citra resolusi asli. Dua tahap: hash dihitung dari
// citra ber-watermark, lalu sertifikat final ditanam ulang dari piksel asli sampai
// hash stabil (panjang paket konstan karena image_hash selalu 64 karakter heks).
export async function embedCopyrightWatermark(
  inputBuffer: Buffer,
  certInput: Omit<CertificateInput, "imageHash">,
  passphrase: string
): Promise<EmbedResult> {
  const { rgb, width, height } = await decodeToRgb(inputBuffer);

  // Guard kapasitas di muka (spesifikasi §5.4): tolak sebelum citra diproses lebih jauh.
  const probe = await encryptCertificate(buildCertificate({ ...certInput, imageHash: "0".repeat(64) }), passphrase);
  if (probe.packet.length > capacityBytes(width, height)) {
    throw new CapacityExceededError(probe.packet.length * 8, capacityBytes(width, height) * 8);
  }

  let imageHash = "0".repeat(64);
  let certificate = buildCertificate({ ...certInput, imageHash });
  let watermarkedRgb = rgb;
  const hashTopPx = hashRegionTopPx(probe.packet.length, width, height);
  // Sertifikat yang tertanam selalu otoritatif; jika hash belum stabil setelah
  // MAX_HASH_PASSES, verifikasi akan menampilkan peringatan ketidakcocokan hash.
  for (let pass = 0; pass <= MAX_HASH_PASSES; pass++) {
    certificate = buildCertificate({ ...certInput, imageHash });
    const { packet } = await encryptCertificate(certificate, passphrase);
    watermarkedRgb = embedPacketRgb(rgb, width, height, packet);
    const nextHash = await computeNormalizedHash({ rgb: watermarkedRgb, width, height }, hashTopPx);
    if (nextHash === imageHash) break;
    imageHash = nextHash;
  }

  const pngBuffer = await sharp(watermarkedRgb, { raw: { width, height, channels: 3 } }).png().toBuffer();
  return { pngBuffer, certificate, imageHash: certificate.image_hash, packetBytes: probe.packet.length, width, height };
}

// Ekstraksi paket biner dari citra sengketa (belum menyentuh kriptografi).
export async function extractWatermarkPacket(inputBuffer: Buffer): Promise<Buffer> {
  const { rgb, width, height } = await decodeToRgb(inputBuffer);
  return extractPacketRgb(rgb, width, height);
}

export interface VerifyImageResult {
  certificate: CopyrightCertificate;
  hashMatch: boolean;
  packetBytes: number;
  width: number;
  height: number;
}

// Alur pemulihan lengkap: ekstrak → dekripsi (tag GCM) → cek hash region foto.
// hashMatch=false bukan penolakan: tag GCM tetap otoritas validitas sertifikat;
// mismatch menandakan foto telah dikompresi ulang/dimodifikasi (mis. serangan JPEG).
export async function verifyImageWatermark(inputBuffer: Buffer, passphrase: string): Promise<VerifyImageResult> {
  const { rgb, width, height } = await decodeToRgb(inputBuffer);
  const packet = extractPacketRgb(rgb, width, height);
  const { certificate } = await decryptPacket(packet, passphrase);
  const topPx = hashRegionTopPx(packet.length, width, height);
  const actualHash = await computeNormalizedHash({ rgb, width, height }, topPx);
  return { certificate, hashMatch: actualHash === certificate.image_hash, packetBytes: packet.length, width, height };
}