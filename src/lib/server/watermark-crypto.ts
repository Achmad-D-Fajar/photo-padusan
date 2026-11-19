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

export class WatermarkCryptoError extends Error {
  constructor(message: string) { super(message); this.name = "WatermarkCryptoError"; }
}

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
    license_terms: "CC BY-NC-ND 4.0",
    creation_timestamp: input.creationTimestamp ?? new Date().toISOString(),
    image_hash: input.imageHash,
    server_signature: "PADUSTOCK-OFFICIAL-VERIFIED",
    site_origin: input.siteOrigin ?? "https://padustock.vercel.app",
  };
  if (input.referencePayload) cert.reference_payload = input.referencePayload;
  return cert;
}

export function validateCertificate(value: unknown): CopyrightCertificate {
  if (!value || typeof value !== "object") throw new WatermarkCryptoError("Sertifikat tidak valid: bukan objek JSON.");
  const cert = value as Record<string, unknown>;
  if (cert.protocol !== WATERMARK_PROTOCOL) throw new WatermarkCryptoError("Sertifikat tidak valid: protokol tidak dikenal.");
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

// Enkripsi sertifikat menjadi paket biner siap tanam (spesifikasi §4.2).
export async function encryptCertificate(cert: CopyrightCertificate, passphrase: string): Promise<EncryptedPacket> {
  const plaintext = Buffer.from(JSON.stringify(cert), "utf8");
  if (plaintext.length > MAX_CIPHERTEXT_BYTES) {
    throw new WatermarkCryptoError(`Sertifikat terlalu besar: ${plaintext.length} byte (maks. ${MAX_CIPHERTEXT_BYTES}).`);
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
    throw new WatermarkCryptoError("Authentication Error (Invalid Tag): passphrase salah atau watermark telah dimanipulasi.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(plaintext.toString("utf8")); } catch {
    throw new WatermarkCryptoError("Sertifikat tidak valid: JSON rusak.");
  }
  return { certificate: validateCertificate(parsed), packetBytes: packet.length };
}

// SHA-256 representasi piksel (lihat watermark-image.ts untuk normalisasi citra).
export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}