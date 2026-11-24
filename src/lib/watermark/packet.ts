import { createHash, timingSafeEqual } from "node:crypto";

export const WATERMARK_MAGIC = new Uint8Array([0x50, 0x44, 0x49, 0x57]); // ASCII "PDIW"
export const WATERMARK_VERSION = 1;
export const WATERMARK_PROFILE = 1;
export const WATERMARK_HEADER_BYTES = 8; // 4 magic + 1 version + 1 profile + 2 big-endian length
export const WATERMARK_DIGEST_BYTES = 32; // SHA-256
export const WATERMARK_OVERHEAD_BYTES = WATERMARK_HEADER_BYTES + WATERMARK_DIGEST_BYTES; // 40 bytes
export const MAX_WATERMARK_PAYLOAD_BYTES = 512;
export const WATERMARK_REPETITION = 3;
export const WATERMARK_PRNG_SEED = 0x50444957;
export const MIN_WATERMARK_BLOCKS = WATERMARK_OVERHEAD_BYTES * 8 * WATERMARK_REPETITION; // 960 blocks

export type WatermarkErrorCode =
  | "INVALID_IMAGE"
  | "IMAGE_TOO_SMALL"
  | "CAPACITY_EXCEEDED"
  | "NO_WATERMARK"
  | "UNSUPPORTED_VERSION"
  | "UNSUPPORTED_PROFILE"
  | "INVALID_LENGTH"
  | "INTEGRITY_FAILED"
  | "INVALID_UTF8";

export interface WatermarkCapacityDetails {
  blocksX: number;
  blocksY: number;
  completeBlocks: number;
  bitSlots: number;
  packetCapacityBytes: number;
  payloadCapacityBytes: number;
  canEmbedEmptyPayload: boolean;
}

export interface ParsedPacketHeader {
  version: number;
  profile: number;
  payloadLength: number;
}

export class WatermarkError extends Error {
  readonly code: WatermarkErrorCode;
  readonly details?: Record<string, number | string>;

  constructor(code: WatermarkErrorCode, message: string, details?: Record<string, number | string>) {
    super(message);
    this.name = "WatermarkError";
    this.code = code;
    this.details = details;
  }
}

export function getWatermarkCapacityDetails(width: number, height: number): WatermarkCapacityDetails {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return {
      blocksX: 0,
      blocksY: 0,
      completeBlocks: 0,
      bitSlots: 0,
      packetCapacityBytes: 0,
      payloadCapacityBytes: 0,
      canEmbedEmptyPayload: false,
    };
  }
  const blocksX = Math.floor(width / 8);
  const blocksY = Math.floor(height / 8);
  const completeBlocks = blocksX * blocksY;
  const bitSlots = Math.floor(completeBlocks / WATERMARK_REPETITION);
  const packetCapacityBytes = Math.floor(completeBlocks / (8 * WATERMARK_REPETITION));
  const payloadCapacityBytes = Math.max(
    0,
    Math.min(MAX_WATERMARK_PAYLOAD_BYTES, packetCapacityBytes - WATERMARK_OVERHEAD_BYTES)
  );
  return {
    blocksX,
    blocksY,
    completeBlocks,
    bitSlots,
    packetCapacityBytes,
    payloadCapacityBytes,
    canEmbedEmptyPayload: packetCapacityBytes >= WATERMARK_OVERHEAD_BYTES,
  };
}

export function getWatermarkCapacity(width: number, height: number): number {
  return getWatermarkCapacityDetails(width, height).payloadCapacityBytes;
}

export function xorshift32Next(state: number): number {
  let s = state >>> 0;
  s = (s ^ (s << 13)) >>> 0;
  s = (s ^ (s >>> 17)) >>> 0;
  s = (s ^ (s << 5)) >>> 0;
  return s;
}

