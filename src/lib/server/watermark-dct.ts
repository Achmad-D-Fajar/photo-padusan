// SERVER-ONLY. Never import from Client Components.
// Watermarking DCT domain frekuensi (baseline Member 2 — placeholder berfungsi untuk demo).
// TODO(Dwiki): optimasi alpha adaptif, pengulangan bit/ECC, dan sinkronisasi tahan cropping.
// Bekerja pada buffer RGB mentah (3 kanal, tanpa alpha) agar murni & mudah diuji tanpa sharp.

export const BLOCK_SIZE = 8;
// 25 = batas atas rentang spesifikasi §5.3. Pengukuran internal (800x600, 3 tekstur):
// alpha 20 sesekali menghasilkan 1 bit error pada JPEG Q80 tekstur tinggi, dan GCM
// menolak seluruh paket bila 1 bit saja salah; alpha 25 memberi BER 0% di Q90/80/70
// dengan PSNR tetap > 44 dB. TODO(Dwiki): alpha adaptif per blok.
export const DEFAULT_ALPHA = 25;
// Pasangan koefisien frekuensi menengah (spesifikasi §5.2).
export const COEFF_A: [number, number] = [3, 2];
export const COEFF_B: [number, number] = [2, 3];

export class CapacityExceededError extends Error {
  constructor(requiredBits: number, availableBits: number) {
    super(`Kapasitas watermark terlampaui: butuh ${requiredBits} bit, tersedia ${availableBits} bit (${Math.floor(availableBits / 8)} byte). Gunakan citra resolusi lebih besar atau payload lebih kecil.`);
    this.name = "CapacityExceededError";
  }
}

export class WatermarkNotFoundError extends Error {
  constructor(message = "Tidak ditemukan watermark Padustock pada citra ini.") {
    super(message); this.name = "WatermarkNotFoundError";
  }
}

export function blockCount(width: number, height: number): number {
  return Math.floor(width / BLOCK_SIZE) * Math.floor(height / BLOCK_SIZE);
}

export function capacityBytes(width: number, height: number): number {
  return Math.floor(blockCount(width, height) / 8);
}

// Matriks DCT-II 1D orthonormal: T[u][x] = C(u)/2 * cos((2x+1)u*pi/16).
const T: number[][] = Array.from({ length: 8 }, (_, u) =>
  Array.from({ length: 8 }, (_, x) =>
    (u === 0 ? Math.SQRT1_2 : 1) / 2 * Math.cos(((2 * x + 1) * u * Math.PI) / 16)));

// DCT 2D penuh: F = T * f * T^T (spesifikasi §5.1).
function dct2(f: Float64Array): Float64Array {
  const tmp = new Float64Array(64);
  const out = new Float64Array(64);
  for (let u = 0; u < 8; u++) for (let y = 0; y < 8; y++) {
    let sum = 0;
    for (let x = 0; x < 8; x++) sum += T[u][x] * f[x * 8 + y];
    tmp[u * 8 + y] = sum;
  }
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) {
    let sum = 0;
    for (let y = 0; y < 8; y++) sum += T[v][y] * tmp[u * 8 + y];
    out[u * 8 + v] = sum;
  }
  return out;
}

// IDCT 2D penuh: f = T^T * F * T.
function idct2(F: Float64Array): Float64Array {
  const tmp = new Float64Array(64);
  const out = new Float64Array(64);
  for (let x = 0; x < 8; x++) for (let v = 0; v < 8; v++) {
    let sum = 0;
    for (let u = 0; u < 8; u++) sum += T[u][x] * F[u * 8 + v];
    tmp[x * 8 + v] = sum;
  }
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    let sum = 0;
    for (let v = 0; v < 8; v++) sum += T[v][y] * tmp[x * 8 + v];
    out[x * 8 + y] = sum;
  }
  return out;
}

interface BlockLocation { row: number; col: number; blocksPerRow: number }

function locateBlock(index: number, width: number): BlockLocation {
  const blocksPerRow = Math.floor(width / BLOCK_SIZE);
  return { row: Math.floor(index / blocksPerRow), col: index % blocksPerRow, blocksPerRow };
}

