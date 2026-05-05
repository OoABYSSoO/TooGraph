import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3477";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL,
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm start",
        cwd: "..",
        url: `${baseURL}/health`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
