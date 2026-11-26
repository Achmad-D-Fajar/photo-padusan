#!/usr/bin/env node
// Reusable live Playwright E2E verification suite for Padustock.
// Runs against the deployed site (default: https://padustock.vercel.app) using
// an isolated headless Microsoft Edge browser — never touches personal tabs/cookies,
// never hardcodes credentials, and deletes all temporary test photos in finally.
//
// Usage (PowerShell):
//   $env:LIVE_USERNAME="joni_fotografi"
//   $env:LIVE_PASSWORD="your-password"
//   npm run verify:live
//
// Optional flags / env vars:
//   --headed              Show the browser window while running
//   --only <list>         Run only specific scenario numbers (e.g. --only 6 or --only 2,6)
//   --url <base-url>      Override target URL (or set LIVE_BASE_URL)
//   PLAYWRIGHT_CHANNEL    Browser channel (default: msedge)
//   HEIC_TEST_FILE        Optional local .heic path to include a real HEIC upload test

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "@playwright/test";

const USAGE = [
  "Penggunaan:",
  "  LIVE_USERNAME=<user> LIVE_PASSWORD=<pass> node scripts/verify-live.mjs [--headed] [--only <n,...>] [--url <url>]",
  "",
  "Environment variables:",
  "  LIVE_USERNAME       Username atau email akun uji (wajib)",
  "  LIVE_PASSWORD       Password akun uji (wajib)",
  "  LIVE_BASE_URL       Target URL (default: https://padustock.vercel.app)",
  "  PLAYWRIGHT_CHANNEL  Channel browser Playwright (default: msedge)",
  "  HEIC_TEST_FILE      Opsional: path file .heic lokal untuk uji unggah HEIC nyata",
].join("\n");

function parseArgs(argv) {
  let headed = false;
  let only = null;
  let baseUrl = process.env.LIVE_BASE_URL || "https://padustock.vercel.app";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "--headed") {
      headed = true;
      continue;
    }
    if (arg === "--only") {
      only = argv[++i];
      if (!only) throw new Error("--only membutuhkan nomor skenario (mis. 6 atau 2,6).");
      continue;
    }
    if (arg === "--url") {
      baseUrl = argv[++i];
      if (!baseUrl) throw new Error("--url membutuhkan nilai URL.");
      continue;
    }
    throw new Error(`Opsi tidak dikenal: ${arg}`);
  }
  const onlySet = only ? new Set(only.split(",").map(s => s.trim()).filter(Boolean)) : null;
  return { help: false, headed, onlySet, baseUrl: baseUrl.replace(/\/$/, "") };
}

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

async function generateFixtures(tempDir) {
  const makeJpeg = async (name, width, height, seed, quality = 94) => {
    const filePath = path.join(tempDir, name);
    await sharp(createTexturedRgb(width, height, seed), { raw: { width, height, channels: 3 } })
      .jpeg({ quality })
      .toFile(filePath);
    return filePath;
  };
  const corruptPath = path.join(tempDir, "corrupt.jpg");
  fs.writeFileSync(corruptPath, Buffer.from("not-a-valid-jpeg-image-bytes"));

  return {
    wide16x9: await makeJpeg("live-16x9.jpg", 1600, 900, 101),
    standard3x2: await makeJpeg("live-3x2.jpg", 1200, 800, 202),
    plainUnmarked: await makeJpeg("plain-unmarked.jpg", 1200, 800, 303),
    tiny100: await makeJpeg("tiny-100x100.jpg", 100, 100, 404),
    corrupt: corruptPath,
  };
}

function safeWaitForResponse(page, predicate, timeout = 90_000) {
  const promise = page.waitForResponse(predicate, { timeout });
  // Prevent Node UnhandledPromiseRejection if an earlier action throws before this is awaited.
  promise.catch(() => undefined);
  return promise;
}

