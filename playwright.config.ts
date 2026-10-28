import { defineConfig } from "@playwright/test";

// End-to-end tests run against a production build of the app (`npm run build` first).
// No Supabase variables are set, so the app runs in guest mode with browser storage only.
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  // No retries: a retry would hide timing-dependent regressions such as the update notice.
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${port}`,
        url: `http://localhost:${port}/api/app-version`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
