import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

const configUrl = new URL("../../src-tauri/tauri.conf.json", import.meta.url);
const packageUrl = new URL("../../package.json", import.meta.url);

describe("Tauri 内容安全策略", () => {
  test("只允许图片上下文读取 data URL 且不放开动态求值", async () => {
    const config = JSON.parse(await readFile(configUrl, "utf8"));
    const csp = config.app.security.csp;

    expect(csp).toMatch(/img-src[^;]*\bdata:/);
    expect(csp).not.toMatch(/connect-src[^;]*\bdata:/);
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test("macOS 人工 QA 构建带品牌图标的 app bundle", async () => {
    const config = JSON.parse(await readFile(configUrl, "utf8"));
    const packageJson = JSON.parse(await readFile(packageUrl, "utf8"));

    expect(config.bundle.icon).toContain("icons/icon.icns");
    expect(packageJson.scripts["build:desktop:qa"]).toBe(
      "tauri build --bundles app",
    );
    expect(
      packageJson.scripts["qa:desktop"].startsWith("pnpm build:desktop:qa &&"),
    ).toBe(true);
  });
});
