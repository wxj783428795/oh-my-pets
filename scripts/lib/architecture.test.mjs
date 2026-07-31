import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import {
  ARCHITECTURE_REPORT_PATH,
  analyzeArchitecture,
  assertAnalyzerSuccess,
  formatArchitectureSummary,
  isFormalSourcePath,
} from "./architecture.mjs";

const successfulAnalyzers = [
  { name: "oxlint", version: "1.76.0", status: 0, output: "" },
  { name: "clippy", version: "1.97.1", status: 0, output: "" },
];
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const oxlintCli = join(
  repositoryRoot,
  "node_modules",
  "oxlint",
  "bin",
  "oxlint",
);

function cargoMetadata(dependencies = {}) {
  const packageNames = ["oh-my-pets-domain", "oh-my-pets"];
  return {
    workspace_members: packageNames,
    packages: packageNames.map((name) => ({
      id: name,
      name,
      manifest_path:
        name === "oh-my-pets-domain"
          ? "/repo/src/pet-domain/Cargo.toml"
          : "/repo/src-tauri/Cargo.toml",
      dependencies: (dependencies[name] ?? []).map((dependencyName) => ({
        name: dependencyName,
      })),
    })),
  };
}

describe("架构反馈", () => {
  test("正式源码范围显式排除测试、声明和浏览器 seam", () => {
    expect(isFormalSourcePath("src/ui/App.vue")).toBe(true);
    expect(isFormalSourcePath("scripts/lib/doctor.mjs")).toBe(true);
    expect(isFormalSourcePath("src/pet-domain/src/validation.rs")).toBe(true);
    expect(isFormalSourcePath("src-tauri/src/lib.rs")).toBe(true);
    expect(isFormalSourcePath("src-tauri/build.rs")).toBe(true);

    for (const excludedPath of [
      "src/ui/App.test.ts",
      "src/ui/env.d.ts",
      "src/ui/browser-test-platform.ts",
      "scripts/lib/doctor.test.mjs",
      "src-tauri/tests/display_motion.rs",
      "research/experiment.ts",
      "reference/vendor.ts",
      ".scratch/demo/prototypes/shell.ts",
      "target/generated.ts",
    ]) {
      expect(isFormalSourcePath(excludedPath)).toBe(false);
    }
  });

  test("空范围和越界文件会失败而不是生成误导报告", () => {
    expect(() =>
      analyzeArchitecture({
        repositoryRoot: "/repo",
        sourceFiles: [],
        cargoMetadata: cargoMetadata(),
        analyzerResults: successfulAnalyzers,
      }),
    ).toThrow("正式源码范围为空");

    expect(() =>
      analyzeArchitecture({
        repositoryRoot: "/repo",
        sourceFiles: [
          {
            path: "src/ui/App.test.ts",
            source: "export const fixture = true;\n",
          },
        ],
        cargoMetadata: cargoMetadata(),
        analyzerResults: successfulAnalyzers,
      }),
    ).toThrow("正式源码范围包含越界文件");
  });

  test("报告稳定记录路径、非空 LOC、热点分组和允许的依赖方向", () => {
    const report = analyzeArchitecture({
      repositoryRoot: "/repo",
      sourceFiles: [
        {
          path: "src/ui/main.ts",
          source: [
            'import { platform } from "./platform";',
            "",
            "export const app = platform;",
          ].join("\n"),
        },
        {
          path: "src/ui/platform.ts",
          source: "export const platform = 'tauri';\n",
        },
        {
          path: "src/pet-domain/src/lib.rs",
          source: "pub mod model;\n",
        },
        {
          path: "src-tauri/src/lib.rs",
          source: "pub fn run() {}\n",
        },
      ],
      cargoMetadata: cargoMetadata({
        "oh-my-pets": ["oh-my-pets-domain"],
      }),
      analyzerResults: successfulAnalyzers,
    });

    expect(report.schemaVersion).toBe(1);
    expect(report.source.summary).toEqual({
      files: 4,
      loc: 6,
      hotspotGroups: {
        large: 0,
        medium: 0,
        small: 4,
      },
    });
    expect(report.source.modules.map(({ path }) => path)).toEqual([
      "src-tauri/src/lib.rs",
      "src/pet-domain/src/lib.rs",
      "src/ui/main.ts",
      "src/ui/platform.ts",
    ]);
    expect(report.dependencies.web).toEqual({
      edges: [
        {
          from: "src/ui/main.ts",
          to: "src/ui/platform.ts",
        },
      ],
      external: [],
      cycles: [],
    });
    expect(report.dependencies.rust.edges).toEqual([
      {
        from: "oh-my-pets",
        to: "oh-my-pets-domain",
      },
    ]);
    expect(report.dependencies.rust.forbidden).toEqual([]);
    expect(report.complexity).toEqual({
      web: {
        analyzer: "oxlint",
        version: "1.76.0",
        rules: ["complexity", "import/no-cycle"],
        status: "passed",
      },
      rust: {
        analyzer: "clippy",
        version: "1.97.1",
        rules: ["clippy::cognitive_complexity"],
        status: "passed",
      },
    });
    expect(JSON.stringify(report)).not.toContain("/repo");
    expect(formatArchitectureSummary(report)).toContain(
      "正式源码：4 个模块，6 LOC",
    );
  });

  test("前端循环依赖会阻断报告", () => {
    expect(() =>
      analyzeArchitecture({
        repositoryRoot: "/repo",
        sourceFiles: [
          {
            path: "src/ui/a.ts",
            source: 'import "./b";\n',
          },
          {
            path: "src/ui/b.ts",
            source: 'import "./a";\n',
          },
        ],
        cargoMetadata: cargoMetadata(),
        analyzerResults: successfulAnalyzers,
      }),
    ).toThrow("前端循环依赖：src/ui/a.ts -> src/ui/b.ts -> src/ui/a.ts");
  });

  test("Rust domain 反向依赖桌面壳会阻断报告", () => {
    expect(() =>
      analyzeArchitecture({
        repositoryRoot: "/repo",
        sourceFiles: [
          {
            path: "src/pet-domain/src/lib.rs",
            source: "pub fn validate() {}\n",
          },
          {
            path: "src-tauri/src/lib.rs",
            source: "pub fn run() {}\n",
          },
        ],
        cargoMetadata: cargoMetadata({
          "oh-my-pets-domain": ["oh-my-pets"],
        }),
        analyzerResults: successfulAnalyzers,
      }),
    ).toThrow("禁止的 Rust 依赖方向：oh-my-pets-domain -> oh-my-pets");
  });

  test("Cargo workspace 成员位于仓库外时视为范围污染", () => {
    const metadata = cargoMetadata();
    metadata.packages[0].manifest_path = "/outside/Cargo.toml";

    expect(() =>
      analyzeArchitecture({
        repositoryRoot: "/repo",
        sourceFiles: [
          {
            path: "src/pet-domain/src/lib.rs",
            source: "pub fn validate() {}\n",
          },
        ],
        cargoMetadata: metadata,
        analyzerResults: successfulAnalyzers,
      }),
    ).toThrow("Cargo workspace 包位于仓库外：/outside/Cargo.toml");
  });

  test("外部分析器失败会保留原始原因并阻断", () => {
    expect(() =>
      assertAnalyzerSuccess({
        name: "oxlint",
        status: 2,
        output: "unknown rule import/no-cycle",
      }),
    ).toThrow("oxlint 分析失败：unknown rule import/no-cycle");
  });

  test(
    "真实 Oxlint 与 Clippy 会阻断高复杂函数和循环 import",
    async () => {
      const fixtureRoot = await mkdtemp(
        join(tmpdir(), "oh-my-pets-architecture-"),
      );
      const writeFixture = async (path, source) => {
        const absolutePath = join(fixtureRoot, path);
        await mkdir(dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, source);
      };

      try {
        await writeFixture(
          ".oxlintrc.json",
          await readFile(
            new URL("../../.oxlintrc.json", import.meta.url),
            "utf8",
          ),
        );
        const branches = Array.from(
          { length: 21 },
          (_, index) => `  if (values[${index}]) total += 1;`,
        ).join("\n");
        await writeFixture(
          "scripts/a.mjs",
          `import "./b.mjs";\nexport function complex(values) {\n  let total = 0;\n${branches}\n  return total;\n}\n`,
        );
        await writeFixture("scripts/b.mjs", 'import "./a.mjs";\n');

        const oxlint = spawnSync(process.execPath, [oxlintCli, "."], {
          cwd: fixtureRoot,
          encoding: "utf8",
        });
        const oxlintOutput = `${oxlint.stdout}\n${oxlint.stderr}`;
        expect(oxlint.status).not.toBe(0);
        expect(oxlintOutput).toContain("eslint(complexity)");
        expect(oxlintOutput).toContain("import(no-cycle)");

        await writeFixture(
          "Cargo.toml",
          '[package]\nname = "architecture-fixture"\nversion = "0.0.0"\nedition = "2024"\n',
        );
        const rustBranches = Array.from(
          { length: 30 },
          (_, index) => `    if values[${index}] { total += 1; }`,
        ).join("\n");
        await writeFixture(
          "src/lib.rs",
          `pub fn complex(values: &[bool; 30]) -> usize {\n    let mut total = 0;\n${rustBranches}\n    total\n}\n`,
        );
        const clippy = spawnSync(
          "cargo",
          [
            "clippy",
            "--offline",
            "--manifest-path",
            join(fixtureRoot, "Cargo.toml"),
            "--",
            "-D",
            "warnings",
            "-D",
            "clippy::cognitive_complexity",
          ],
          {
            cwd: fixtureRoot,
            encoding: "utf8",
          },
        );
        const clippyOutput = `${clippy.stdout}\n${clippy.stderr}`;
        expect(clippy.status).not.toBe(0);
        expect(clippyOutput).toContain("cognitive-complexity");
      } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
      }
    },
    15_000,
  );

  test("根命令、Oxlint 规则、报告目录和 verify 接线稳定", async () => {
    const [packageSource, oxlintSource, architectureScript] = await Promise.all(
      [
        readFile(new URL("../../package.json", import.meta.url), "utf8"),
        readFile(new URL("../../.oxlintrc.json", import.meta.url), "utf8"),
        readFile(new URL("../check-architecture.mjs", import.meta.url), "utf8"),
      ],
    );
    const packageJson = JSON.parse(packageSource);
    const oxlint = JSON.parse(oxlintSource);
    const architectureOverride = oxlint.overrides.find(
      (override) => override.rules?.complexity,
    );

    expect(ARCHITECTURE_REPORT_PATH).toBe(
      "target/quality/architecture/report.json",
    );
    expect(packageJson.scripts["architecture:check"]).toBe(
      "node scripts/check-architecture.mjs",
    );
    expect(packageJson.scripts["verify:core"]).toContain(
      "pnpm architecture:check",
    );
    expect(packageJson.scripts["lint:rust"]).toContain("--all-targets");
    expect(architectureScript).toContain('"--lib"');
    expect(architectureScript).toContain('"--bins"');
    expect(architectureScript).toContain('"clippy::cognitive_complexity"');
    expect(architectureScript).not.toContain('"--all-targets"');
    expect(architectureOverride.rules.complexity).toEqual(["error", 20]);
    expect(architectureOverride.rules["import/no-cycle"]).toBe("error");
    expect(architectureOverride.excludeFiles).toEqual([
      "src/ui/**/*.test.ts",
      "src/ui/browser-test-platform.ts",
      "scripts/**/*.test.mjs",
    ]);
  });
});
