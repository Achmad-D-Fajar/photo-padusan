import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", channel: process.env.PLAYWRIGHT_CHANNEL, screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: [
    { command: "node tests/ui/mock-supabase.cjs", url: "http://127.0.0.1:54321/health", reuseExistingServer: false },
    {
      command: "node node_modules/next/dist/bin/next dev --port 3100 --hostname 127.0.0.1",
      url: "http://127.0.0.1:3100/register", timeout: 180_000, reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
        GEMINI_API_KEY: "fixture-no-live-ai",
        CRON_SECRET: "fixture-no-live-cron",
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
      },
    },
  ],
});
