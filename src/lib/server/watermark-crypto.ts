// SERVER-ONLY. Never import from Client Components.
// Modul kriptografi sertifikat hak cipta Padustock (Member 1 — Tugas Akhir Keamanan Data).
// AES-256-GCM (AEAD) + PBKDF2-HMAC-SHA256, paket biner sesuai spesifikasi §4.
import { randomBytes, pbkdf2 as pbkdf2Cb, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2 = promisify(pbkdf2Cb);

export const WATERMARK_PROTOCOL = "PADUSTOCK-WATERMARK-v1";
export const MAGIC_HEADER = Buffer.from([0x50, 0x57]); // "PW"
export const SALT_BYTES = 16;
export const NONCE_BYTES = 12; // NIST SP 800-38D
export const AUTH_TAG_BYTES = 16;
export const KEY_BYTES = 32; // AES-256
export const PBKDF2_ITERATIONS = 100_000;
export const PACKET_OVERHEAD_BYTES = 2 + 2 + SALT_BYTES + NONCE_BYTES + AUTH_TAG_BYTES; // 48
export const MAX_CIPHERTEXT_BYTES = 0xffff; // PAYLOAD_LEN uint16 big-endian

// AAD mengikat paket ke protokol agar ciphertext tidak bisa dipindah ke konteks lain.
const AAD = Buffer.from(WATERMARK_PROTOCOL, "utf8");

export type WatermarkCryptoErrorCode =
  | "KEY_UNAVAILABLE"
  | "INVALID_KEY"
  | "INVALID_PACKET"
  | "AUTH_FAILED"
  | "INVALID_CERTIFICATE"
  | "PAYLOAD_TOO_LARGE";

export class WatermarkCryptoError extends Error {
  readonly code: WatermarkCryptoErrorCode;
  constructor(message: string, code: WatermarkCryptoErrorCode = "INVALID_PACKET") {
    super(message);
    this.name = "WatermarkCryptoError";
    this.code = code;
  }
}

export type CertificateLicenseMode = "free" | "external" | "draft";

const LICENSE_MODE_TO_LABEL: Record<CertificateLicenseMode, string> = {
  free: "CC BY-NC-ND 4.0",
  external: "Lisensi Eksternal (lihat halaman foto)",
  draft: "Padustock (lihat halaman foto)",
};

const MODE_TO_COMPACT_CODE: Record<CertificateLicenseMode, string> = { free: "f", external: "e", draft: "d" };
const COMPACT_CODE_TO_MODE: Record<string, CertificateLicenseMode> = { f: "free", e: "external", d: "draft" };
const DEFAULT_SITE_ORIGIN = "https://padustock.vercel.app";
const DEFAULT_SERVER_SIGNATURE = "PADUSTOCK-OFFICIAL-VERIFIED";

export interface CopyrightCertificate {
  protocol: typeof WATERMARK_PROTOCOL;
  photo_id: string;
  photographer: string;
  license_terms: string;
  creation_timestamp: string;
  image_hash: string;
  server_signature: string;
  site_origin: string;
  // Payload teks bebas dari form unggah (maks. 512 byte UTF-8), opsional.
  reference_payload?: string;
}

export interface CertificateInput {
  photoId: string;
  photographer: string;
  imageHash: string;
  licenseMode?: CertificateLicenseMode;
  licenseTerms?: string;
  creationTimestamp?: string;
  siteOrigin?: string;
  referencePayload?: string;
}

export const MAX_REFERENCE_PAYLOAD_BYTES = 512;

export function buildCertificate(input: CertificateInput): CopyrightCertificate {
  const cert: CopyrightCertificate = {
    protocol: WATERMARK_PROTOCOL,
    photo_id: input.photoId,
    photographer: input.photographer,
    license_terms: input.licenseTerms ?? LICENSE_MODE_TO_LABEL[input.licenseMode ?? "free"],
    creation_timestamp: input.creationTimestamp ?? new Date().toISOString(),
    image_hash: input.imageHash,
    server_signature: DEFAULT_SERVER_SIGNATURE,
    site_origin: input.siteOrigin ?? (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || DEFAULT_SITE_ORIGIN),
  };
  if (input.referencePayload) cert.reference_payload = input.referencePayload;
  return cert;
}

function hydrateCompactWire(raw: Record<string, unknown>): CopyrightCertificate {
  if (typeof raw.id !== "string" || typeof raw.p !== "string" || typeof raw.l !== "string" || typeof raw.t !== "number" || !Number.isFinite(raw.t) || typeof raw.h !== "string") {
    throw new WatermarkCryptoError("Sertifikat tidak valid: field ringkas rusak.", "INVALID_CERTIFICATE");
  }
  const mode = COMPACT_CODE_TO_MODE[raw.l];
  const cert: CopyrightCertificate = {
    protocol: WATERMARK_PROTOCOL,
    photo_id: raw.id,
    photographer: raw.p,
    license_terms: mode ? LICENSE_MODE_TO_LABEL[mode] : raw.l,
    creation_timestamp: new Date(raw.t * 1000).toISOString(),
    image_hash: raw.h,
    server_signature: DEFAULT_SERVER_SIGNATURE,
    site_origin: typeof raw.o === "string" && raw.o.trim() ? raw.o.trim() : (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || DEFAULT_SITE_ORIGIN),
  };
  if (raw.r !== undefined) {
    if (typeof raw.r !== "string") throw new WatermarkCryptoError("Sertifikat tidak valid: reference_payload rusak.", "INVALID_CERTIFICATE");
    cert.reference_payload = raw.r;
  }
  return validateCertificate(cert);
}

export function validateCertificate(value: unknown): CopyrightCertificate {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WatermarkCryptoError("Sertifikat tidak valid: bukan objek JSON.", "INVALID_CERTIFICATE");
  const cert = value as Record<string, unknown>;
  if (cert.v === 2 && !("protocol" in cert)) return hydrateCompactWire(cert);
  if (cert.protocol !== WATERMARK_PROTOCOL) throw new WatermarkCryptoError("Sertifikat tidak valid: protokol tidak dikenal.", "INVALID_CERTIFICATE");
  for (const field of ["photo_id", "photographer", "license_terms", "creation_timestamp", "server_signature", "site_origin"]) {
    if (typeof cert[field] !== "string" || (cert[field] as string).length === 0 || (cert[field] as string).length > 512) {
      throw new WatermarkCryptoError(`Sertifikat tidak valid: field ${field} rusak.`);
    }
  }
  if (typeof cert.image_hash !== "string" || !/^[0-9a-f]{64}$/.test(cert.image_hash)) {
    throw new WatermarkCryptoError("Sertifikat tidak valid: image_hash bukan SHA-256 heksadesimal.");
  }
  if ("reference_payload" in cert) {
    const payload = cert.reference_payload;
    if (typeof payload !== "string" || payload.length === 0 || Buffer.byteLength(payload, "utf8") > MAX_REFERENCE_PAYLOAD_BYTES) {
      throw new WatermarkCryptoError("Sertifikat tidak valid: reference_payload rusak atau melebihi 512 byte.");
    }
  }
  return cert as unknown as CopyrightCertificate;
}

export async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  if (typeof passphrase !== "string" || passphrase.length < 8 || passphrase.length > 128) {
    throw new WatermarkCryptoError("Passphrase harus sepanjang 8–128 karakter.");
  }
  if (salt.length !== SALT_BYTES) throw new WatermarkCryptoError("Salt harus 16 byte.");
  return pbkdf2(passphrase.normalize("NFKC"), salt, PBKDF2_ITERATIONS, KEY_BYTES, "sha256");
}