async function uploadViaUi(page, baseUrl, options) {
  const {
    filePath,
    caption,
    tags = "uji, padusan",
    publishDirectly = true,
    watermarkEnabled = true,
    customPayload = "",
    expectStatus = 201,
  } = options;

  await page.goto(`${baseUrl}/dashboard/upload`, { waitUntil: "networkidle" });
  const fileInput = page.locator("#file-input");
  await fileInput.waitFor({ state: "visible", timeout: 15_000 });
  await fileInput.setInputFiles(filePath);

  const previewImg = page.locator('img[alt="Pratinjau"]');
  const formAlert = page.locator('main .alert[role="alert"]').first();
  const previewReady = await Promise.race([
    previewImg.waitFor({ state: "visible", timeout: 45_000 }).then(() => "preview"),
    formAlert.waitFor({ state: "visible", timeout: 45_000 }).then(() => "alert"),
  ]);
  if (previewReady === "alert") {
    throw new Error(`Upload preview failed: ${(await formAlert.innerText()).trim()}`);
  }

  await page.locator("#manual-caption").fill(caption);
  await page.locator("#manual-tags").fill(tags);

  const externalCheckbox = page.getByRole("checkbox", { name: /link Eksternal/i });
  const currentlyChecked = await externalCheckbox.isChecked();
  if (publishDirectly && currentlyChecked) {
    await externalCheckbox.uncheck();
  } else if (!publishDirectly && !currentlyChecked) {
    await externalCheckbox.check();
  }

  // If account hasn't accepted terms-3/privacy-3 yet and publishing directly, accept once
  const termsRadio = page.locator('input[name="upload_terms_acceptance"][value="accepted"]');
  if (await termsRadio.isVisible().catch(() => false)) {
    await termsRadio.check();
  }

  const wmRegion = page.getByRole("region", { name: "Pengaturan watermark tersembunyi" });
  const details = wmRegion.locator("details");
  if ((await details.getAttribute("open")) === null) {
    await wmRegion.locator("summary").click();
  }

  if (!watermarkEnabled) {
    const disableBtn = wmRegion.getByRole("button", { name: "Nonaktifkan watermark", exact: true });
    if (await disableBtn.isVisible().catch(() => false)) {
      await disableBtn.click();
    }
  } else {
    const reenableBtn = wmRegion.getByRole("button", { name: "Aktifkan kembali", exact: true });
    if (await reenableBtn.isVisible().catch(() => false)) {
      await reenableBtn.click();
    }
    if (customPayload) {
      await wmRegion.getByLabel("Teks payload").fill(customPayload);
    }
  }

  const submitLabel = publishDirectly ? "Publikasikan Sekarang" : "Simpan sebagai Draf";
  const submitBtn = page.getByRole("button", { name: submitLabel, exact: true });
  await submitBtn.waitFor({ state: "visible", timeout: 15_000 });
  await page.locator(`button:has-text("${submitLabel}"):not([disabled])`).waitFor({ timeout: 15_000 });

  const draftRespPromise = safeWaitForResponse(
    page,
    res => res.url().endsWith("/api/photos/draft") && res.request().method() === "POST",
    90_000
  );
  const earlyAlertPromise = formAlert
    .waitFor({ state: "visible", timeout: 90_000 })
    .then(async () => ({ earlyAlert: (await formAlert.innerText()).trim() }))
    .catch(() => null);

  await submitBtn.click();
  const race = await Promise.race([
    draftRespPromise.then(resp => ({ resp })),
    earlyAlertPromise.then(val => val ?? new Promise(() => {})),
  ]);

  if ("earlyAlert" in race) {
    const settledResp = await Promise.race([
      draftRespPromise.catch(() => null),
      new Promise(r => setTimeout(() => r(null), 500)),
    ]);
    if (!settledResp) {
      throw new Error(`Upload failed before /api/photos/draft responded: ${race.earlyAlert}`);
    }
    const body = await settledResp.json().catch(() => ({}));
    assert.equal(
      settledResp.status(),
      expectStatus,
      `Expected /api/photos/draft status ${expectStatus}, got ${settledResp.status()} (${JSON.stringify(body)})`
    );
    return { id: null, status: settledResp.status(), errorText: race.earlyAlert };
  }

  const draftResp = race.resp;
  const body = await draftResp.json().catch(() => ({}));
  assert.equal(
    draftResp.status(),
    expectStatus,
    `Expected /api/photos/draft status ${expectStatus}, got ${draftResp.status()} (${JSON.stringify(body)})`
  );

  if (expectStatus >= 400) {
    await formAlert.waitFor({ state: "visible", timeout: 10_000 });
    return { id: null, status: draftResp.status(), errorText: (await formAlert.innerText()).trim() };
  }

  await page.waitForURL(/\/dashboard$/, { timeout: 30_000 });
  const id = body?.data?.id;
  assert.ok(typeof id === "string" && id.length > 0, `Missing created photo id in ${JSON.stringify(body)}`);
  return { id, status: draftResp.status() };
}

