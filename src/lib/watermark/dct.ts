import {
  WATERMARK_HEADER_BYTES,
  WATERMARK_OVERHEAD_BYTES,
  WatermarkError,
  buildBlockPermutation,
  getWatermarkCapacityDetails,
  parsePacketHeader,
  verifyPacket,
} from "./packet";

export const WATERMARK_QIM_DELTA = 48;
export const WATERMARK_COEFF_A_INDEX = 2 * 8 + 3; // DCT[2,3]
export const WATERMARK_COEFF_B_INDEX = 3 * 8 + 2; // DCT[3,2]

// ITU-R BT.601 full-range (JPEG/JFIF) luminance/chrominance constants
const KR = 0.299;
const KB = 0.114;
const KG = 1 - KR - KB; // 0.587
const CB_SCALE = 2 * (1 - KB); // 1.772
const CR_SCALE = 2 * (1 - KR); // 1.402
const G_CB_FACTOR = (2 * KB * (1 - KB)) / KG;
const G_CR_FACTOR = (2 * KR * (1 - KR)) / KG;

// Orthonormal 1D DCT-II basis matrix C[u * 8 + n] = 0.5 * alpha(u) * cos((2n+1)*u*pi/16)
const DCT_COS = new Float64Array(64);
for (let u = 0; u < 8; u++) {
  const alpha = u === 0 ? Math.SQRT1_2 : 1;
  const scale = 0.5 * alpha;
  for (let n = 0; n < 8; n++) {
    DCT_COS[u * 8 + n] = scale * Math.cos(((2 * n + 1) * u * Math.PI) / 16);
  }
}

export function dct8x8(spatial: Float64Array, out: Float64Array = new Float64Array(64)): Float64Array {
  const temp = new Float64Array(64);
  // Row-wise 1D DCT: temp[y][v] = sum_x spatial[y][x] * C[v][x]
  for (let y = 0; y < 8; y++) {
    const rowOff = y * 8;
    for (let v = 0; v < 8; v++) {
      const cOff = v * 8;
      let sum = 0;
      for (let x = 0; x < 8; x++) {
        sum += spatial[rowOff + x] * DCT_COS[cOff + x];
      }
      temp[rowOff + v] = sum;
    }
  }
  // Column-wise 1D DCT: out[u][v] = sum_y C[u][y] * temp[y][v]
  for (let u = 0; u < 8; u++) {
    const cOff = u * 8;
    const outOff = u * 8;
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let y = 0; y < 8; y++) {
        sum += DCT_COS[cOff + y] * temp[y * 8 + v];
      }
      out[outOff + v] = sum;
    }
  }
  return out;
}

export function idct8x8(coeffs: Float64Array, out: Float64Array = new Float64Array(64)): Float64Array {
  const temp = new Float64Array(64);
  // Row-wise 1D IDCT: temp[u][x] = sum_v coeffs[u][v] * C[v][x]
  for (let u = 0; u < 8; u++) {
    const rowOff = u * 8;
    for (let x = 0; x < 8; x++) {
      let sum = 0;
      for (let v = 0; v < 8; v++) {
        sum += coeffs[rowOff + v] * DCT_COS[v * 8 + x];
      }
      temp[rowOff + x] = sum;
    }
  }
  // Column-wise 1D IDCT: out[y][x] = sum_u C[u][y] * temp[u][x]
  for (let y = 0; y < 8; y++) {
    const outOff = y * 8;
    for (let x = 0; x < 8; x++) {
      let sum = 0;
      for (let u = 0; u < 8; u++) {
        sum += DCT_COS[u * 8 + y] * temp[u * 8 + x];
      }
      out[outOff + x] = sum;
    }
  }
  return out;
}

export function rgbToYCbCr(r: number, g: number, b: number): [number, number, number] {
  const y = KR * r + KG * g + KB * b;
  const cb = (b - y) / CB_SCALE + 128;
  const cr = (r - y) / CR_SCALE + 128;
  return [y, cb, cr];
}

export function yCbCrToRgb(y: number, cb: number, cr: number): [number, number, number] {
  const cbOff = cb - 128;
  const crOff = cr - 128;
  const r = y + CR_SCALE * crOff;
  const g = y - G_CB_FACTOR * cbOff - G_CR_FACTOR * crOff;
  const b = y + CB_SCALE * cbOff;
  return [
    Math.min(255, Math.max(0, Math.round(r))),
    Math.min(255, Math.max(0, Math.round(g))),
    Math.min(255, Math.max(0, Math.round(b))),
  ];
}

export function quantizeQimDifference(
  difference: number,
  bit: 0 | 1,
  delta: number = WATERMARK_QIM_DELTA
): number {
  const k = Math.floor((difference / delta - bit) / 2 + 0.5);
  const q = 2 * k + bit;
  return delta * q;
}

