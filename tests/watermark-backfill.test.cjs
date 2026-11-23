const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const sharp = require("sharp");
const { loadTs } = require("./helpers/load-ts.cjs");

const moduleCache = new Map();
const { runPhotoDownloadBackfill, hasAuthorizedTermsAcceptance } = loadTs(
  "src/lib/server/photo-download-backfill.ts",
  {},
  moduleCache
);
const { extractWatermark, extractWatermarkText, encodeWatermarkText, WatermarkError } = loadTs(
  "src/lib/watermark/core.ts",
  {},
  moduleCache
);
const { LEGAL_DOCUMENTS } = loadTs("src/lib/legal-documents.ts", {}, moduleCache);

function createTexturedRgb(width, height, seed = 42) {
  const rgb = Buffer.alloc(width * height * 3);
  let s = seed >>> 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const noise = ((s >>> 24) - 128) * 0.08;
      const off = (y * width + x) * 3;
      rgb[off] = Math.min(255, Math.max(0, Math.round(50 + (155 * x) / width + 16 * Math.sin(x / 17) + noise)));
      rgb[off + 1] = Math.min(255, Math.max(0, Math.round(60 + (140 * y) / height + 16 * Math.cos(y / 19) + noise)));
      rgb[off + 2] = Math.min(255, Math.max(0, Math.round(70 + (120 * (width - x)) / width + noise)));
    }
  }
  return rgb;
}