export interface EncryptedPacket {
  packet: Buffer; // MAGIC | PAYLOAD_LEN | SALT | NONCE | CIPHERTEXT | AUTH_TAG
  salt: Buffer;
  nonce: Buffer;
}

function serializeCertificateForWire(cert: CopyrightCertificate): Buffer {
  const matched = Object.entries(LICENSE_MODE_TO_LABEL).find(([, label]) => label === cert.license_terms);
  const parsedTime = Date.parse(cert.creation_timestamp);
  const wire: Record<string, unknown> = {
    v: 2,
    id: cert.photo_id,
    p: cert.photographer,
    l: matched ? MODE_TO_COMPACT_CODE[matched[0] as CertificateLicenseMode] : cert.license_terms,
    t: Number.isFinite(parsedTime) ? Math.floor(parsedTime / 1000) : Math.floor(Date.now() / 1000),
    h: cert.image_hash,
  };
  const defaultOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || DEFAULT_SITE_ORIGIN;
  if (cert.site_origin && cert.site_origin !== defaultOrigin && cert.site_origin !== DEFAULT_SITE_ORIGIN) {
    wire.o = cert.site_origin;
  }
  if (cert.reference_payload) wire.r = cert.reference_payload;
  return Buffer.from(JSON.stringify(wire), "utf8");
}

