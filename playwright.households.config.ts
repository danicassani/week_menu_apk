import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  testDir: "./tests/browser-households",
  outputDir: "test-results/households",
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:5176",
    trace: "retain-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { browserName: "chromium", launchOptions: base.use?.launchOptions },
    },
    {
      name: "phone-chromium",
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
      "VITE_SUPABASE_URL=https://household-tests.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test_only npm run dev -- --port 5176",
    url: "http://127.0.0.1:5176",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
