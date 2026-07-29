import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import viteConfig from "../../vite.config.ts";

import {
  WEB_COVERAGE_EXCLUDE,
  WEB_COVERAGE_INCLUDE,
  WEB_COVERAGE_REPORTERS,
  WEB_COVERAGE_REPORTS_DIRECTORY,
  validateCoverageReport,
  validateRustCoverageSummary,
  validateWebCoverageSummary,
} from "./coverage-contract.mjs";

describe("覆盖率范围与报告契约", () => {
  test("根命令分别覆盖 Web、Rust 和聚合入口，且不进入 verify", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    );

    expect(packageJson.scripts["coverage:web"]).toBe(
      "vitest run --coverage && node scripts/check-coverage-report.mjs web",
    );
    expect(packageJson.scripts["coverage:rust"]).toBe(
      "node scripts/coverage-rust.mjs",
    );
    expect(packageJson.scripts.coverage).toBe(
      "pnpm coverage:web && pnpm coverage:rust",
    );
    expect(packageJson.scripts.verify).not.toContain("coverage");
    expect(packageJson.devDependencies["@vitest/coverage-v8"]).toBe("3.2.7");
  });

  test("Vite 使用固定的 V8 provider、正式范围和本地报告路径，不设置阈值", () => {
    expect(viteConfig.test?.coverage).toMatchObject({
      provider: "v8",
      include: WEB_COVERAGE_INCLUDE,
      exclude: WEB_COVERAGE_EXCLUDE,
      reporter: WEB_COVERAGE_REPORTERS,
      reportsDirectory: WEB_COVERAGE_REPORTS_DIRECTORY,
    });
    expect(viteConfig.test?.coverage).not.toHaveProperty("thresholds");
  });

  test("Vitest 只采集正式 UI 与工程脚本，并输出文本、JSON 摘要和 HTML", () => {
    expect(WEB_COVERAGE_INCLUDE).toEqual([
      "src/ui/**/*.{ts,vue}",
      "scripts/**/*.mjs",
    ]);
    expect(WEB_COVERAGE_EXCLUDE).toContain("**/*.test.{ts,mjs}");
    expect(WEB_COVERAGE_EXCLUDE).toContain("**/*.d.ts");
    expect(WEB_COVERAGE_EXCLUDE).toContain("src/ui/browser-test-platform.ts");
    expect(WEB_COVERAGE_REPORTERS).toEqual(["text", "json-summary", "html"]);
    expect(WEB_COVERAGE_REPORTS_DIRECTORY).toBe("target/coverage/web");
  });

  test("Vitest 摘要接受正式源码并拒绝测试或辅助资产", () => {
    expect(
      validateWebCoverageSummary(
        {
          total: {},
          "/repo/src/ui/App.vue": {},
          "/repo/scripts/doctor.mjs": {},
        },
        "/repo",
      ),
    ).toEqual({ files: 2 });

    expect(() =>
      validateWebCoverageSummary(
        {
          total: {},
          "/repo/src/ui/App.test.ts": {},
          "/repo/src/ui/browser-test-platform.ts": {},
          "/repo/research/notes.mjs": {},
        },
        "/repo",
      ),
    ).toThrow(
      "Vitest 覆盖率包含非正式源码：src/ui/App.test.ts, src/ui/browser-test-platform.ts, research/notes.mjs",
    );
  });

  test("Rust 摘要只接受两个 workspace crate 的 src 目录", () => {
    expect(
      validateRustCoverageSummary(
        {
          data: [
            {
              files: [
                { filename: "/repo/src/pet-domain/src/validation.rs" },
                { filename: "/repo/src-tauri/src/lib.rs" },
              ],
            },
          ],
        },
        "/repo",
      ),
    ).toEqual({ files: 2 });

    expect(() =>
      validateRustCoverageSummary(
        {
          data: [
            {
              files: [
                { filename: "/repo/src-tauri/tests/diagnostics.rs" },
                { filename: "/repo/target/generated.rs" },
              ],
            },
          ],
        },
        "/repo",
      ),
    ).toThrow(
      "Rust 覆盖率包含非正式源码：src-tauri/tests/diagnostics.rs, target/generated.rs",
    );
  });

  test("空报告不能冒充成功基线", () => {
    expect(() => validateWebCoverageSummary({ total: {} }, "/repo")).toThrow(
      "Vitest 覆盖率报告没有正式源码",
    );
    expect(() =>
      validateRustCoverageSummary({ data: [{ files: [] }] }, "/repo"),
    ).toThrow("Rust 覆盖率报告没有正式源码");
  });

  test("报告检查器从固定的本地输出路径读取实际结果", async () => {
    const readJson = async (path) => {
      if (path === "/repo/target/coverage/web/coverage-summary.json") {
        return { total: {}, "/repo/src/ui/App.vue": {} };
      }
      if (path === "/repo/target/coverage/rust/summary.json") {
        return {
          data: [{ files: [{ filename: "/repo/src-tauri/src/lib.rs" }] }],
        };
      }
      throw new Error(`意外路径：${path}`);
    };

    await expect(
      validateCoverageReport({
        kind: "web",
        repositoryRoot: "/repo",
        readJson,
      }),
    ).resolves.toEqual({
      files: 1,
      report: "target/coverage/web/coverage-summary.json",
    });
    await expect(
      validateCoverageReport({
        kind: "rust",
        repositoryRoot: "/repo",
        readJson,
      }),
    ).resolves.toEqual({
      files: 1,
      report: "target/coverage/rust/summary.json",
    });
  });
});
