import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

import {
  WEB_COVERAGE_EXCLUDE,
  WEB_COVERAGE_INCLUDE,
  WEB_COVERAGE_REPORTERS,
  WEB_COVERAGE_REPORTS_DIRECTORY,
} from "./scripts/lib/coverage-contract.mjs";

export default defineConfig({
  plugins: [vue()],
  publicDir: "assets",
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  test: {
    coverage: {
      provider: "v8",
      include: [...WEB_COVERAGE_INCLUDE],
      exclude: [...WEB_COVERAGE_EXCLUDE],
      reporter: [...WEB_COVERAGE_REPORTERS],
      reportsDirectory: WEB_COVERAGE_REPORTS_DIRECTORY,
    },
  },
});