async function fetchPublicPhotoDetails(page, baseUrl, photoId, tempDir, prefix) {
  const res = await page.goto(`${baseUrl}/photo/${photoId}`, { waitUntil: "domcontentloaded" });
  assert.equal(res?.status(), 200, `Public photo page /photo/${photoId} returned ${res?.status()}`);

  const licenseText = await page.getByTestId("photo-license").innerText();
  const jsonLdRaw = await page.locator('script[type="application/ld+json"]').innerText();
  const jsonLd = JSON.parse(jsonLdRaw);
  assert.ok(jsonLd.contentUrl, `Missing contentUrl in JSON-LD for ${photoId}`);

  // Download public preview thumbnail bytes
  const thumbResp = await page.request.get(jsonLd.contentUrl);
  assert.equal(thumbResp.status(), 200, `Preview thumbnail fetch failed: ${thumbResp.status()}`);
  const previewPath = path.join(tempDir, `${prefix}-preview.jpg`);
  fs.writeFileSync(previewPath, await thumbResp.body());

  const downloadLink = page.locator(`a[href="/api/photos/download/${photoId}"]`);
  const hasDownloadLink = (await downloadLink.count()) > 0;
  let downloadPath = null;
  if (hasDownloadLink) {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 45_000 }),
      downloadLink.first().click(),
    ]);
    downloadPath = path.join(tempDir, `${prefix}-download.jpg`);
    await download.saveAs(downloadPath);
  }

  return { licenseText, jsonLd, previewPath, downloadPath, hasDownloadLink };
}

