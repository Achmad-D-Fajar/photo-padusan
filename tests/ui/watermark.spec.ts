import { test, expect, type Page } from "@playwright/test";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ioAAAAASUVORK5CYII=", "base64");
const image = { name: "padusan.png", mimeType: "image/png", buffer: png };
const payload = "  Padusan 🌿\n<script>teks biasa</script>  ";

async function login(page: Page) {
  const result = await page.request.post("/api/auth/login", { data: { identifier: "fixture@example.test", password: "fixture-password" } });
  expect(result.ok()).toBeTruthy();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
}
async function trackUrls(page: Page) {
  await page.addInitScript(() => {
    const state = { created: [] as string[], revoked: [] as string[] };
    Object.assign(window, { fixtureUrls: state });
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); state.created.push(url); return url; };
    URL.revokeObjectURL = url => { state.revoked.push(url); revoke(url); };
  });
}

test("extraction is authenticated, unavailable in production, and uses local previews", async ({ page }, info) => {
  await page.goto("/dashboard/extract");
  await expect(page).toHaveURL(/\/login$/);
  await login(page);
  await trackUrls(page);
  await page.goto("/dashboard/extract");
  await expect(page.getByRole("heading", { name: "Ekstraksi watermark" })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) < 1024) await page.getByRole("button", { name: "Buka menu navigasi" }).click();
  await expect(page.getByRole("link", { name: "Ekstraksi", exact: true })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) < 1024) await page.getByRole("button", { name: "Buka menu navigasi" }).evaluate(button => button.blur());
  await expect(page.getByRole("button", { name: "Ekstrak payload" })).toBeDisabled();
  await expect(page.getByText("Fitur ekstraksi belum terhubung", { exact: true })).toBeVisible();
  const sent: string[] = [];
  page.on("request", request => { if (request.method() !== "GET") sent.push(request.url()); });
  await page.getByLabel(/Pilih gambar/).setInputFiles(image);
  const preview = page.getByRole("img", { name: "Pratinjau penuh padusan.png" });
  await expect(preview).toBeVisible();
  expect(await preview.evaluate(node => getComputedStyle(node).objectFit)).toBe("contain");
  await expect(page.getByText("padusan.png", { exact: true })).toBeVisible();
  await page.getByLabel(/Pilih gambar/).setInputFiles({ name: "kamera.heic", mimeType: "", buffer: Buffer.from("local undecodable HEIC fixture") });
  await expect(page.getByText(/Pratinjau tidak tersedia di browser ini/)).toBeVisible();
  await expect(page.getByText("kamera.heic", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ekstrak payload" })).toBeDisabled();
  expect(sent).toEqual([]);
  const originalViewport = page.viewportSize()!;
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`extract-${width}.png`), fullPage: true });
  }
  await page.setViewportSize(originalViewport);
  await page.screenshot({ path: info.outputPath("extract-unavailable.png"), fullPage: true });
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByText(/Belum ada gambar/)).toBeVisible();
  const urls = await page.evaluate(() => (window as unknown as { fixtureUrls: { created: string[]; revoked: string[] } }).fixtureUrls);
  expect(urls.created.length).toBe(2);
  expect(urls.revoked).toEqual(urls.created);
  await page.getByLabel(/Pilih gambar/).setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("test") });
  await expect(page.locator("#extraction-file-error")).toContainText("Format gambar tidak didukung");
});