export function extractQimBit(difference: number, delta: number = WATERMARK_QIM_DELTA): 0 | 1 {
  const q = Math.floor(difference / delta + 0.5);
  return (((q % 2) + 2) % 2) as 0 | 1;
}

export function majorityVote3(b0: 0 | 1, b1: 0 | 1, b2: 0 | 1): 0 | 1 {
  return (b0 + b1 + b2 >= 2 ? 1 : 0) as 0 | 1;
}

export function embedBitInDctBlock(
  coeffs: Float64Array,
  bit: 0 | 1,
  delta: number = WATERMARK_QIM_DELTA
): void {
  const a = coeffs[WATERMARK_COEFF_A_INDEX];
  const b = coeffs[WATERMARK_COEFF_B_INDEX];
  const d = a - b;
  const targetDifference = quantizeQimDifference(d, bit, delta);
  const adjustment = targetDifference - d;
  coeffs[WATERMARK_COEFF_A_INDEX] = a + adjustment / 2;
  coeffs[WATERMARK_COEFF_B_INDEX] = b - adjustment / 2;
}

export function extractBitFromDctBlock(
  coeffs: Float64Array,
  delta: number = WATERMARK_QIM_DELTA
): 0 | 1 {
  return extractQimBit(coeffs[WATERMARK_COEFF_A_INDEX] - coeffs[WATERMARK_COEFF_B_INDEX], delta);
}

function readBlockLuminanceCentered(
  rgb: Uint8Array,
  width: number,
  blocksX: number,
  blockIndex: number,
  outYCentered: Float64Array
): void {
  const blockRow = Math.floor(blockIndex / blocksX);
  const blockCol = blockIndex % blocksX;
  const y0 = blockRow * 8;
  const x0 = blockCol * 8;
  let k = 0;
  for (let dy = 0; dy < 8; dy++) {
    let pixelOff = ((y0 + dy) * width + x0) * 3;
    for (let dx = 0; dx < 8; dx++) {
      const r = rgb[pixelOff];
      const g = rgb[pixelOff + 1];
      const b = rgb[pixelOff + 2];
      outYCentered[k++] = KR * r + KG * g + KB * b - 128;
      pixelOff += 3;
    }
  }
}

function embedBitInRgbBlock(
  rgb: Uint8Array,
  width: number,
  blocksX: number,
  blockIndex: number,
  bit: 0 | 1,
  yBuf: Float64Array,
  cbBuf: Float64Array,
  crBuf: Float64Array,
  dctBuf: Float64Array
): void {
  const blockRow = Math.floor(blockIndex / blocksX);
  const blockCol = blockIndex % blocksX;
  const y0 = blockRow * 8;
  const x0 = blockCol * 8;

  let k = 0;
  for (let dy = 0; dy < 8; dy++) {
    let pixelOff = ((y0 + dy) * width + x0) * 3;
    for (let dx = 0; dx < 8; dx++) {
      const r = rgb[pixelOff];
      const g = rgb[pixelOff + 1];
      const b = rgb[pixelOff + 2];
      const y = KR * r + KG * g + KB * b;
      yBuf[k] = y - 128;
      cbBuf[k] = (b - y) / CB_SCALE + 128;
      crBuf[k] = (r - y) / CR_SCALE + 128;
      k++;
      pixelOff += 3;
    }
  }

  dct8x8(yBuf, dctBuf);
  embedBitInDctBlock(dctBuf, bit);
  idct8x8(dctBuf, yBuf);

  k = 0;
  for (let dy = 0; dy < 8; dy++) {
    let pixelOff = ((y0 + dy) * width + x0) * 3;
    for (let dx = 0; dx < 8; dx++) {
      const yVal = yBuf[k] + 128;
      const cbOff = cbBuf[k] - 128;
      const crOff = crBuf[k] - 128;
      const r = yVal + CR_SCALE * crOff;
      const g = yVal - G_CB_FACTOR * cbOff - G_CR_FACTOR * crOff;
      const b = yVal + CB_SCALE * cbOff;
      rgb[pixelOff] = Math.min(255, Math.max(0, Math.round(r)));
      rgb[pixelOff + 1] = Math.min(255, Math.max(0, Math.round(g)));
      rgb[pixelOff + 2] = Math.min(255, Math.max(0, Math.round(b)));
      k++;
      pixelOff += 3;
    }
  }
}