async function extractViaUi(page, baseUrl, filePath) {
  await page.goto(`${baseUrl}/dashboard/extract`, { waitUntil: "networkidle" });
  await page.locator("#extraction-file").setInputFiles(filePath);

  const fileError = (await page.locator("#extraction-file-error").innerText().catch(() => "")).trim();
  if (fileError) {
    throw new Error(`File rejected by extraction form: ${fileError}`);
  }

  const extractBtn = page.getByRole("button", { name: "Ekstrak payload", exact: true });
  await extractBtn.waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('button:has-text("Ekstrak payload"):not([disabled])').waitFor({ timeout: 15_000 });

  const extractRespPromise = safeWaitForResponse(
    page,
    res => res.url().endsWith("/api/photos/extract") && res.request().method() === "POST",
    90_000
  );
  const earlyAlertPromise = page
    .locator("section.watermark-result [role='alert']")
    .waitFor({ state: "visible", timeout: 90_000 })
    .then(async () => ({ earlyAlert: (await page.locator("section.watermark-result [role='alert']").innerText()).trim() }))
    .catch(() => null);

  await extractBtn.click();
  const race = await Promise.race([
    extractRespPromise.then(resp => ({ resp })),
    earlyAlertPromise.then(val => val ?? new Promise(() => {})),
  ]);

  if ("earlyAlert" in race) {
    // Give /api/photos/extract a brief moment in case it already responded with 422 before the alert rendered
    const settledResp = await Promise.race([
      extractRespPromise.catch(() => null),
      new Promise(r => setTimeout(() => r(null), 500)),
    ]);
    if (settledResp) {
      const body = await settledResp.json().catch(() => ({}));
      return { status: settledResp.status(), body, uiText: race.earlyAlert };
    }
    throw new Error(`Extraction failed before /api/photos/extract responded: ${race.earlyAlert}`);
  }

  const resp = race.resp;
  const body = await resp.json().catch(() => ({}));

  if (resp.status() === 200) {
    const certBox = page.getByTestId("verified-certificate");
    await certBox.waitFor({ state: "visible", timeout: 15_000 });
    const resultSectionText = await page.locator("section.watermark-result").innerText();
    return { status: 200, body, uiText: resultSectionText };
  }

  const alertLoc = page.locator("section.watermark-result [role='alert']");
  await alertLoc.waitFor({ state: "visible", timeout: 15_000 });
  const alertText = await alertLoc.innerText();
  return { status: resp.status(), body, uiText: alertText };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n\n${USAGE}\n`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const username = process.env.LIVE_USERNAME;
  const password = process.env.LIVE_PASSWORD;
  if (!username || !password) {
    process.stderr.write(`LIVE_USERNAME dan LIVE_PASSWORD wajib diisi di environment.\n\n${USAGE}\n`);
    process.exitCode = 2;
    return;
  }

  const baseUrl = args.baseUrl;
  const channel = process.env.PLAYWRIGHT_CHANNEL || "msedge";
  const runId = crypto.randomBytes(3).toString("hex");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `padustock-live-${runId}-`));
  const createdPhotoIds = [];
  const report = [];

  const shouldRun = num => !args.onlySet || args.onlySet.has(String(num));

  async function runScenario(num, name, fn) {
    if (num !== 1 && !shouldRun(num)) return;
    const started = Date.now();
    try {
      const detail = await fn();
      const ms = Date.now() - started;
      report.push({ name: `${num}. ${name}`, status: "PASS", ms, detail: detail || "" });
      console.log(`✔ [PASS] ${num}. ${name} (${(ms / 1000).toFixed(1)}s)${detail ? ` — ${detail}` : ""}`);
    } catch (error) {
      const ms = Date.now() - started;
      const msg = error instanceof Error ? error.message : String(error);
      report.push({ name: `${num}. ${name}`, status: "FAIL", ms, detail: msg });
      console.error(`✖ [FAIL] ${num}. ${name} (${(ms / 1000).toFixed(1)}s) — ${msg}`);
    }
  }

  console.log(`\nPadustock Live E2E Verification`);
  console.log(`Target : ${baseUrl}`);
  console.log(`Browser: Playwright (${channel}, ${args.headed ? "headed" : "headless"})`);
  console.log(`Run ID : ${runId}\n`);

  const fixtures = await generateFixtures(tempDir);
  const browser = await chromium.launch({ headless: !args.headed, channel });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    let directPhotoId = null;
    let directDownloadPath = null;

    await runScenario(1, "Auth & route guards (/verify -> /login, /about/hidden-watermark, login, /verify -> /dashboard/extract)", async () => {
      const aboutRes = await page.goto(`${baseUrl}/about/hidden-watermark`, { waitUntil: "domcontentloaded" });
      assert.equal(aboutRes?.status(), 200);

      await page.goto(`${baseUrl}/verify`, { waitUntil: "domcontentloaded" });
      await page.waitForURL(/\/login/, { timeout: 15_000 });

      await page.locator("#identifier").fill(username);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: "MASUK SEKARANG", exact: true }).click();
      await page.waitForURL(/\/dashboard$/, { timeout: 30_000 });

      await page.goto(`${baseUrl}/verify`, { waitUntil: "domcontentloaded" });
      await page.waitForURL(/\/dashboard\/extract$/, { timeout: 15_000 });
      return "guards & login verified";
    });

    await runScenario(2, "Direct free publish 16:9 (preview 1080x608 + full-res 1600x900 + Q80 recompression extraction)", async () => {
      const payload = `LIVE-DIRECT-${runId}`;
      const created = await uploadViaUi(page, baseUrl, {
        filePath: fixtures.wide16x9,
        caption: `Uji Live 16:9 ${runId}`,
        publishDirectly: true,
        watermarkEnabled: true,
        customPayload: payload,
      });
      createdPhotoIds.push(created.id);
      directPhotoId = created.id;

      const details = await fetchPublicPhotoDetails(page, baseUrl, created.id, tempDir, "direct");
      assert.match(details.licenseText, /CC BY-NC-ND 4\.0/);
      assert.equal(details.hasDownloadLink, true);
      directDownloadPath = details.downloadPath;

      const dlMeta = await sharp(details.downloadPath).metadata();
      const pvMeta = await sharp(details.previewPath).metadata();
      assert.deepEqual([dlMeta.width, dlMeta.height], [1600, 900], "Full-res download dimensions mismatch");
      assert.equal(pvMeta.width, 1080, "Preview long side should be 1080px");

      // Extract from full-resolution free download copy
      const dlExtract = await extractViaUi(page, baseUrl, details.downloadPath);
      assert.equal(dlExtract.status, 200);
      assert.equal(dlExtract.body.data.authenticated, true);
      assert.equal(dlExtract.body.data.hashMatch, true);
      assert.equal(dlExtract.body.data.certificate.photo_id, created.id);
      assert.equal(dlExtract.body.data.certificate.license_terms, "CC BY-NC-ND 4.0");
      assert.equal(dlExtract.body.data.certificate.reference_payload, payload);

      // Extract from public visible-watermarked preview thumbnail
      const pvExtract = await extractViaUi(page, baseUrl, details.previewPath);
      assert.equal(pvExtract.status, 200);
      assert.equal(pvExtract.body.data.authenticated, true);
      assert.equal(pvExtract.body.data.certificate.photo_id, created.id);
      assert.equal(pvExtract.body.data.certificate.reference_payload, payload);

      // Re-save full-res download copy at JPEG Q80 and verify survival
      const recompressedPath = path.join(tempDir, "direct-recompressed-q80.jpg");
      await sharp(details.downloadPath).jpeg({ quality: 80 }).toFile(recompressedPath);
      const q80Extract = await extractViaUi(page, baseUrl, recompressedPath);
      assert.equal(q80Extract.status, 200);
      assert.equal(q80Extract.body.data.authenticated, true);
      assert.equal(q80Extract.body.data.certificate.photo_id, created.id);
      assert.equal(q80Extract.body.data.certificate.reference_payload, payload);

      return `photo=${created.id.slice(0, 8)}, download=${dlMeta.width}x${dlMeta.height}, preview=${pvMeta.width}x${pvMeta.height}, Q80 survived`;
    });

    await runScenario(3, "Draft -> Edit -> Publish free (reuses exact encrypted payload bytes from preview)", async () => {
      const payload = `LIVE-DRAFT-${runId}`;
      const created = await uploadViaUi(page, baseUrl, {
        filePath: fixtures.standard3x2,
        caption: `Uji Live Draf ${runId}`,
        publishDirectly: false,
        watermarkEnabled: true,
        customPayload: payload,
      });
      createdPhotoIds.push(created.id);

      await page.goto(`${baseUrl}/dashboard/edit/${created.id}`, { waitUntil: "networkidle" });
      const patchPromise = safeWaitForResponse(
        page,
        res => res.url().endsWith(`/api/photos/${created.id}`) && res.request().method() === "PATCH",
        90_000
      );
      await page.getByRole("button", { name: "Publikasikan", exact: true }).click();
      const patchResp = await patchPromise;
      assert.equal(patchResp.status(), 200, `PATCH draft->free returned ${patchResp.status()}`);

      const details = await fetchPublicPhotoDetails(page, baseUrl, created.id, tempDir, "draft-free");
      assert.equal(details.hasDownloadLink, true);
      const dlExtract = await extractViaUi(page, baseUrl, details.downloadPath);
      assert.equal(dlExtract.status, 200);
      assert.equal(dlExtract.body.data.authenticated, true);
      assert.equal(dlExtract.body.data.certificate.photo_id, created.id);
      assert.equal(dlExtract.body.data.certificate.reference_payload, payload);

      return `reused payload ${payload} in download copy`;
    });

    await runScenario(4, "Direct free opt-out (no hidden watermark in preview or download copy)", async () => {
      const created = await uploadViaUi(page, baseUrl, {
        filePath: fixtures.standard3x2,
        caption: `Uji Live OptOut ${runId}`,
        publishDirectly: true,
        watermarkEnabled: false,
      });
      createdPhotoIds.push(created.id);

      const details = await fetchPublicPhotoDetails(page, baseUrl, created.id, tempDir, "optout");
      assert.equal(details.hasDownloadLink, true);

      for (const [label, file] of [["preview", details.previewPath], ["download", details.downloadPath]]) {
        const res = await extractViaUi(page, baseUrl, file);
        assert.equal(res.status, 422, `${label} should fail with 422 NO_WATERMARK`);
        assert.equal(res.body.code, "NO_WATERMARK", `${label} code mismatch`);
      }
      return "NO_WATERMARK verified on both preview and download copy";
    });

    await runScenario(5, "Draft opt-out preservation through Edit -> Publish", async () => {
      const created = await uploadViaUi(page, baseUrl, {
        filePath: fixtures.standard3x2,
        caption: `Uji Live Draf OptOut ${runId}`,
        publishDirectly: false,
        watermarkEnabled: false,
      });
      createdPhotoIds.push(created.id);

      await page.goto(`${baseUrl}/dashboard/edit/${created.id}`, { waitUntil: "networkidle" });
      const pageText = await page.locator("main").innerText();
      assert.match(pageText, /Watermark tak terlihat:\s*Nonaktif/i);

      const patchPromise = safeWaitForResponse(
        page,
        res => res.url().endsWith(`/api/photos/${created.id}`) && res.request().method() === "PATCH",
        90_000
      );
      await page.getByRole("button", { name: "Publikasikan", exact: true }).click();
      assert.equal((await patchPromise).status(), 200);

      const details = await fetchPublicPhotoDetails(page, baseUrl, created.id, tempDir, "draft-optout");
      assert.equal(details.hasDownloadLink, true);
      const res = await extractViaUi(page, baseUrl, details.downloadPath);
      assert.equal(res.status, 422);
      assert.equal(res.body.code, "NO_WATERMARK");
      return "opt-out preserved across draft -> free publish";
    });

    await runScenario(6, "External paid listing (preview-only watermark, no free download, non-CC certificate)", async () => {
      const created = await uploadViaUi(page, baseUrl, {
        filePath: fixtures.standard3x2,
        caption: `Uji Live Paid ${runId}`,
        publishDirectly: false,
        watermarkEnabled: true,
      });
      createdPhotoIds.push(created.id);

      await page.goto(`${baseUrl}/dashboard/edit/${created.id}`, { waitUntil: "networkidle" });
      await page.locator("#microstock_url").fill("https://example.com/padustock-live-test");
      const patchPromise = safeWaitForResponse(
        page,
        res => res.url().endsWith(`/api/photos/${created.id}`) && res.request().method() === "PATCH",
        90_000
      );
      await page.getByRole("button", { name: "Publikasikan", exact: true }).click();
      assert.equal((await patchPromise).status(), 200);

      const details = await fetchPublicPhotoDetails(page, baseUrl, created.id, tempDir, "paid");
      assert.equal(details.hasDownloadLink, false, "External paid listing must not expose free download link");

      const dlAttempt = await page.request.get(`${baseUrl}/api/photos/download/${created.id}`, { maxRedirects: 0 });
      assert.ok([403, 404].includes(dlAttempt.status()), `Expected 403/404 on paid download route, got ${dlAttempt.status()}`);

      const pvExtract = await extractViaUi(page, baseUrl, details.previewPath);
      assert.equal(pvExtract.status, 200);
      assert.equal(pvExtract.body.data.authenticated, true);
      assert.ok(
        !pvExtract.body.data.certificate.license_terms.includes("CC BY"),
        `External listing preview must not claim CC license, got: ${pvExtract.body.data.certificate.license_terms}`
      );
      return `download blocked (${dlAttempt.status()}), preview license="${pvExtract.body.data.certificate.license_terms}"`;
    });

    await runScenario(7, "Capacity / tiny-image rejection (100x100 rejected with 422, no photo created)", async () => {
      const rejected = await uploadViaUi(page, baseUrl, {
        filePath: fixtures.tiny100,
        caption: `Uji Live Tiny ${runId}`,
        publishDirectly: true,
        watermarkEnabled: true,
        expectStatus: 422,
      });
      assert.equal(rejected.status, 422);
      assert.ok(rejected.errorText.length > 0);
      return `rejected 422: "${rejected.errorText}"`;
    });

    await runScenario(8, "Negative extraction checks (unmarked JPEG -> NO_WATERMARK, corrupt file -> INVALID_IMAGE)", async () => {
      const unmarked = await extractViaUi(page, baseUrl, fixtures.plainUnmarked);
      assert.equal(unmarked.status, 422);
      assert.equal(unmarked.body.code, "NO_WATERMARK");

      const corrupt = await extractViaUi(page, baseUrl, fixtures.corrupt);
      assert.equal(corrupt.status, 422);
      assert.equal(corrupt.body.code, "INVALID_IMAGE");
      return "NO_WATERMARK and INVALID_IMAGE verified";
    });

    if (shouldRun(9) && process.env.HEIC_TEST_FILE && fs.existsSync(process.env.HEIC_TEST_FILE)) {
      await runScenario(9, "Real HEIC upload -> free download -> extraction", async () => {
        const created = await uploadViaUi(page, baseUrl, {
          filePath: process.env.HEIC_TEST_FILE,
          caption: `Uji Live HEIC ${runId}`,
          publishDirectly: true,
          watermarkEnabled: true,
        });
        createdPhotoIds.push(created.id);
        const details = await fetchPublicPhotoDetails(page, baseUrl, created.id, tempDir, "heic");
        assert.equal(details.hasDownloadLink, true);
        const dlExtract = await extractViaUi(page, baseUrl, details.downloadPath);
        assert.equal(dlExtract.status, 200);
        assert.equal(dlExtract.body.data.authenticated, true);
        return `HEIC decoded, watermarked, and decrypted (${created.id.slice(0, 8)})`;
      });
    } else if (shouldRun(9)) {
      report.push({ name: "9. Real HEIC upload (optional)", status: "SKIP", ms: 0, detail: "HEIC_TEST_FILE not set" });
      console.log("﹣ [SKIP] 9. Real HEIC upload (optional) — HEIC_TEST_FILE not set");
    }

    // Exercise UI Delete on the first photo (if created)
    if (directPhotoId && directDownloadPath) {
      await runScenario(10, "UI deletion flow (Hapus Foto on /dashboard/edit/[id])", async () => {
        await page.goto(`${baseUrl}/dashboard/edit/${directPhotoId}`, { waitUntil: "networkidle" });
        page.once("dialog", dialog => dialog.accept());
        const deletePromise = safeWaitForResponse(
          page,
          res => res.url().endsWith(`/api/photos/${directPhotoId}`) && res.request().method() === "DELETE",
          45_000
        );
        await page.getByRole("button", { name: "Hapus Foto", exact: true }).click();
        const delResp = await deletePromise;
        assert.equal(delResp.status(), 200, `UI DELETE returned ${delResp.status()}`);
        await page.waitForURL(/\/dashboard$/, { timeout: 20_000 });
        const check404 = await page.request.get(`${baseUrl}/photo/${directPhotoId}`);
        assert.equal(check404.status(), 404);
        const idx = createdPhotoIds.indexOf(directPhotoId);
        if (idx >= 0) createdPhotoIds.splice(idx, 1);
        return `deleted ${directPhotoId.slice(0, 8)} via UI and verified 404`;
      });
    }
  } finally {
    // Guaranteed cleanup of every remaining temporary test photo
    let cleaned = 0;
    const leftover = [];
    for (const id of createdPhotoIds) {
      try {
        const res = await context.request.delete(`${baseUrl}/api/photos/${id}`);
        if (res.status() === 200 || res.status() === 404) {
          cleaned++;
        } else {
          leftover.push(`${id} (HTTP ${res.status()})`);
        }
      } catch (err) {
        leftover.push(`${id} (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    await browser.close().catch(() => undefined);
    fs.rmSync(tempDir, { recursive: true, force: true });

    const passed = report.filter(r => r.status === "PASS").length;
    const failed = report.filter(r => r.status === "FAIL").length;
    const skipped = report.filter(r => r.status === "SKIP").length;
    console.log("\n==========================================");
    console.log(`SUMMARY: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    console.log(`CLEANUP: ${cleaned}/${createdPhotoIds.length} remaining test photo(s) deleted`);
    if (leftover.length > 0) {
      console.error(`WARNING: leftover test photos: ${leftover.join(", ")}`);
    }
    console.log("==========================================\n");
    if (failed > 0 || leftover.length > 0) {
      process.exitCode = 1;
    }
  }
}

await main();
