import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "nutrition-content", test: /content\/starter/ },
            { name: "date-time", test: /@js-temporal|jsbi/ },
            { name: "supabase", test: /@supabase/ },
            { name: "react", test: /node_modules\/react/ },
          ],
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 30000,
  },
});