export function embedPacketInRgb(
  rgb: Uint8Array,
  width: number,
  height: number,
  packet: Uint8Array
): Uint8Array {
  if (rgb.byteLength !== width * height * 3) {
    throw new WatermarkError("INVALID_IMAGE", "Ukuran buffer RGB mentah tidak sesuai dimensi gambar.");
  }
  const capacity = getWatermarkCapacityDetails(width, height);
  if (!capacity.canEmbedEmptyPayload) {
    throw new WatermarkError(
      "IMAGE_TOO_SMALL",
      `Dimensi gambar (${width}x${height}) terlalu kecil untuk menyisipkan watermark tersembunyi.`,
      { width, height, completeBlocks: capacity.completeBlocks }
    );
  }
  const packetBits = packet.byteLength * 8;
  if (packetBits > capacity.bitSlots) {
    throw new WatermarkError(
      "CAPACITY_EXCEEDED",
      `Ukuran paket (${packet.byteLength} byte) melebihi kapasitas gambar (${capacity.packetCapacityBytes} byte).`,
      { packetBytes: packet.byteLength, capacityBytes: capacity.payloadCapacityBytes }
    );
  }

  const out = new Uint8Array(rgb);
  const order = buildBlockPermutation(capacity.completeBlocks);
  const stride = capacity.bitSlots;
  const yBuf = new Float64Array(64);
  const cbBuf = new Float64Array(64);
  const crBuf = new Float64Array(64);
  const dctBuf = new Float64Array(64);

  for (let byteIdx = 0; byteIdx < packet.byteLength; byteIdx++) {
    const byteVal = packet[byteIdx];
    for (let bitOffset = 0; bitOffset < 8; bitOffset++) {
      const bitIndex = byteIdx * 8 + bitOffset;
      const bit = ((byteVal >>> (7 - bitOffset)) & 1) as 0 | 1;
      embedBitInRgbBlock(out, width, capacity.blocksX, order[bitIndex], bit, yBuf, cbBuf, crBuf, dctBuf);
      embedBitInRgbBlock(out, width, capacity.blocksX, order[stride + bitIndex], bit, yBuf, cbBuf, crBuf, dctBuf);
      embedBitInRgbBlock(out, width, capacity.blocksX, order[2 * stride + bitIndex], bit, yBuf, cbBuf, crBuf, dctBuf);
    }
  }

  return out;
}

export interface ExtractedPacketFromRgb {
  payload: Uint8Array;
  version: number;
  profile: number;
}

export function extractPacketFromRgb(
  rgb: Uint8Array,
  width: number,
  height: number
): ExtractedPacketFromRgb {
  if (rgb.byteLength !== width * height * 3) {
    throw new WatermarkError("INVALID_IMAGE", "Ukuran buffer RGB mentah tidak sesuai dimensi gambar.");
  }
  const capacity = getWatermarkCapacityDetails(width, height);
  if (!capacity.canEmbedEmptyPayload) {
    throw new WatermarkError(
      "NO_WATERMARK",
      "Gambar terlalu kecil untuk memuat watermark tersembunyi yang didukung.",
      { width, height, completeBlocks: capacity.completeBlocks }
    );
  }

  const order = buildBlockPermutation(capacity.completeBlocks);
  const stride = capacity.bitSlots;
  const yBuf = new Float64Array(64);
  const dctBuf = new Float64Array(64);

  const readByte = (byteIdx: number): number => {
    let value = 0;
    for (let bitOffset = 0; bitOffset < 8; bitOffset++) {
      const bitIndex = byteIdx * 8 + bitOffset;
      readBlockLuminanceCentered(rgb, width, capacity.blocksX, order[bitIndex], yBuf);
      const b0 = extractBitFromDctBlock(dct8x8(yBuf, dctBuf));
      readBlockLuminanceCentered(rgb, width, capacity.blocksX, order[stride + bitIndex], yBuf);
      const b1 = extractBitFromDctBlock(dct8x8(yBuf, dctBuf));
      readBlockLuminanceCentered(rgb, width, capacity.blocksX, order[2 * stride + bitIndex], yBuf);
      const b2 = extractBitFromDctBlock(dct8x8(yBuf, dctBuf));
      value = (value << 1) | majorityVote3(b0, b1, b2);
    }
    return value;
  };

  const headerBytes = new Uint8Array(WATERMARK_HEADER_BYTES);
  for (let i = 0; i < WATERMARK_HEADER_BYTES; i++) {
    headerBytes[i] = readByte(i);
  }

  const header = parsePacketHeader(headerBytes, capacity.payloadCapacityBytes);
  const totalBytes = WATERMARK_OVERHEAD_BYTES + header.payloadLength;
  const packetBytes = new Uint8Array(totalBytes);
  packetBytes.set(headerBytes, 0);
  for (let i = WATERMARK_HEADER_BYTES; i < totalBytes; i++) {
    packetBytes[i] = readByte(i);
  }

  const payload = verifyPacket(packetBytes, header.payloadLength);
  return {
    payload,
    version: header.version,
    profile: header.profile,
  };
}
