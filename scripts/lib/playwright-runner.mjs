import { resolve } from "node:path";

const argumentsByAction = Object.freeze({
  install: Object.freeze(["install", "chromium"]),
  test: Object.freeze(["test", "--config", "playwright.config.ts"]),
  update: Object.freeze([
    "test",
    "--config",
    "playwright.config.ts",
    "--update-snapshots=changed",
  ]),
});

export function playwrightPaths(repositoryRoot) {
  return {
    browsers: resolve(repositoryRoot, "target/playwright-browsers"),
    report: resolve(repositoryRoot, "target/playwright/report"),
    results: resolve(repositoryRoot, "target/playwright/results"),
  };
}

export function playwrightArgumentsFor(action) {
  const argumentsForAction = argumentsByAction[action];
  if (!argumentsForAction) {
    throw new Error(
      "用法: node scripts/run-playwright.mjs <install|test|update>",
    );
  }
  return [...argumentsForAction];
}

export function playwrightFailureGuidance() {
  return [
    "Playwright 检查失败：",
    "- 若浏览器未安装，运行 `pnpm test:e2e:install`。",
    "- 视觉 expected/actual/diff 与 trace 位于 `target/playwright/results/`。",
    "- HTML 报告位于 `target/playwright/report/`。",
  ].join("\n");
}