// Enkripsi sertifikat menjadi paket biner siap tanam (spesifikasi §4.2).
export async function encryptCertificate(cert: CopyrightCertificate, passphrase: string): Promise<EncryptedPacket> {
  const plaintext = serializeCertificateForWire(validateCertificate(cert));
  if (plaintext.length > MAX_CIPHERTEXT_BYTES) {
    throw new WatermarkCryptoError(`Sertifikat terlalu besar: ${plaintext.length} byte (maks. ${MAX_CIPHERTEXT_BYTES}).`, "PAYLOAD_TOO_LARGE");
  }
  const salt = randomBytes(SALT_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const key = await deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.alloc(4);
  MAGIC_HEADER.copy(header, 0);
  header.writeUInt16BE(ciphertext.length, 2);
  return { packet: Buffer.concat([header, salt, nonce, ciphertext, tag]), salt, nonce };
}

export interface ParsedPacket {
  salt: Buffer;
  nonce: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
}

// Parsing defensif: setiap penyimpangan struktur ditolak sebelum menyentuh kripto.
export function parsePacket(packet: Buffer): ParsedPacket {
  if (packet.length < PACKET_OVERHEAD_BYTES) throw new WatermarkCryptoError("Paket watermark terlalu pendek.");
  if (!packet.subarray(0, 2).equals(MAGIC_HEADER)) throw new WatermarkCryptoError("Magic header watermark tidak dikenali (bukan PW).");
  const payloadLen = packet.readUInt16BE(2);
  if (packet.length !== PACKET_OVERHEAD_BYTES + payloadLen) {
    throw new WatermarkCryptoError("Panjang paket tidak sesuai PAYLOAD_LEN — data rusak atau terpotong.");
  }
  let offset = 4;
  const salt = packet.subarray(offset, offset += SALT_BYTES);
  const nonce = packet.subarray(offset, offset += NONCE_BYTES);
  const ciphertext = packet.subarray(offset, offset += payloadLen);
  const authTag = packet.subarray(offset, offset + AUTH_TAG_BYTES);
  return { salt, nonce, ciphertext, authTag };
}

export interface DecryptionResult {
  certificate: CopyrightCertificate;
  packetBytes: number;
}

// Dekripsi + verifikasi tag autentikasi. Tag salah / passphrase salah → WatermarkCryptoError.
export async function decryptPacket(packet: Buffer, passphrase: string): Promise<DecryptionResult> {
  const { salt, nonce, ciphertext, authTag } = parsePacket(packet);
  const key = await deriveKey(passphrase, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(AAD);
  decipher.setAuthTag(authTag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new WatermarkCryptoError("Authentication Error (Invalid Tag): passphrase salah atau watermark telah dimanipulasi.", "AUTH_FAILED");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(plaintext.toString("utf8")); } catch {
    throw new WatermarkCryptoError("Sertifikat tidak valid: JSON rusak.", "INVALID_CERTIFICATE");
  }
  return { certificate: validateCertificate(parsed), packetBytes: packet.length };
}

// SHA-256 representasi piksel.
export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

// Server-managed key (keputusan proyek: tanpa input passphrase fotografer).
export function getWatermarkSecretKey(): string {
  const raw = process.env.WATERMARK_SECRET_KEY;
  if (typeof raw !== "string" || raw.trim().length < 8 || raw.trim().length > 128) {
    throw new WatermarkCryptoError(
      "Kunci watermark server (WATERMARK_SECRET_KEY) belum dikonfigurasi atau tidak valid (harus 8–128 karakter).",
      "KEY_UNAVAILABLE",
    );
  }
  return raw.trim();
}

export function isEncryptedWatermarkPacket(bytes: Uint8Array): boolean {
  return bytes.length >= PACKET_OVERHEAD_BYTES && bytes[0] === MAGIC_HEADER[0] && bytes[1] === MAGIC_HEADER[1];
}

export function formatCertificateText(cert: CopyrightCertificate): string {
  const lines = [
    `Protokol: ${cert.protocol}`,
    `ID Foto: ${cert.photo_id}`,
    `Fotografer: ${cert.photographer}`,
    `Lisensi: ${cert.license_terms}`,
    `Waktu Tanam: ${cert.creation_timestamp}`,
    `Asal Situs: ${cert.site_origin}`,
    `Penanda Server: ${cert.server_signature}`,
    `Image Hash: ${cert.image_hash}`,
  ];
  if (cert.reference_payload) lines.push(`Payload Referensi: ${cert.reference_payload}`);
  return lines.join("\n");
}