import { test, expect } from "@playwright/test";
import { DEMO_ATTRIBUTION, DEMO_EXTRACTION } from "../../src/lib/demo-extraction";
import { demoDownloadFilename } from "../../src/lib/demo-download";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ioAAAAASUVORK5CYII=", "base64");

test("authenticated demo page shows all filename scenarios and keeps files local", async ({ page }, info) => {
  await page.goto("/dashboard/extract");
  await expect(page).toHaveURL(/\/login$/);
  const login = await page.request.post("/api/auth/login", { data: { identifier: "fixture@example.test", password: "fixture-password" } });
  expect(login.ok()).toBeTruthy();
  await page.goto("/dashboard/extract");
  await expect(page.getByRole("note")).toContainText("Mode simulasi");
  const posts: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/api/photos/")) posts.push(request.url()); });
  const file = page.getByLabel(/Pilih gambar/);
  await expect(file).toBeEnabled();
  const output = page.getByLabel("Teks payload hasil ekstraksi");
  const results = page.locator('[aria-labelledby="extraction-result-title"]');
  const photoId = "22222222-2222-4222-8222-222222222222";
  const photographerId = "11111111-1111-4111-8111-111111111111";
  const downloaded = demoDownloadFilename("padustock-demo", "jpg", photoId, photographerId);
  const cases = [
    { name: "pemandangan.png", payload: DEMO_EXTRACTION.defaultPayload },
    { name: DEMO_EXTRACTION.noWatermarkFilename.toUpperCase(), payload: null },
    { name: DEMO_EXTRACTION.alternateFilename, payload: DEMO_EXTRACTION.alternatePayload },
    { name: downloaded, payload: JSON.stringify({
      ...DEMO_ATTRIBUTION, photo_id: photoId, photographer_id: photographerId,
      photo_url: `https://padustock.vercel.app/photo/${photoId}`,
    }, null, 2) },
    { name: "no-watermark-padustock (1).png", payload: null },
  ];
  for (const scenario of cases) {
    await file.setInputFiles({ name: scenario.name, mimeType: "image/png", buffer: png });
    await expect(output).toHaveCount(0);
    await page.getByRole("button", { name: "Ekstrak payload", exact: true }).click();
    if (scenario.payload === null) {
      await expect(results).toContainText("Watermark tidak terdeteksi");
      await expect(results.getByRole("button", { name: "Salin payload" })).toHaveCount(0);
    } else {
      await expect(output).toHaveText(scenario.payload);
      await expect(results).toContainText(Buffer.byteLength(scenario.payload) + " byte UTF-8");
    }
    await page.screenshot({ path: info.outputPath(scenario.name + ".png"), fullPage: true });
  }
  await file.setInputFiles({ name: "kamera.heic", mimeType: "", buffer: Buffer.from("local HEIC placeholder") });
  await expect(page.getByText(/Pratinjau tidak tersedia/)).toBeVisible();
  await page.getByRole("button", { name: "Ekstrak payload", exact: true }).click();
  await expect(output).toHaveText(DEMO_EXTRACTION.defaultPayload);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(output).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ekstrak payload", exact: true })).toBeDisabled();
  expect(posts).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
