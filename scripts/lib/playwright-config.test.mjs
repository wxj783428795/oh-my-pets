import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import playwrightConfig from "../../playwright.config.ts";
import viteConfig from "../../vite.config.ts";
import { playwrightPaths } from "./playwright-runner.mjs";

describe("Playwright 视觉与 E2E 配置契约", () => {
  test("Vitest 与 Playwright 的用例发现范围互不重叠", () => {
    expect(viteConfig.test?.exclude).toContain("tests/e2e/**");
    expect(playwrightConfig.testDir).toBe("./tests/e2e");
  });

  test("固定浏览器像素输入并禁止常规命令更新基线", () => {
    expect(playwrightConfig.updateSnapshots).toBe("none");
    expect(playwrightConfig.use).toMatchObject({
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
    });
    expect(playwrightConfig.projects).toEqual([
      {
        name: "chromium",
        use: {
          browserName: "chromium",
        },
      },
    ]);
  });

  test("失败产物、报告与浏览器均位于 target 本地输出边界", () => {
    expect(playwrightConfig.outputDir).toBe("target/playwright/results");
    expect(playwrightConfig.reporter).toContainEqual([
      "html",
      {
        open: "never",
        outputFolder: "target/playwright/report",
      },
    ]);

    expect(playwrightPaths("/repo").browsers.replaceAll("\\", "/")).toMatch(
      /\/repo\/target\/playwright-browsers$/,
    );
  });

  test("根命令固定依赖、显式更新基线并进入 verify:core", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    );

    expect(packageJson.devDependencies["@playwright/test"]).toBe("1.62.0");
    expect(packageJson.scripts["test:e2e"]).toBe(
      "node scripts/run-playwright.mjs test",
    );
    expect(packageJson.scripts["test:e2e:update"]).toBe(
      "node scripts/run-playwright.mjs update",
    );
    expect(packageJson.scripts["dev:web:e2e"]).toContain(
      `--port ${new URL(playwrightConfig.use.baseURL).port}`,
    );
    expect(packageJson.scripts["verify:core"]).toContain("pnpm test:e2e");
  });
});