export function buildBlockPermutation(
  totalBlocks: number,
  seed: number = WATERMARK_PRNG_SEED
): Uint32Array {
  const order = new Uint32Array(totalBlocks);
  for (let i = 0; i < totalBlocks; i++) {
    order[i] = i;
  }
  let state = seed >>> 0;
  for (let i = totalBlocks - 1; i > 0; i--) {
    state = xorshift32Next(state);
    const j = state % (i + 1);
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  return order;
}

export function encodePacket(payload: Uint8Array): Uint8Array {
  if (!(payload instanceof Uint8Array)) {
    throw new WatermarkError("CAPACITY_EXCEEDED", "Payload harus berupa Uint8Array.");
  }
  if (payload.byteLength > MAX_WATERMARK_PAYLOAD_BYTES) {
    throw new WatermarkError(
      "CAPACITY_EXCEEDED",
      `Ukuran payload (${payload.byteLength} byte) melebihi batas maksimum ${MAX_WATERMARK_PAYLOAD_BYTES} byte.`,
      { payloadBytes: payload.byteLength, maxBytes: MAX_WATERMARK_PAYLOAD_BYTES }
    );
  }
  const bodyLength = WATERMARK_HEADER_BYTES + payload.byteLength;
  const packet = new Uint8Array(bodyLength + WATERMARK_DIGEST_BYTES);
  packet.set(WATERMARK_MAGIC, 0);
  packet[4] = WATERMARK_VERSION;
  packet[5] = WATERMARK_PROFILE;
  packet[6] = (payload.byteLength >>> 8) & 0xff;
  packet[7] = payload.byteLength & 0xff;
  packet.set(payload, WATERMARK_HEADER_BYTES);

  const digest = createHash("sha256").update(packet.subarray(0, bodyLength)).digest();
  packet.set(digest, bodyLength);
  return packet;
}

export function parsePacketHeader(
  headerBytes: Uint8Array,
  imagePayloadCapacityBytes: number
): ParsedPacketHeader {
  if (headerBytes.byteLength !== WATERMARK_HEADER_BYTES) {
    throw new WatermarkError("NO_WATERMARK", "Header watermark tidak lengkap.");
  }
  for (let i = 0; i < WATERMARK_MAGIC.byteLength; i++) {
    if (headerBytes[i] !== WATERMARK_MAGIC[i]) {
      throw new WatermarkError("NO_WATERMARK", "Watermark tersembunyi yang didukung tidak terdeteksi.");
    }
  }
  const version = headerBytes[4];
  if (version !== WATERMARK_VERSION) {
    throw new WatermarkError(
      "UNSUPPORTED_VERSION",
      `Versi paket watermark (${version}) tidak didukung.`,
      { version }
    );
  }
  const profile = headerBytes[5];
  if (profile !== WATERMARK_PROFILE) {
    throw new WatermarkError(
      "UNSUPPORTED_PROFILE",
      `Profil paket watermark (${profile}) tidak didukung.`,
      { profile }
    );
  }
  const payloadLength = (headerBytes[6] << 8) | headerBytes[7];
  const maxAllowed = Math.min(MAX_WATERMARK_PAYLOAD_BYTES, imagePayloadCapacityBytes);
  if (payloadLength > maxAllowed) {
    throw new WatermarkError(
      "INVALID_LENGTH",
      `Panjang payload pada header (${payloadLength} byte) tidak valid untuk kapasitas gambar (${maxAllowed} byte).`,
      { payloadLength, maxAllowed }
    );
  }
  return { version, profile, payloadLength };
}

export function verifyPacket(packetBytes: Uint8Array, payloadLength: number): Uint8Array {
  const expectedTotal = WATERMARK_OVERHEAD_BYTES + payloadLength;
  if (packetBytes.byteLength !== expectedTotal) {
    throw new WatermarkError("INVALID_LENGTH", "Ukuran paket watermark tidak sesuai dengan header.");
  }
  const bodyLength = WATERMARK_HEADER_BYTES + payloadLength;
  const computedDigest = createHash("sha256").update(packetBytes.subarray(0, bodyLength)).digest();
  const extractedDigest = packetBytes.subarray(bodyLength, expectedTotal);

  if (!timingSafeEqual(computedDigest, extractedDigest)) {
    throw new WatermarkError(
      "INTEGRITY_FAILED",
      "Pemeriksaan integritas SHA-256 gagal. Data watermark rusak atau tidak utuh."
    );
  }
  return packetBytes.slice(WATERMARK_HEADER_BYTES, bodyLength);
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export function encodeWatermarkText(text: string): Uint8Array {
  return utf8Encoder.encode(text);
}

export function decodeWatermarkText(bytes: Uint8Array): string {
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    throw new WatermarkError(
      "INVALID_UTF8",
      "Byte payload yang diekstrak bukan teks UTF-8 yang valid."
    );
  }
}
