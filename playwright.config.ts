import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:1421";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "target/playwright/results",
  updateSnapshots: "none",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [
    ["line"],
    [
      "html",
      {
        open: "never",
        outputFolder: "target/playwright/report",
      },
    ],
  ],
  use: {
    baseURL,
    headless: true,
    viewport: {
      width: 900,
      height: 760,
    },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    colorScheme: "light",
    contextOptions: {
      reducedMotion: "reduce",
    },
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
  webServer: {
    command: "pnpm dev:web:e2e",
    url: baseURL,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      VITE_BROWSER_TEST: "true",
    },
  },
});
