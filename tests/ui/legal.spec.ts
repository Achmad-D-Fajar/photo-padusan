import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { LEGAL_DOCUMENTS } from "../../src/lib/legal-documents";

const photo = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;
async function review(page: Page, info: TestInfo, name: string) {
  await expect(page.locator("body")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}

test("registration has one unchecked required acknowledgment and linked documents", async ({ page }, info) => {
  await page.goto("/register");
  const checkbox = page.getByRole("checkbox");
  await expect(checkbox).toHaveCount(1);
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toHaveAttribute("required", "");
  await expect(checkbox).toHaveAccessibleName(/Saya menyetujui Syarat.*telah membaca Kebijakan Privasi/);
  await expect(page.locator('label a[href="/terms"]')).toBeVisible();
  await expect(page.locator('label a[href="/privacy"]')).toBeVisible();
  const rejected = await page.request.post("/api/auth/register", { data: { email: "fixture@example.test", password: "password", displayName: "fixture" } });
  expect(rejected.status()).toBe(400);
  await review(page, info, "registration");
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await page.getByLabel("Email Aktif").fill("new-fixture@example.test");
  await page.getByLabel("Display Name", { exact: true }).fill("new_fixture");
  await page.getByLabel("Password Baru").fill("fixture-password");
  const accepted = page.waitForResponse(response => response.url().endsWith("/api/auth/register"));
  await page.getByRole("button", { name: "BUAT AKUN SAYA" }).click();
  const response = await accepted;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON().legalAcknowledgment).toEqual({ accepted: true, termsVersion: LEGAL_DOCUMENTS.terms.version, privacyVersion: LEGAL_DOCUMENTS.privacy.version });
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("full pages, footer, JSON-LD and modal distinguish current and prior licenses", async ({ page }, info) => {
  for (const [n, notice] of [[1, "CC BY-NC-ND 4.0"], [2, "mungkin pernah"], [3, "Publikasi gratis tercatat"], [4, "Pratinjau ini"]] as const) {
    await page.goto(`/photo/${photo(n)}`);
    const block = page.getByTestId("photo-license");
    await expect(block).toContainText(notice);
    const json = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText());
    if (n === 1) {
      expect(json.license).toContain("creativecommons.org/licenses/by-nc-nd/4.0");
      await expect(block.locator(`a[href="/api/photos/download/${photo(n)}"]`)).toBeVisible();
    } else {
      expect(json.license).toBeUndefined();
      expect(json.acquireLicensePage).toBe("https://provider.example/listing");
      await expect(block).toContainText("tidak dengan sendirinya memberi izin");
    }
    await expect(page.locator("footer")).toContainText("Lisensi & Legal");
    await expect(page.locator("footer")).not.toContainText("seluruh foto berlisensi");
    await review(page, info, `photo-${n}`);
  }
  await page.goto("/");
  await page.getByText("Sawah Padusan 1", { exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await expect(modal.getByTestId("photo-license")).toContainText("nonkomersial");
  await review(page, info, "modal-free");
  await modal.getByRole("button", { name: "Tutup modal", exact: true }).click();
  await page.getByText("Sawah Padusan 2", { exact: true }).click();
  await expect(page.getByRole("dialog").getByTestId("photo-license")).toContainText("mungkin pernah");
  await review(page, info, "modal-paid");
});

test("owner forms show prospective guidance while preserving existing controls", async ({ page }, info) => {
  const signedIn = await page.request.post("/api/auth/login", { data: { identifier: "fixture@example.test", password: "fixture-password" } });
  expect(signedIn.ok()).toBeTruthy();
  await page.goto("/dashboard/upload");
  await expect(page.getByRole("checkbox")).toHaveCount(2);
  await expect(page.getByTestId("owner-license-guidance")).toContainText("Jika dipublikasikan dengan tautan eksternal");
  await page.getByRole("checkbox", { name: "Saya akan menambahkan link Eksternal" }).uncheck();
  await expect(page.getByTestId("owner-license-guidance")).toContainText("Jika dipublikasikan tanpa tautan eksternal");
  await review(page, info, "upload");
  await page.goto(`/dashboard/edit/${photo(2)}`);
  await expect(page.getByText(/mungkin pernah ditawarkan/)).toBeVisible();
  await page.getByLabel("URL Eksternal (Opsional)").fill("");
  await expect(page.getByTestId("owner-license-guidance")).toContainText("Jika dipublikasikan tanpa tautan eksternal");
  await expect(page.getByRole("button", { name: "Simpan Draf", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publikasikan", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await review(page, info, "edit");
});

test("legal documents and About accurately explain licensing and processing", async ({ page }, info) => {
  for (const path of ["/terms", "/privacy", "/about"]) {
    await page.goto(path);
    if (path === "/terms") {
      await expect(page.locator("#riwayat-cc")).toContainText("tidak mencabut izin CC");
      await expect(page.locator("#laporan a")).toHaveAttribute("href", "https://github.com/Achmad-D-Fajar/photo-padusan/issues");
    }
    if (path === "/privacy") {
      await expect(page.locator("#ai")).toContainText("caption manual");
      await expect(page.locator("#retensi")).toContainText("lebih dari 24 jam");
      await expect(page.locator("main")).toContainText("belum diterbitkan");
    }
    await review(page, info, path.slice(1));
  }
});
