import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testDir: "./tests/browser-pwa",
  outputDir: "test-results/pwa",
  timeout: 45000,
  use: { ...base.use, baseURL: "http://127.0.0.1:5174" },
  webServer: {
    command:
      "VITE_ENABLE_PREVIEW=true npm run build && node scripts/serve-built.mjs",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
