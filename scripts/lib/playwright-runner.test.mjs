import { describe, expect, test } from "vitest";

import {
  playwrightArgumentsFor,
  playwrightFailureGuidance,
  playwrightPaths,
} from "./playwright-runner.mjs";

describe("Playwright 根命令运行契约", () => {
  test("浏览器缓存和失败产物都留在 target 边界", () => {
    const paths = playwrightPaths("/repo");
    expect(paths.browsers.replaceAll("\\", "/")).toMatch(
      /\/repo\/target\/playwright-browsers$/,
    );
    expect(paths.report.replaceAll("\\", "/")).toMatch(
      /\/repo\/target\/playwright\/report$/,
    );
    expect(paths.results.replaceAll("\\", "/")).toMatch(
      /\/repo\/target\/playwright\/results$/,
    );
  });

  test("安装只取 Chromium，普通测试不更新基线", () => {
    expect(playwrightArgumentsFor("install")).toEqual(["install", "chromium"]);
    expect(playwrightArgumentsFor("test")).toEqual([
      "test",
      "--config",
      "playwright.config.ts",
    ]);
  });

  test("只有显式 update 动作允许更新变化的基线", () => {
    expect(playwrightArgumentsFor("update")).toEqual([
      "test",
      "--config",
      "playwright.config.ts",
      "--update-snapshots=changed",
    ]);
    expect(() => playwrightArgumentsFor("unknown")).toThrow(
      "用法: node scripts/run-playwright.mjs <install|test|update>",
    );
  });

  test("失败反馈指向浏览器安装和 expected/actual/diff 报告", () => {
    expect(playwrightFailureGuidance()).toContain("pnpm test:e2e:install");
    expect(playwrightFailureGuidance()).toContain("target/playwright/results");
    expect(playwrightFailureGuidance()).toContain("expected/actual/diff");
    expect(playwrightFailureGuidance()).toContain("target/playwright/report");
  });
});
