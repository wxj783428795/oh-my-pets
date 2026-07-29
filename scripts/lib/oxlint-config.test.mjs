import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const packageUrl = new URL("../../package.json", import.meta.url);
const configUrl = new URL("../../.oxlintrc.json", import.meta.url);
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const oxlintCli = join(
  repositoryRoot,
  "node_modules",
  "oxlint",
  "bin",
  "oxlint",
);

describe("Oxlint 前端静态分析契约", () => {
  test("根 lint:web 先运行普通 Oxlint，再保留 vue-tsc 类型检查", async () => {
    const packageJson = JSON.parse(await readFile(packageUrl, "utf8"));

    expect(packageJson.scripts["lint:web"]).toBe(
      "oxlint src/ui scripts tests/e2e vite.config.ts playwright.config.ts && vue-tsc --noEmit",
    );
    expect(packageJson.devDependencies.oxlint).toBeDefined();
    expect(packageJson.devDependencies["oxlint-tsgolint"]).toBeUndefined();
    expect(packageJson.engines.node).toBe(">=22.12.0");
  });

  test("稳定配置启用相关原生插件，并显式隔离辅助与生成范围", async () => {
    const config = JSON.parse(await readFile(configUrl, "utf8"));

    expect(config.$schema).toBe(
      "./node_modules/oxlint/configuration_schema.json",
    );
    expect(config.categories).toEqual({
      correctness: "error",
      suspicious: "error",
    });
    expect(config.plugins).toEqual(
      expect.arrayContaining([
        "typescript",
        "vue",
        "vitest",
        "import",
        "promise",
        "oxc",
      ]),
    );
    expect(config.options).toMatchObject({
      denyWarnings: true,
      typeAware: false,
      typeCheck: false,
    });
    expect(config.ignorePatterns).toEqual(
      expect.arrayContaining([
        "reference/**",
        "research/**",
        ".scratch/**/prototypes/**",
        "output/**",
        "target/**",
        "dist/**",
        "src-tauri/gen/**",
      ]),
    );
  });

  test("真实 Oxlint 忽略辅助生成物，并阻断正式测试中的无类型 mock", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "oh-my-pets-oxlint-"));
    const writeFixture = async (relativePath, source) => {
      const absolutePath = join(fixtureRoot, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source);
    };
    const violation = "const fixed = 1;\nfixed = 2;\n";

    try {
      await writeFile(
        join(fixtureRoot, ".oxlintrc.json"),
        await readFile(configUrl, "utf8"),
      );
      await writeFixture("src/ui/good.ts", "export const answer = 42;\n");
      await writeFixture("scripts/good.mjs", "export const answer = 42;\n");
      await writeFixture(
        "vite.config.ts",
        "export default { clearScreen: false };\n",
      );
      for (const excludedPath of [
        "reference/vendor.ts",
        "research/experiment.ts",
        ".scratch/demo/prototypes/shell.ts",
        "output/report.ts",
        "target/generated.ts",
        "dist/bundle.js",
        "src-tauri/gen/schema.ts",
      ]) {
        await writeFixture(excludedPath, violation);
      }

      const excludedRun = spawnSync(process.execPath, [oxlintCli, "."], {
        cwd: fixtureRoot,
        encoding: "utf8",
      });
      expect(excludedRun).toMatchObject({ status: 0 });

      await writeFixture(
        "src/ui/broken.test.ts",
        "const brokenMock = vi.fn();\nexport { brokenMock };\n",
      );
      const failureRun = spawnSync(
        process.execPath,
        [
          oxlintCli,
          "src/ui",
          "scripts",
          "tests/e2e",
          "vite.config.ts",
          "playwright.config.ts",
        ],
        {
          cwd: fixtureRoot,
          encoding: "utf8",
        },
      );
      const output = `${failureRun.stdout}\n${failureRun.stderr}`;

      expect(failureRun.status).not.toBe(0);
      expect(output).toContain("vitest(require-mock-type-parameters)");
      expect(output).toContain("src/ui/broken.test.ts");
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
