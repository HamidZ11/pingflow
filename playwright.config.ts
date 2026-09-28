import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against a running app and the local Supabase stack
// (`pnpm db:start`). Magic links are read from the local mail catcher.
// Screenshots, video and traces are off: these tests check behaviour.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

// The database test talks to Supabase directly and needs the local keys.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: that test skips itself.
}

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 90_000,
  reporter: "list",
  use: { baseURL, screenshot: "off", video: "off", trace: "off" },
  webServer: {
    command: "pnpm build && pnpm start --port 3100",
    url: `${baseURL}/sign-in`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /database\//,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "webkit",
      testIgnore: /database\//,
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1440, height: 900 },
      },
    },
    { name: "database", testMatch: /database\/.*\.spec\.ts/ },
  ],
});
