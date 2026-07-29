import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import {
  DEVELOPMENT_PORT,
  diagnoseRepository,
  doctorExitCode,
  formatDoctorReport,
} from "./doctor.mjs";

const repositoryRoot = "/repo";
const healthyPaths = [
  "package.json",
  "pnpm-lock.yaml",
  "node_modules/.modules.yaml",
  "Cargo.toml",
  "Cargo.lock",
  "src-tauri/Cargo.toml",
  "src/pet-domain/Cargo.toml",
  "docs/desktop-recovery.md",
  "target/release/oh-my-pets",
  "target/desktop-smoke/report.json",
];

function commandKey(command, args) {
  return [command, ...args].join(" ");
}

function successful(stdout) {
  return { ok: true, stdout, stderr: "" };
}

function fixture({
  platform = "darwin",
  commands = {},
  paths = healthyPaths,
  occupiedPort = false,
} = {}) {
  const commandResults = new Map(
    Object.entries({
      "node --version": successful("v22.14.0"),
      "pnpm --version": successful("10.27.0"),
      "rustc --version": successful("rustc 1.97.1 (fixture)"),
      "cargo --version": successful("cargo 1.97.1 (fixture)"),
      "pnpm exec tauri --version": successful("tauri-cli 2.11.4"),
      "xcode-select -p": successful("/Applications/Xcode.app"),
      ...commands,
    }),
  );
  const existingPaths = new Set(paths);

  return {
    platform,
    async run(command, args) {
      return (
        commandResults.get(commandKey(command, args)) ?? {
          ok: false,
          stdout: "",
          stderr: "fixture 中未定义命令",
        }
      );
    },
    async pathExists(absolutePath) {
      const relativePath = absolutePath.slice(repositoryRoot.length + 1);
      return existingPaths.has(relativePath);
    },
    async isPortOccupied(host, port) {
      expect(host).toBe("127.0.0.1");
      expect(port).toBe(DEVELOPMENT_PORT);
      return occupiedPort;
    },
  };
}

function checksById(report) {
  return Object.fromEntries(report.checks.map((check) => [check.id, check]));
}