function makeMockAdapter(rows, authUsers, originalBytes, { failUpdateIds = new Set() } = {}) {
  const downloads = new Map();
  const removed = [];
  const dbUpdates = [];
  const originalsMutated = [];

  for (const row of rows) {
    if (row.download_url) {
      const marker = "/storage/v1/object/public/photo-downloads/";
      const p = row.download_url.slice(row.download_url.indexOf(marker) + marker.length);
      downloads.set(p, Buffer.from("existing-download-bytes"));
    }
  }

  const adapter = {
    async listPublishedPhotos() {
      return rows.map(r => ({ ...r }));
    },
    async getAuthUser(userId) {
      return authUsers.get(userId) ?? null;
    },
    storageFrom(bucket) {
      if (bucket === "originals") {
        return {
          info: async () => ({ data: { size: originalBytes.byteLength }, error: null }),
          download: async () => ({ data: new Blob([originalBytes]), error: null }),
          upload: async p => { originalsMutated.push(["upload", p]); return { error: null }; },
          getPublicUrl: p => ({ data: { publicUrl: `https://example.test/storage/v1/object/public/originals/${p}` } }),
          remove: async paths => { originalsMutated.push(["remove", paths]); return { error: null }; },
        };
      }
      if (bucket === "photo-downloads") {
        return {
          info: async p => ({ data: downloads.has(p) ? { size: downloads.get(p).byteLength } : null, error: null }),
          download: async p => ({ data: downloads.has(p) ? new Blob([downloads.get(p)]) : null, error: null }),
          upload: async (p, buf) => { downloads.set(p, Buffer.from(buf)); return { error: null }; },
          getPublicUrl: p => ({ data: { publicUrl: `https://example.test/storage/v1/object/public/photo-downloads/${p}` } }),
          remove: async paths => {
            for (const p of paths) {
              removed.push(p);
              downloads.delete(p);
            }
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected bucket: ${bucket}`);
    },
    async updatePhotoDownload(photoId, userId, fields) {
      if (failUpdateIds.has(photoId)) {
        return { error: { message: "Simulated DB failure" } };
      }
      const target = rows.find(r => r.id === photoId && r.user_id === userId);
      assert.ok(target);
      Object.assign(target, fields);
      dbUpdates.push({ photoId, userId, ...fields });
      return { error: null };
    },
  };

  return { adapter, downloads, removed, dbUpdates, originalsMutated };
}

test("hasAuthorizedTermsAcceptance enforces exact current terms-3 and privacy-3 versions and rejects older records", () => {
  const version = LEGAL_DOCUMENTS.terms.version;
  const privacyVersion = LEGAL_DOCUMENTS.privacy.version;
  assert.equal(version, "terms-3");
  assert.equal(privacyVersion, "privacy-3");
  assert.equal(LEGAL_DOCUMENTS.terms.publishedOn, null);
  assert.equal(LEGAL_DOCUMENTS.privacy.publishedOn, null);
  assert.equal(hasAuthorizedTermsAcceptance(null, version), false);
  assert.equal(hasAuthorizedTermsAcceptance({ id: "u", app_metadata: {} }, version), false);
  assert.equal(
    hasAuthorizedTermsAcceptance(
      {
        id: "u",
        app_metadata: {
          legal_acknowledgment: { terms_version: "terms-2", privacy_version: "privacy-2", accepted_at: "2026-10-29T00:00:00Z" },
        },
      },
      version
    ),
    false
  );
  // Current terms-3 with older privacy-2 MUST be rejected
  assert.equal(
    hasAuthorizedTermsAcceptance(
      {
        id: "u",
        app_metadata: {
          legal_acknowledgment: { terms_version: version, privacy_version: "privacy-2", accepted_at: "2026-11-24T00:00:00Z" },
        },
      },
      version
    ),
    false
  );
  assert.equal(
    hasAuthorizedTermsAcceptance(
      {
        id: "u",
        app_metadata: {
          legal_acknowledgment: { terms_version: version, privacy_version: privacyVersion, accepted_at: "2026-11-24T00:00:00Z" },
        },
      },
      version
    ),
    true
  );
});

test("backfill dry-run reports unknown preferences and unauthorized terms without writing; apply refuses unpublished terms by default, and when allowed is idempotent, versioned, and rolls back on DB failure", async () => {
  const sourceJpeg = await sharp(createTexturedRgb(640, 480, 99), {
    raw: { width: 640, height: 480, channels: 3 },
  })
    .jpeg({ quality: 92 })
    .toBuffer();

  const authOwner = "11111111-1111-4111-8111-111111111111";
  const legacyOwner = "22222222-2222-4222-8222-222222222222";
  const currentTerms = LEGAL_DOCUMENTS.terms.version;

  const authUsers = new Map([
    [
      authOwner,
      {
        id: authOwner,
        app_metadata: {
          legal_acknowledgment: {
            terms_version: currentTerms,
            privacy_version: LEGAL_DOCUMENTS.privacy.version,
            accepted_at: "2026-11-24T00:00:00Z",
          },
        },
      },
    ],
    // Accepted older terms-2 only -> MUST NOT be treated as having accepted terms-3!
    [
      legacyOwner,
      {
        id: legacyOwner,
        app_metadata: {
          legal_acknowledgment: {
            terms_version: "terms-2",
            privacy_version: "privacy-2",
            accepted_at: "2026-10-29T00:00:00Z",
          },
        },
      },
    ],
  ]);

  const rows = [
    // Eligible watermarked photo
    {
      id: "photo-wm-enabled",
      user_id: authOwner,
      image_url: `https://example.test/storage/v1/object/public/originals/${authOwner}/orig1.jpg`,
      download_url: null,
      watermark_enabled: true,
      download_watermark_version: null,
      status: "published",
      microstock_url: null,
    },
    // Eligible opted-out photo
    {
      id: "photo-wm-optout",
      user_id: authOwner,
      image_url: `https://example.test/storage/v1/object/public/originals/${authOwner}/orig2.jpg`,
      download_url: null,
      watermark_enabled: false,
      download_watermark_version: null,
      status: "published",
      microstock_url: null,
    },
    // Unknown preference (NULL) -> MUST be reported & skipped
    {
      id: "photo-unknown-pref",
      user_id: authOwner,
      image_url: `https://example.test/storage/v1/object/public/originals/${authOwner}/orig3.jpg`,
      download_url: null,
      watermark_enabled: null,
      download_watermark_version: null,
      status: "published",
      microstock_url: null,
    },
    // Owner never accepted updated terms -> MUST be reported & skipped
    {
      id: "photo-unauth-terms",
      user_id: legacyOwner,
      image_url: `https://example.test/storage/v1/object/public/originals/${legacyOwner}/orig4.jpg`,
      download_url: null,
      watermark_enabled: true,
      download_watermark_version: null,
      status: "published",
      microstock_url: null,
    },
    // Already has download_url -> skipped_already_current
    {
      id: "photo-already-done",
      user_id: authOwner,
      image_url: `https://example.test/storage/v1/object/public/originals/${authOwner}/orig5.jpg`,
      download_url: `https://example.test/storage/v1/object/public/photo-downloads/${authOwner}/download_existing.jpg`,
      watermark_enabled: true,
      download_watermark_version: "iwm-v1-placeholder",
      status: "published",
      microstock_url: null,
    },
    // External listing -> skipped_not_free
    {
      id: "photo-external",
      user_id: authOwner,
      image_url: `https://example.test/storage/v1/object/public/originals/${authOwner}/orig6.jpg`,
      download_url: null,
      watermark_enabled: true,
      download_watermark_version: null,
      status: "published",
      microstock_url: "https://provider.example/listing",
    },
    // DB update failure -> rolls back newly uploaded copy
    {
      id: "photo-db-fail",
      user_id: authOwner,
      image_url: `https://example.test/storage/v1/object/public/originals/${authOwner}/orig7.jpg`,
      download_url: null,
      watermark_enabled: true,
      download_watermark_version: null,
      status: "published",
      microstock_url: null,
    },
  ];

  const { adapter, downloads, removed, dbUpdates, originalsMutated } = makeMockAdapter(
    rows,
    authUsers,
    sourceJpeg,
    { failUpdateIds: new Set(["photo-db-fail"]) }
  );

  // 1. Dry-run makes zero writes and classifies every photo explicitly
  const dryRun = await runPhotoDownloadBackfill(adapter, { apply: false });
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.termsPublishedOn, null);
  assert.deepEqual(dryRun.counts, {
    eligible: 3, // photo-wm-enabled, photo-wm-optout, photo-db-fail
    updated: 0,
    skipped_not_free: 1,
    skipped_already_current: 1,
    skipped_unknown_preference: 1,
    skipped_unauthorized_terms: 1,
    failed: 0,
  });
  assert.equal(dbUpdates.length, 0);
  assert.equal(originalsMutated.length, 0);

  // 1b. Apply unconditionally refuses to run against unpublished legal documents (no escape hatch!)
  await assert.rejects(
    runPhotoDownloadBackfill(adapter, { apply: true }),
    /publishedOn=null/
  );
  await assert.rejects(
    runPhotoDownloadBackfill(adapter, { apply: true, allowUnpublishedTerms: true }),
    /publishedOn=null/
  );
  // 1c. Passing an older requiredTermsVersion (e.g. terms-2) CANNOT bypass the guard or authorize apply
  await assert.rejects(
    runPhotoDownloadBackfill(adapter, { apply: true, requiredTermsVersion: "terms-2" }),
    /must match current LEGAL_DOCUMENTS\.terms\.version/
  );
  assert.equal(dbUpdates.length, 0);

  // Also verify apply still refuses if only terms is published while privacy remains unpublished
  const partialLegalDocs = loadTs("src/lib/legal-documents.ts", {}, new Map());
  const { runPhotoDownloadBackfill: runPartialPublished } = loadTs(
    "src/lib/server/photo-download-backfill.ts",
    {
      "@/lib/legal-documents": {
        ...partialLegalDocs,
        LEGAL_DOCUMENTS: {
          terms: { ...LEGAL_DOCUMENTS.terms, publishedOn: "2026-11-24" },
          privacy: { ...LEGAL_DOCUMENTS.privacy, publishedOn: null },
        },
      },
    }
  );
  await assert.rejects(runPartialPublished(adapter, { apply: true }), /publishedOn=null/);

  // Load helper with both terms & privacy marked published (test-only stub) to exercise apply mode
  const { runPhotoDownloadBackfill: runPublishedBackfill } = loadTs(
    "src/lib/server/photo-download-backfill.ts",
    {
      "@/lib/legal-documents": {
        ...partialLegalDocs,
        LEGAL_DOCUMENTS: {
          terms: { ...LEGAL_DOCUMENTS.terms, publishedOn: "2026-11-24" },
          privacy: { ...LEGAL_DOCUMENTS.privacy, publishedOn: "2026-11-24" },
        },
      },
    }
  );
  await assert.rejects(
    runPublishedBackfill(adapter, { apply: true, requiredTermsVersion: "terms-2" }),
    /must match current LEGAL_DOCUMENTS\.terms\.version/
  );

  // 2. Apply (once both legal documents are published) generates watermarked & opt-out copies, skips unknown/unauthorized, rolls back DB failure
  const applied = await runPublishedBackfill(adapter, { apply: true });
  assert.equal(applied.mode, "apply");
  assert.deepEqual(applied.counts, {
    eligible: 0,
    updated: 2,
    skipped_not_free: 1,
    skipped_already_current: 1,
    skipped_unknown_preference: 1,
    skipped_unauthorized_terms: 1,
    failed: 1, // photo-db-fail
  });
  assert.equal(originalsMutated.length, 0);
  // Rolled-back photo-db-fail upload must have been deleted
  assert.equal(removed.filter(p => p.includes("photo-db-fail")).length, 1);

  // Verify embedded watermark on photo-wm-enabled and NO_WATERMARK on photo-wm-optout
  const wmRow = rows.find(r => r.id === "photo-wm-enabled");
  assert.equal(wmRow.download_watermark_version, "iwm-v1-placeholder");
  const wmPath = wmRow.download_url.split("/photo-downloads/")[1];
  const wmExtracted = await extractWatermarkText(downloads.get(wmPath));
  assert.equal(wmExtracted.payload, "PADUSTOCK-IWM-v1");

  const optRow = rows.find(r => r.id === "photo-wm-optout");
  assert.equal(optRow.download_watermark_version, "none");
  const optPath = optRow.download_url.split("/photo-downloads/")[1];
  await assert.rejects(
    extractWatermark(downloads.get(optPath)),
    err => err instanceof WatermarkError && err.code === "NO_WATERMARK"
  );

  // 3. Re-running apply is idempotent for already-updated photos
  const secondRun = await runPublishedBackfill(adapter, { apply: true });
  assert.equal(secondRun.counts.updated, 0);
  assert.equal(secondRun.counts.skipped_already_current, 3); // already-done + wm-enabled + wm-optout

  // 4. Versioned regeneration upgrades only placeholder copies to a new version and cleans superseded objects
  const oldWmPath = wmPath;
  const regen = await runPublishedBackfill(adapter, {
    apply: true,
    regenerateVersion: "iwm-v1-placeholder",
    targetWatermarkVersion: "iwm-v1-upgraded",
    resolvePayload: photo => encodeWatermarkText(`UPGRADED:${photo.id}`),
  });
  assert.equal(regen.counts.updated, 2); // photo-wm-enabled + photo-already-done
  assert.equal(regen.counts.skipped_already_current, 1); // photo-wm-optout ("none") untouched
  assert.ok(removed.includes(oldWmPath));

  const upgradedPath = wmRow.download_url.split("/photo-downloads/")[1];
  assert.equal(wmRow.download_watermark_version, "iwm-v1-upgraded");
  const upgradedExtracted = await extractWatermarkText(downloads.get(upgradedPath));
  assert.equal(upgradedExtracted.payload, "UPGRADED:photo-wm-enabled");
  assert.equal(originalsMutated.length, 0);
});

test("backfill CLI --help and invalid flags behave cleanly without touching remote services", () => {
  const cliPath = path.resolve("scripts/backfill-photo-downloads.mjs");
  const help = spawnSync(process.execPath, [cliPath, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--dry-run/);
  assert.match(help.stdout, /--regenerate-version/);

  const badFlag = spawnSync(process.execPath, [cliPath, "--nope"], { encoding: "utf8" });
  assert.equal(badFlag.status, 2);

  const applyWithOverride = spawnSync(
    process.execPath,
    [cliPath, "--apply", "--required-terms-version", "terms-2"],
    { encoding: "utf8" }
  );
  assert.equal(applyWithOverride.status, 2);
  assert.match(applyWithOverride.stderr, /tidak diizinkan pada mode --apply/);
});