test("extraction fixture exercises success, errors, stale work, and clipboard failure", async ({ page }, info) => {
  await trackUrls(page);
  await page.goto("http://127.0.0.1:3101");
  await expect(page.getByText(/Belum ada hasil/)).toBeVisible();
  await page.getByLabel(/Pilih gambar/).setInputFiles(image);
  await page.getByRole("button", { name: "Ekstrak payload" }).click();
  const output = page.getByLabel("Teks payload hasil ekstraksi");
  await expect(output).toHaveText(payload);
  await expect(page.getByText(`${Buffer.byteLength(payload)} byte UTF-8`, { exact: false })).toBeVisible();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { Object.assign(window, { copiedPayload: text }); } } }));
  await page.getByRole("button", { name: "Salin payload" }).click();
  await expect(page.getByText("Payload disalin.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { copiedPayload: string }).copiedPayload)).toBe(payload);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
  await page.getByRole("button", { name: "Salin payload" }).click();
  await expect(page.getByText(/Tidak dapat menyalin/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("extract-success.png"), fullPage: true });

  await page.getByLabel("Mode fixture").selectOption("error");
  await page.getByRole("button", { name: "Ekstrak payload" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Ekstraksi gagal" })).toBeVisible();
  await page.getByLabel("Mode fixture").selectOption("invalid");
  await page.getByRole("button", { name: "Ekstrak payload" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Ekstraksi gagal" })).toBeVisible();
  await page.getByLabel("Mode fixture").selectOption("delayed");
  await page.getByRole("button", { name: "Ekstrak payload" }).click();
  await expect(page.getByText(/Memproses gambar/)).toBeVisible();
  await page.getByLabel(/Pilih gambar/).setInputFiles({ ...image, name: "replacement.png" });
  await page.getByRole("button", { name: "Selesaikan permintaan tertunda" }).click();
  await expect(output).toHaveCount(0);
  await expect(page.getByText(/Belum ada hasil/)).toBeVisible();
  await page.getByRole("button", { name: "Ekstrak payload" }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByRole("button", { name: "Selesaikan permintaan tertunda" }).click();
  await expect(output).toHaveCount(0);
  await expect(page.getByText(/Belum ada gambar/)).toBeVisible();
  await page.getByLabel(/Pilih gambar/).setInputFiles(image);
  await page.getByRole("button", { name: "Ekstrak payload" }).click();
  await page.getByRole("button", { name: "Lepas formulir" }).click();
  await page.getByRole("button", { name: "Selesaikan permintaan tertunda" }).click();
  const urls = await page.evaluate(() => (window as unknown as { fixtureUrls: { created: string[]; revoked: string[] } }).fixtureUrls);
  expect(urls.revoked).toEqual(urls.created);
  await noOverflow(page);
});

test("upload payload persists across workflows and retries without entering API bodies", async ({ page }, info) => {
  await login(page);
  const bodies: Record<string, unknown>[] = [];
  let attempts = 0;
  await page.route("**/api/photos/**", async route => {
    const request = route.request();
    const body = request.postDataJSON();
    if (body) bodies.push(body);
    if (request.url().endsWith("/upload")) return route.fulfill({ json: request.method() === "DELETE" ? { success: true } : { success: true, data: { path: "11111111-1111-4111-8111-111111111111/test.png", token: "fixture", contentType: "image/png" } } });
    if (request.url().endsWith("/preview")) return route.fulfill({ contentType: "image/jpeg", body: png });
    if (request.url().endsWith("/translate")) return route.fulfill({ json: { success: true, data: { caption_en: "Field", tags_en: ["field"] } } });
    if (request.url().endsWith("/analyze")) return route.fulfill({ json: { success: true, data: { caption_id: "Sawah", caption_en: "Field", tags_id: ["sawah"], tags_en: ["field"] } } });
    if (request.url().endsWith("/draft")) {
      attempts++;
      return route.fulfill({ status: attempts < 3 ? 500 : 200, json: attempts < 3 ? { error: "Fixture simpan gagal" } : { success: true, data: { id: "fixture-saved" } } });
    }
    throw new Error(`Unexpected fixture call: ${request.url()}`);
  });
  await page.route("**/storage/v1/object/upload/sign/**", route => route.fulfill({ json: { Key: "fixture", Id: "fixture" } }));
  await page.goto("/dashboard/upload");
  const section = page.getByRole("region", { name: "Pengaturan watermark tersembunyi" });
  await expect(section.locator("details")).not.toHaveAttribute("open");
  await expect(section).toContainText("PADUSTOCK-IWM-DEMO-v1");
  await expect(section.getByRole("link", { name: "hidden watermark", exact: true })).toHaveAttribute("href", "/about/hidden-watermark");
  expect(await section.evaluate(node => node.nextElementSibling?.tagName)).toBe("BUTTON");
  await section.getByText("Edit watermark (opsional)", { exact: true }).click();
  const field = section.getByLabel("Teks payload");
  await expect(section).toContainText("PADUSTOCK-IWM-DEMO-v1");
  await field.fill("🌿".repeat(129));
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveValue("🌿".repeat(129));
  await field.fill(payload);
  await page.getByLabel(/Pilih gambar/).setInputFiles(image);
  await expect(page.getByRole("img", { name: "Pratinjau", exact: true })).toBeVisible();
  await page.getByLabel("Caption Manual", { exact: true }).fill("Sawah");
  await page.getByRole("button", { name: "Simpan sebagai Draf", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Fixture simpan gagal" })).toBeVisible();
  await expect(field).toHaveValue(payload);
  await section.getByRole("button", { name: "Nonaktifkan watermark", exact: true }).click();
  await expect(field).toBeDisabled();
  await expect(section.getByRole("link", { name: "Saya memahami risikonya" })).toHaveAttribute("href", "/about/hidden-watermark#risiko");
  await page.getByRole("checkbox", { name: "Gunakan Bantuan AI" }).check();
  await expect(field).toHaveValue(payload);
  await page.getByRole("button", { name: "JALANKAN ANALISIS AI" }).click();
  const modal = page.getByRole("dialog", { name: "Tinjau & Edit AI" });
  await expect(modal).toBeVisible();
  await modal.getByText("Edit watermark (opsional)", { exact: true }).click();
  const reviewField = modal.getByLabel("Teks payload");
  await expect(reviewField).toHaveValue(payload);
  await expect(reviewField).toBeDisabled();
  await modal.getByRole("button", { name: "Aktifkan kembali", exact: true }).click();
  await reviewField.fill("é".repeat(257));
  await expect(modal.getByRole("button", { name: "Simpan sebagai Draf", exact: true })).toBeDisabled();
  await modal.getByRole("button", { name: "Nonaktifkan watermark", exact: true }).click();
  await expect(modal.getByRole("button", { name: "Simpan sebagai Draf", exact: true })).toBeEnabled();
  await modal.getByRole("button", { name: "Aktifkan kembali", exact: true }).click();
  await expect(reviewField).toHaveValue("é".repeat(257));
  await expect(modal.getByRole("button", { name: "Simpan sebagai Draf", exact: true })).toBeDisabled();
  await reviewField.fill(`${payload}\nAI review`);
  await modal.getByRole("button", { name: "Simpan sebagai Draf", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("Fixture simpan gagal");
  await expect(reviewField).toHaveValue(`${payload}\nAI review`);
  await page.screenshot({ path: info.outputPath("upload-ai-review.png") });
  await modal.getByRole("button", { name: "UBAH GAMBAR" }).click();
  await page.getByRole("checkbox", { name: "Gunakan Bantuan AI" }).uncheck();
  await expect(field).toHaveValue(`${payload}\nAI review`);
  await noOverflow(page);
  await page.getByRole("button", { name: "Simpan sebagai Draf", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: "Ekstraksi watermark", exact: true })).toBeVisible();
  expect(attempts).toBe(3);
  for (const body of bodies) {
    expect(JSON.stringify(body)).not.toContain("Padusan 🌿");
    expect(Object.keys(body).some(key => /payload|watermark/i.test(key))).toBeFalsy();
  }
});

test("hidden watermark explanation is public and links to the opt-out risk section", async ({ page }, info) => {
  await page.goto("/about/hidden-watermark");
  await expect(page.getByRole("heading", { level: 1, name: "Tentang watermark tersembunyi" })).toBeVisible();
  await expect(page.getByLabel("Ringkasan dan status fitur")).toContainText("belum terhubung");
  await expect(page.locator(".watermark-article section")).toHaveCount(8);
  await expect(page.locator("#informasi")).toContainText("bukan identitas unik foto");
  await expect(page.locator("#informasi")).toContainText("Jangan masukkan password");
  await page.getByRole("link", { name: "Baca akibat menonaktifkan" }).click();
  await expect(page).toHaveURL(/\/about\/hidden-watermark#risiko$/);
  await expect(page.locator("#risiko")).toContainText("tidak menghilangkan hak fotografer");
  await expect(page.locator("#risiko")).toContainText("salinan yang sudah beredar");
  await expect(page.locator("#batasan")).toContainText("bukan bukti kepemilikan yang menentukan");
  for (const href of ["/dashboard/upload", "/dashboard/extract", "/privacy", "/terms#riwayat-cc"]) {
    await expect(page.locator(`main a[href="${href}"]`).first()).toHaveAttribute("href", href);
  }
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("hidden-watermark-about.png"), fullPage: true });
});
