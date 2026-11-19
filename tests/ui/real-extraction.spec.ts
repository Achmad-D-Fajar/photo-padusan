import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Fixtures regenerated with the real engine: node tests/ui/make-watermark-fixture.cjs
const watermarked = readFileSync(join(__dirname, "fixtures", "watermarked.png"));
const plain = readFileSync(join(__dirname, "fixtures", "plain.png"));
const passphrase = "fixture-passphrase-2026";

test("authenticated extract page decrypts real watermarks and rejects wrong keys", async ({ page }, info) => {
  await page.goto("/dashboard/extract");
  await expect(page).toHaveURL(/\/login$/);
  const login = await page.request.post("/api/auth/login", { data: { identifier: "fixture@example.test", password: "fixture-password" } });
  expect(login.ok()).toBeTruthy();
  await page.goto("/dashboard/extract");
  await expect(page.getByText("Unggah gambar dan masukkan passphrase pemilik foto.")).toBeVisible();

  const file = page.getByLabel(/Pilih gambar/);
  const pass = page.getByLabel("Passphrase pemilik foto");
  const extractButton = page.getByRole("button", { name: "Ekstrak payload", exact: true });
  const output = page.getByLabel("Teks payload hasil ekstraksi");
  const results = page.locator('[aria-labelledby="extraction-result-title"]');

  // Tanpa passphrase tombol tetap terkunci meski file sudah dipilih.
  await file.setInputFiles({ name: "watermarked.png", mimeType: "image/png", buffer: watermarked });
  await expect(extractButton).toBeDisabled();
  await pass.fill(passphrase);
  await expect(extractButton).toBeEnabled();
  await extractButton.click();
  await expect(output).toContainText("33333333-3333-4333-8333-333333333333");
  await expect(output).toContainText("Padusan fixture 🌿");
  await expect(results).toContainText("Hash gambar cocok");
  await page.screenshot({ path: info.outputPath("real-extract-success.png"), fullPage: true });

  // Kunci salah: tag GCM menolak, pesan server tampil apa adanya.
  await pass.fill("wrong-passphrase-999");
  await extractButton.click();
  await expect(results.getByRole("alert")).toContainText("Authentication Error (Invalid Tag)");
  await expect(output).toHaveCount(0);

  // Gambar tanpa watermark: bukan error kripto, melainkan tidak terdeteksi.
  await pass.fill(passphrase);
  await file.setInputFiles({ name: "plain.png", mimeType: "image/png", buffer: plain });
  await extractButton.click();
  await expect(results).toContainText("Watermark tidak terdeteksi");
  await expect(output).toHaveCount(0);

  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByText(/Belum ada gambar/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});