// Ambil blok 8x8 kanal Y (luminance) + krominansi Cb/Cr dari RGB mentah.
function readBlock(rgb: Buffer, width: number, loc: BlockLocation) {
  const Y = new Float64Array(64);
  const Cb = new Float64Array(64);
  const Cr = new Float64Array(64);
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    const px = ((loc.row * 8 + x) * width + loc.col * 8 + y) * 3;
    const r = rgb[px], g = rgb[px + 1], b = rgb[px + 2];
    const i = x * 8 + y;
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    Cb[i] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    Cr[i] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  }
  return { Y, Cb, Cr };
}

function writeBlock(rgb: Buffer, width: number, loc: BlockLocation, Y: Float64Array, Cb: Float64Array, Cr: Float64Array) {
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    const i = x * 8 + y;
    const yv = Y[i], cb = Cb[i] - 128, cr = Cr[i] - 128;
    const px = ((loc.row * 8 + x) * width + loc.col * 8 + y) * 3;
    rgb[px] = clamp8(yv + 1.402 * cr);
    rgb[px + 1] = clamp8(yv - 0.344136 * cb - 0.714136 * cr);
    rgb[px + 2] = clamp8(yv + 1.772 * cb);
  }
}

function clamp8(v: number): number {
  const r = Math.round(v);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}

const idxA = COEFF_A[0] * 8 + COEFF_A[1];
const idxB = COEFF_B[0] * 8 + COEFF_B[1];

// Tanam bit paket biner ke koefisien frekuensi menengah blok 8x8 kanal Y.
// Mengembalikan buffer RGB baru; hanya blok pembawa bit yang diubah.
export function embedPacketRgb(
  rgb: Buffer, width: number, height: number, packet: Buffer, alpha: number = DEFAULT_ALPHA
): Buffer {
  const requiredBits = packet.length * 8;
  const availableBits = blockCount(width, height);
  if (requiredBits > availableBits) throw new CapacityExceededError(requiredBits, availableBits);
  if (alpha <= 0) throw new Error("Alpha harus positif.");

  const out = Buffer.from(rgb);
  for (let bitIndex = 0; bitIndex < requiredBits; bitIndex++) {
    const bit = (packet[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1;
    const loc = locateBlock(bitIndex, width);
    const { Y, Cb, Cr } = readBlock(out, width, loc);
    const F = dct2(Y);
    const diff = F[idxA] - F[idxB];
    const target = bit === 1 ? alpha : -alpha;
    if (bit === 1 ? diff < target : diff > target) {
      // Geser simetris terhadap rata-rata agar energi DC blok tidak berubah.
      const mid = (F[idxA] + F[idxB]) / 2;
      F[idxA] = mid + target / 2;
      F[idxB] = mid - target / 2;
    }
    writeBlock(out, width, loc, idct2(F), Cb, Cr);
  }
  return out;
}

// Ekstraksi bit dari pasangan koefisien menengah (tanpa perlu kunci).
export function extractBitsRgb(rgb: Buffer, width: number, height: number, byteLength: number): Buffer {
  const requiredBits = byteLength * 8;
  if (requiredBits > blockCount(width, height)) {
    throw new WatermarkNotFoundError("Citra terlalu kecil untuk memuat paket watermark.");
  }
  const out = Buffer.alloc(byteLength);
  for (let bitIndex = 0; bitIndex < requiredBits; bitIndex++) {
    const loc = locateBlock(bitIndex, width);
    const { Y } = readBlock(rgb, width, loc);
    const F = dct2(Y);
    const bit = F[idxA] - F[idxB] > 0 ? 1 : 0;
    out[bitIndex >> 3] |= bit << (7 - (bitIndex & 7));
  }
  return out;
}

// Ekstraksi paket lengkap: baca header dulu (magic + PAYLOAD_LEN), lalu sisa paket.
export function extractPacketRgb(rgb: Buffer, width: number, height: number): Buffer {
  const HEADER_BYTES = 4;
  if (capacityBytes(width, height) < HEADER_BYTES) {
    throw new WatermarkNotFoundError("Citra terlalu kecil untuk memuat watermark.");
  }
  const header = extractBitsRgb(rgb, width, height, HEADER_BYTES);
  if (header[0] !== 0x50 || header[1] !== 0x57) throw new WatermarkNotFoundError();
  const payloadLen = header.readUInt16BE(2);
  const totalBytes = 48 + payloadLen; // overhead spesifikasi §4.2
  if (totalBytes > capacityBytes(width, height)) {
    throw new WatermarkNotFoundError("Header watermark rusak: panjang paket melebihi kapasitas citra.");
  }
  return extractBitsRgb(rgb, width, height, totalBytes);
}