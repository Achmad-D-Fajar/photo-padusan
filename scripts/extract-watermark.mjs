#!/usr/bin/env node
// Standalone Padustock invisible-watermark extractor.
// Imports the exact same shared core module (src/lib/watermark/core.ts) used by the web app.
// Usage: node scripts/extract-watermark.mjs <path-gambar> [--raw | --hex | --json]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import loadTsModule from "./load-ts.cjs";

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_PATH = path.resolve(__dirname, "../src/lib/watermark/core.ts");
const CRYPTO_PATH = path.resolve(__dirname, "../src/lib/server/watermark-crypto.ts");
const IMAGE_PROC_PATH = path.resolve(__dirname, "../src/lib/server/image-processing.ts");

const USAGE = [
  "Penggunaan:",
  "  node scripts/extract-watermark.mjs <path-gambar> [--raw | --hex | --json | --decrypt]",
  "",
  "Opsi:",
  "  --raw      Tulis byte payload mentah persis ke stdout (tanpa newline tambahan).",
  "  --hex      Tulis byte payload dalam format heksadesimal huruf kecil.",
  "  --json     Tulis hasil ekstraksi terstruktur dalam format JSON.",
  "  --decrypt  Dekripsi dan autentikasi sertifikat AES-256-GCM memakai WATERMARK_SECRET_KEY (output JSON).",
  "  -h,--help  Tampilkan bantuan ini.",
].join("\n");

function parseArgs(argv) {
  let mode = "text";
  let filePath = null;

  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      return { help: true };
    }
    if (arg === "--raw" || arg === "--hex" || arg === "--json" || arg === "--decrypt") {
      if (mode !== "text") {
        throw new Error("Pilih hanya satu mode keluaran (--raw, --hex, --json, atau --decrypt).");
      }
      mode = arg.slice(2);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Opsi tidak dikenal: ${arg}`);
    }
    if (filePath !== null) {
      throw new Error("Hanya satu path file gambar yang dapat diberikan.");
    }
    filePath = arg;
  }

  if (!filePath) {
    throw new Error("Path file gambar wajib diberikan.");
  }

  return { help: false, mode, filePath };
}

function writeError(mode, code, message) {
  if (mode === "json" || mode === "decrypt") {
    process.stderr.write(`${JSON.stringify({ ok: false, code, error: message })}\n`);
  } else {
    process.stderr.write(`[${code}] ${message}\n`);
  }
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${USAGE}\n`);
    process.exitCode = 2;
    return;
  }

  if (parsed.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const { mode, filePath } = parsed;
  let imageBuffer;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      writeError(mode, "INVALID_IMAGE", "Path yang diberikan bukan file reguler.");
      process.exitCode = 1;
      return;
    }
    if (stat.size === 0 || stat.size > MAX_IMAGE_BYTES) {
      writeError(
        mode,
        "INVALID_IMAGE",
        "Gambar tidak valid atau ukuran file berada di luar batas 1 byte hingga 50 MB."
      );
      process.exitCode = 1;
      return;
    }
    imageBuffer = fs.readFileSync(filePath);
  } catch (error) {
    const errCode = error && typeof error === "object" && "code" in error ? error.code : null;
    if (errCode === "ENOENT") {
      writeError(mode, "FILE_NOT_FOUND", `File tidak ditemukan: ${filePath}`);
    } else {
      writeError(mode, "FILE_READ_ERROR", `Gagal membaca file: ${filePath}`);
    }
    process.exitCode = 1;
    return;
  }

  const core = loadTsModule.loadTs(CORE_PATH);

  try {
    if (mode === "raw") {
      const result = await core.extractWatermark(imageBuffer);
      process.stdout.write(Buffer.from(result.payload.buffer, result.payload.byteOffset, result.payload.byteLength));
      return;
    }

    if (mode === "hex") {
      const result = await core.extractWatermark(imageBuffer);
      const hex = Buffer.from(result.payload.buffer, result.payload.byteOffset, result.payload.byteLength).toString("hex");
      process.stdout.write(`${hex}\n`);
      return;
    }

    if (mode === "decrypt") {
      const result = await core.extractWatermark(imageBuffer);
      const cache = new Map();
      const cryptoMod = loadTsModule.loadTs(CRYPTO_PATH, {}, cache);
      const imageProc = loadTsModule.loadTs(IMAGE_PROC_PATH, {}, cache);
      if (!cryptoMod.isEncryptedWatermarkPacket(result.payload)) {
        writeError(mode, "UNAUTHENTICATED_PAYLOAD", "Watermark ditemukan tetapi bukan paket sertifikat terenkripsi Padustock.");
        process.exitCode = 1;
        return;
      }
      const secretKey = cryptoMod.getWatermarkSecretKey();
      const buf = Buffer.from(result.payload.buffer, result.payload.byteOffset, result.payload.byteLength);
      const { certificate, packetBytes } = await cryptoMod.decryptPacket(buf, secretKey);
      const actualHash = await imageProc.computeNormalizedImageHash(imageBuffer);
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          authenticated: true,
          version: result.version,
          profile: result.profile,
          packetBytes,
          hashMatch: imageProc.isNormalizedImageHashMatch(certificate.image_hash, actualHash),
          certificate,
        })}\n`
      );
      return;
    }

    if (mode === "json") {
      const result = await core.extractWatermark(imageBuffer);
      const buf = Buffer.from(result.payload.buffer, result.payload.byteOffset, result.payload.byteLength);
      let validUtf8 = true;
      let payloadText = null;
      try {
        payloadText = core.decodeWatermarkText(result.payload);
      } catch {
        validUtf8 = false;
      }
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          version: result.version,
          profile: result.profile,
          byteLength: result.byteLength,
          validUtf8,
          payload: payloadText,
          payloadHex: buf.toString("hex"),
          payloadBase64: buf.toString("base64"),
        })}\n`
      );
      return;
    }

    // Default text mode (strict UTF-8)
    const result = await core.extractWatermarkText(imageBuffer);
    process.stdout.write(
      `Watermark terdeteksi (versi ${result.version}, profil ${result.profile}, ${result.byteLength} byte UTF-8)\nPayload:\n${result.payload}\n`
    );
  } catch (error) {
    if (error instanceof core.WatermarkError) {
      const hint =
        error.code === "INVALID_UTF8" && mode === "text"
          ? " Gunakan --raw, --hex, --json, atau --decrypt untuk membaca byte biner/sertifikat terenkripsi."
          : "";
      writeError(mode, error.code, `${error.message}${hint}`);
    } else if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
      writeError(mode, error.code, error instanceof Error ? error.message : "Ekstraksi gagal.");
    } else {
      writeError(mode, "EXTRACTION_ERROR", error instanceof Error ? error.message : "Ekstraksi gagal.");
    }
    process.exitCode = 1;
  }
}

await main();
