import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

const repositoryUrl = new URL("../..", import.meta.url);
const readRepositoryFile = (path) =>
  readFile(new URL(path, repositoryUrl), "utf8");

describe("干净环境与 GitHub CI 契约", () => {
  test("固定 Node、pnpm 与 Rust 工具链版本", async () => {
    const [packageSource, nodeVersion, rustToolchain] = await Promise.all([
      readRepositoryFile("package.json"),
      readRepositoryFile(".node-version"),
      readRepositoryFile("rust-toolchain.toml"),
    ]);
    const packageJson = JSON.parse(packageSource);

    expect(nodeVersion.trim()).toBe("22.14.0");
    expect(packageJson.packageManager).toBe("pnpm@10.27.0");
    expect(packageJson.engines).toEqual({
      node: ">=22.12.0",
      pnpm: ">=10",
    });
    expect(rustToolchain).toContain('channel = "1.97.1"');
    expect(rustToolchain).toContain('profile = "minimal"');
    expect(rustToolchain).toContain('components = ["rustfmt", "clippy"]');
  });

  test("根命令从 frozen install 和固定 Chromium 进入最终 verify", async () => {
    const packageJson = JSON.parse(await readRepositoryFile("package.json"));

    expect(packageJson.scripts["ci:bootstrap"]).toBe(
      "pnpm install --frozen-lockfile && pnpm test:e2e:install",
    );
    expect(packageJson.scripts["ci:verify"]).toBe(
      "pnpm ci:bootstrap && pnpm verify",
    );
    expect(packageJson.scripts["ci:verify"]).not.toContain("verify:core");
    expect(packageJson.scripts["ci:verify"]).not.toContain("test:e2e:update");
  });

  test("GitHub workflow 仅验证受保护目标分支 PR 和手动触发", async () => {
    const workflow = await readRepositoryFile(".github/workflows/verify.yml");

    expect(workflow).toContain(`on:
  pull_request:
    branches:
      - main
      - "integration/**"
      - "release/**"
  workflow_dispatch:
`);
    expect(workflow).not.toMatch(/\n\s{2}push:/);
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).not.toContain("pull_request_target:");
    expect(workflow).not.toMatch(/\bwrite\b/);
    expect(workflow).toContain("runs-on: macos-latest");
    expect(workflow).toContain("timeout-minutes: 30");
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toContain("name: macOS ARM64 最终验证");
    expect(workflow).not.toContain("matrix:");
    expect(workflow).not.toContain("schedule:");
  });

  test("GitHub workflow 固定 actions、运行最终根命令并仅上传短期失败产物", async () => {
    const workflow = await readRepositoryFile(".github/workflows/verify.yml");

    expect(workflow).toContain(
      "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
    );
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain(
      "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
    );
    expect(workflow).toContain(
      "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
    );
    expect(workflow).toContain("corepack prepare pnpm@10.27.0 --activate");
    expect(workflow).toContain("run: pnpm ci:verify");
    expect(workflow).not.toContain("run: pnpm verify:core");
    expect(workflow).not.toContain("test:e2e:update");
    expect(workflow).not.toContain("pnpm coverage");
    expect(workflow).toContain("if: failure() && !cancelled()");
    expect(workflow).toContain("if-no-files-found: ignore");
    expect(workflow).toContain("retention-days: 3");
    expect(workflow).not.toContain("target/playwright-browsers");
  });
});
