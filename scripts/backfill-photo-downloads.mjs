#!/usr/bin/env node
// Operator backfill CLI for generating versioned full-resolution free-download copies
// in `photo-downloads` before cutting over GET /api/photos/download/[id].
//
// Dry-run by default. Pass `--apply` only against an explicitly authorized Supabase project.
// Usage:
//   node scripts/backfill-photo-downloads.mjs [--dry-run | --apply]
//     [--required-terms-version <version>] [--regenerate-version <old-version>]

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import loadTsModule from "./load-ts.cjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKFILL_MOD_PATH = path.resolve(__dirname, "../src/lib/server/photo-download-backfill.ts");

const USAGE = [
  "Penggunaan:",
  "  node scripts/backfill-photo-downloads.mjs [--dry-run | --apply] [--required-terms-version <versi>] [--regenerate-version <versi-lama>]",
  "",
  "Opsi:",
  "  --dry-run                         Mode default: hanya laporkan foto layak/dilewati tanpa menulis apa pun.",
  "  --apply                           Buat salinan unduhan penuh di `photo-downloads` dan perbarui `photos.download_url` untuk foto yang memenuhi syarat (wajib memakai versi Syarat & Ketentuan aktif yang sudah diterbitkan).",
  "  --required-terms-version <versi>  (Hanya untuk audit --dry-run) Cek persetujuan terhadap versi Syarat & Ketentuan tertentu; ditolak pada --apply.",
  "  --regenerate-version <versi-lama> Buat ulang salinan yang masih memakai versi tertentu (mis. iwm-v1-placeholder).",
  "  -h, --help                        Tampilkan bantuan ini.",
].join("\n");

function parseArgs(argv) {
  let apply = false;
  let requiredTermsVersion;
  let regenerateVersion = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "--dry-run") { apply = false; continue; }
    if (arg === "--apply") { apply = true; continue; }
    if (arg === "--required-terms-version") {
      requiredTermsVersion = argv[++i];
      if (!requiredTermsVersion) throw new Error("--required-terms-version membutuhkan nilai versi.");
      continue;
    }
    if (arg === "--regenerate-version") {
      regenerateVersion = argv[++i];
      if (!regenerateVersion) throw new Error("--regenerate-version membutuhkan nilai versi.");
      continue;
    }
    throw new Error(`Opsi tidak dikenal: ${arg}`);
  }

  return { help: false, apply, requiredTermsVersion, regenerateVersion };
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}\n`);
    process.exitCode = 2;
    return;
  }

  if (parsed.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  if (parsed.apply && parsed.requiredTermsVersion !== undefined) {
    process.stderr.write(
      "--required-terms-version tidak diizinkan pada mode --apply; --apply selalu mewajibkan versi Syarat & Ketentuan terbaru yang sudah diterbitkan.\n",
    );
    process.exitCode = 2;
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    process.stderr.write("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib tersedia di environment.\n");
    process.exitCode = 1;
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { runPhotoDownloadBackfill } = loadTsModule.loadTs(BACKFILL_MOD_PATH);

  const adapter = {
    async listPublishedPhotos() {
      const rows = [];
      const pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await admin
          .from("photos")
          .select("id, user_id, image_url, download_url, watermark_enabled, download_watermark_version, status, microstock_url")
          .eq("status", "published")
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw new Error(`Gagal membaca daftar foto: ${error.message}`);
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < pageSize) break;
      }
      return rows;
    },
    async getAuthUser(userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data?.user) return null;
      return { id: data.user.id, app_metadata: data.user.app_metadata };
    },
    storageFrom(bucket) {
      return admin.storage.from(bucket);
    },
    async updatePhotoDownload(photoId, userId, fields) {
      const { error } = await admin
        .from("photos")
        .update(fields)
        .eq("id", photoId)
        .eq("user_id", userId);
      return { error };
    },
  };

  const summary = await runPhotoDownloadBackfill(adapter, {
    apply: parsed.apply,
    requiredTermsVersion: parsed.requiredTermsVersion,
    regenerateVersion: parsed.regenerateVersion,
  });

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.counts.failed > 0) {
    process.exitCode = 1;
  }
}

await main();
