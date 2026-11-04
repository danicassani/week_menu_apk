import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  testDir: "./tests/browser-release",
  outputDir: "test-results/release",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: "http://127.0.0.1:5175", trace: "retain-on-failure" },
  projects: [
    {
      name: "android-chromium",
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        launchOptions: base.use?.launchOptions,
      },
    },
    {
      name: "iphone-webkit",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
  ],
  webServer: {
    command:
      "VITE_ENABLE_PREVIEW=true npm run build && PORT=5175 node scripts/serve-built.mjs",
    url: "http://127.0.0.1:5175",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