describe("只读 doctor", () => {
  test("健康的 macOS 开发环境得到稳定的全通过结果", async () => {
    const report = await diagnoseRepository({
      repositoryRoot,
      probes: fixture(),
    });
    const checks = checksById(report);

    expect(report.readOnly).toBe(true);
    expect(report.recoveryGuide).toBe("docs/desktop-recovery.md");
    expect(report.summary).toEqual({ pass: 13, warn: 0, fail: 0 });
    expect(report.checks.map(({ id }) => id)).toEqual([
      "platform",
      "node",
      "pnpm",
      "rustc",
      "cargo",
      "tauri-cli",
      "tauri-prerequisites",
      "development-port",
      "dependency-manifests",
      "node-dependencies",
      "recovery-guide",
      "build-output",
      "diagnostics",
    ]);
    expect(checks.node.detail).toContain("v22.14.0");
    expect(checks.pnpm.detail).toContain("10.27.0");
    expect(checks.rustc.status).toBe("pass");
    expect(checks.cargo.status).toBe("pass");
    expect(checks["development-port"].detail).toContain("127.0.0.1:1420");
    expect(doctorExitCode(report)).toBe(0);
  });

  test("工具缺失和版本过旧会失败并给出仓库内下一步", async () => {
    const missing = { ok: false, stdout: "", stderr: "command not found" };
    const report = await diagnoseRepository({
      repositoryRoot,
      probes: fixture({
        commands: {
          "node --version": successful("v20.18.0"),
          "pnpm --version": missing,
          "rustc --version": missing,
          "cargo --version": missing,
          "pnpm exec tauri --version": missing,
          "xcode-select -p": missing,
        },
      }),
    });
    const checks = checksById(report);

    expect(checks.node).toMatchObject({ status: "fail" });
    expect(checks.node.next).toContain("Node 22");
    expect(checks.pnpm).toMatchObject({ status: "fail" });
    expect(checks.pnpm.next).toContain("corepack");
    expect(checks.rustc.next).toContain("desktop-recovery.md");
    expect(checks.cargo.next).toContain("desktop-recovery.md");
    expect(checks["tauri-cli"].next).toContain("pnpm install");
    expect(checks["tauri-prerequisites"].next).toContain(
      "desktop-recovery.md#tauri-前置条件",
    );
    expect(report.summary.fail).toBe(6);
    expect(doctorExitCode(report)).toBe(1);
  });

  test("Node 22.12 以下版本会因 Oxlint 引擎约束失败", async () => {
    const report = await diagnoseRepository({
      repositoryRoot,
      probes: fixture({
        commands: {
          "node --version": successful("v22.11.0"),
        },
      }),
    });
    const checks = checksById(report);

    expect(checks.node).toMatchObject({ status: "fail" });
    expect(checks.node.detail).toContain("v22.11.0");
    expect(checks.node.next).toContain("Node 22.12");
    expect(doctorExitCode(report)).toBe(1);
  });

  test("非正式平台、端口占用和缺少本地产物只警告", async () => {
    const report = await diagnoseRepository({
      repositoryRoot,
      probes: fixture({
        platform: "linux",
        occupiedPort: true,
        paths: healthyPaths.filter(
          (path) =>
            path !== "target/release/oh-my-pets" &&
            path !== "target/desktop-smoke/report.json",
        ),
      }),
    });
    const checks = checksById(report);

    expect(checks.platform).toMatchObject({ status: "warn" });
    expect(checks["tauri-prerequisites"]).toMatchObject({ status: "warn" });
    expect(checks["development-port"]).toMatchObject({ status: "warn" });
    expect(checks["development-port"].next).toContain(
      "desktop-recovery.md#开发端口占用",
    );
    expect(checks["build-output"]).toMatchObject({ status: "warn" });
    expect(checks["build-output"].next).toBe("pnpm build:desktop");
    expect(checks.diagnostics).toMatchObject({ status: "warn" });
    expect(checks.diagnostics.next).toContain("pnpm qa:desktop:auto");
    expect(report.summary).toEqual({ pass: 8, warn: 5, fail: 0 });
    expect(doctorExitCode(report)).toBe(0);
  });

  test("正式依赖或恢复入口缺失会失败且不执行修复", async () => {
    const report = await diagnoseRepository({
      repositoryRoot,
      probes: fixture({
        commands: {
          "pnpm exec tauri --version": {
            ok: false,
            stdout: "",
            stderr: "command not found",
          },
        },
        paths: healthyPaths.filter(
          (path) =>
            path !== "node_modules/.modules.yaml" &&
            path !== "Cargo.lock" &&
            path !== "docs/desktop-recovery.md",
        ),
      }),
    });
    const checks = checksById(report);

    expect(checks["tauri-cli"]).toMatchObject({ status: "fail" });
    expect(checks["tauri-cli"].next).toContain("先恢复 dependency-manifests");
    expect(checks["tauri-cli"].next).not.toContain("pnpm install");
    expect(checks["dependency-manifests"]).toMatchObject({ status: "fail" });
    expect(checks["dependency-manifests"].detail).toContain("Cargo.lock");
    expect(checks["dependency-manifests"].next).toContain("git status --short");
    expect(checks["dependency-manifests"].next).not.toContain("pnpm install");
    expect(checks["node-dependencies"]).toMatchObject({ status: "fail" });
    expect(checks["node-dependencies"].detail).toContain(
      "node_modules/.modules.yaml",
    );
    expect(checks["node-dependencies"].next).toContain(
      "先恢复 dependency-manifests",
    );
    expect(checks["node-dependencies"].next).not.toContain("pnpm install");
    expect(checks["recovery-guide"]).toMatchObject({ status: "fail" });
    expect(checks["recovery-guide"].next).toContain("docs/desktop-recovery.md");
    expect(report.readOnly).toBe(true);
  });

  test("依赖清单完整时才建议安装缺失的 Node 依赖", async () => {
    const report = await diagnoseRepository({
      repositoryRoot,
      probes: fixture({
        paths: healthyPaths.filter(
          (path) => path !== "node_modules/.modules.yaml",
        ),
      }),
    });
    const checks = checksById(report);

    expect(checks["dependency-manifests"]).toMatchObject({ status: "pass" });
    expect(checks["node-dependencies"]).toMatchObject({ status: "fail" });
    expect(checks["node-dependencies"].next).toContain(
      "pnpm install --frozen-lockfile",
    );
  });

  test("输出格式固定为 pass/warn/fail 摘要并保留恢复路由", () => {
    const output = formatDoctorReport({
      readOnly: true,
      recoveryGuide: "docs/desktop-recovery.md",
      checks: [
        {
          id: "platform",
          status: "pass",
          detail: "darwin",
        },
        {
          id: "development-port",
          status: "warn",
          detail: "127.0.0.1:1420 已占用",
          next: "docs/desktop-recovery.md#开发端口占用",
        },
        {
          id: "dependencies",
          status: "fail",
          detail: "缺少依赖",
          next: "pnpm install --frozen-lockfile",
        },
      ],
      summary: { pass: 1, warn: 1, fail: 1 },
    });

    expect(output).toBe(
      [
        "Oh My Pets doctor（只读）",
        "[PASS] platform: darwin",
        "[WARN] development-port: 127.0.0.1:1420 已占用",
        "       next: docs/desktop-recovery.md#开发端口占用",
        "[FAIL] dependencies: 缺少依赖",
        "       next: pnpm install --frozen-lockfile",
        "Summary: pass=1 warn=1 fail=1",
        "Recovery: docs/desktop-recovery.md",
      ].join("\n"),
    );
  });

  test("根命令和 Tauri 端口配置与 doctor 契约保持一致", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    );
    const tauriConfig = JSON.parse(
      await readFile(
        new URL("../../src-tauri/tauri.conf.json", import.meta.url),
        "utf8",
      ),
    );

    expect(packageJson.scripts["doctor:desktop"]).toBe(
      "node scripts/doctor.mjs",
    );
    expect(new URL(tauriConfig.build.devUrl).port).toBe(
      String(DEVELOPMENT_PORT),
    );
  });
});
