import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import net from "node:net";
import { resolve } from "node:path";

import { desktopExecutablePath } from "./desktop-qa.mjs";

export const DEVELOPMENT_PORT = 1420;
export const RECOVERY_GUIDE = "docs/desktop-recovery.md";

const MINIMUM_NODE_VERSION = Object.freeze([22, 12, 0]);
const MINIMUM_PNPM_MAJOR = 10;
const DEPENDENCY_MANIFEST_PATHS = Object.freeze([
  "package.json",
  "pnpm-lock.yaml",
  "Cargo.toml",
  "Cargo.lock",
  "src-tauri/Cargo.toml",
  "src/pet-domain/Cargo.toml",
]);
const NODE_DEPENDENCIES_PATH = "node_modules/.modules.yaml";

function commandOutput(result) {
  return result.stdout.trim() || result.stderr.trim();
}

function majorVersion(output) {
  const match = output.match(/\bv?(\d+)(?:\.\d+){1,2}\b/);
  return match ? Number(match[1]) : null;
}

function semanticVersion(output) {
  const match = output.match(/\bv?(\d+)\.(\d+)(?:\.(\d+))?\b/);
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
    : null;
}

function isVersionBefore(output, minimumVersion) {
  const currentVersion = semanticVersion(output);
  if (!currentVersion) {
    return true;
  }
  for (let index = 0; index < minimumVersion.length; index += 1) {
    if (currentVersion[index] !== minimumVersion[index]) {
      return currentVersion[index] < minimumVersion[index];
    }
  }
  return false;
}

function check(id, status, detail, next) {
  return next ? { id, status, detail, next } : { id, status, detail };
}

async function versionCheck({
  probes,
  repositoryRoot,
  id,
  command,
  args,
  label,
  minimumMajor,
  minimumVersion,
  next,
}) {
  const result = await probes.run(command, args, { cwd: repositoryRoot });
  const output = commandOutput(result);
  if (!result.ok) {
    return check(id, "fail", `${label} 不可用`, next);
  }
  if (
    (minimumMajor && majorVersion(output) < minimumMajor) ||
    (minimumVersion && isVersionBefore(output, minimumVersion))
  ) {
    return check(
      id,
      "fail",
      `${label} 版本过旧：${output || "无法识别版本"}`,
      next,
    );
  }
  return check(id, "pass", output || `${label} 可用`);
}

async function platformCheck(platform) {
  if (platform === "darwin" || platform === "win32") {
    return check("platform", "pass", platform);
  }
  return check(
    "platform",
    "warn",
    `${platform} 不在正式桌面目标平台内`,
    `${RECOVERY_GUIDE}#tauri-前置条件`,
  );
}

async function tauriPrerequisitesCheck({ probes, repositoryRoot, platform }) {
  if (platform === "darwin") {
    const result = await probes.run("xcode-select", ["-p"], {
      cwd: repositoryRoot,
    });
    if (!result.ok) {
      return check(
        "tauri-prerequisites",
        "fail",
        "未检测到 Xcode Command Line Tools",
        `${RECOVERY_GUIDE}#tauri-前置条件`,
      );
    }
    return check(
      "tauri-prerequisites",
      "pass",
      `Xcode 开发目录：${commandOutput(result)}`,
    );
  }
  if (platform === "win32") {
    return check(
      "tauri-prerequisites",
      "warn",
      "Windows 的 MSVC Build Tools 与 WebView2 需要按恢复文档人工确认",
      `${RECOVERY_GUIDE}#tauri-前置条件`,
    );
  }
  return check(
    "tauri-prerequisites",
    "warn",
    `不为 ${platform} 自动判定 Tauri 原生前置条件`,
    `${RECOVERY_GUIDE}#tauri-前置条件`,
  );
}

async function dependencyChecks({ probes, repositoryRoot }) {
  const missingManifests = [];
  for (const path of DEPENDENCY_MANIFEST_PATHS) {
    if (!(await probes.pathExists(resolve(repositoryRoot, path)))) {
      missingManifests.push(path);
    }
  }
  const nodeDependenciesExist = await probes.pathExists(
    resolve(repositoryRoot, NODE_DEPENDENCIES_PATH),
  );

  return [
    missingManifests.length > 0
      ? check(
          "dependency-manifests",
          "fail",
          `缺少受版本控制的依赖清单：${missingManifests.join(", ")}`,
          `git status --short；保留本地编辑并按 ${RECOVERY_GUIDE}#依赖缺失 恢复受控文件`,
        )
      : check(
          "dependency-manifests",
          "pass",
          "pnpm 与 Cargo 受控依赖清单可定位",
        ),
    nodeDependenciesExist
      ? check(
          "node-dependencies",
          "pass",
          `pnpm 安装状态可定位：${NODE_DEPENDENCIES_PATH}`,
        )
      : check(
          "node-dependencies",
          "fail",
          `缺少 pnpm 安装状态：${NODE_DEPENDENCIES_PATH}`,
          missingManifests.length > 0
            ? "先恢复 dependency-manifests，再重新运行 pnpm doctor:desktop"
            : `pnpm install --frozen-lockfile；详见 ${RECOVERY_GUIDE}#依赖缺失`,
        ),
  ];
}

async function repositoryPathChecks({ probes, repositoryRoot, platform }) {
  const recoveryPath = resolve(repositoryRoot, RECOVERY_GUIDE);
  const recoveryExists = await probes.pathExists(recoveryPath);
  const buildPath = desktopExecutablePath({
    repositoryRoot,
    platform,
    manualMode: false,
  });
  const buildExists = await probes.pathExists(buildPath);
  const diagnosticsPath = resolve(
    repositoryRoot,
    "target",
    "desktop-smoke",
    "report.json",
  );
  const diagnosticsExists = await probes.pathExists(diagnosticsPath);

  return [
    recoveryExists
      ? check("recovery-guide", "pass", RECOVERY_GUIDE)
      : check(
          "recovery-guide",
          "fail",
          `缺少恢复入口：${RECOVERY_GUIDE}`,
          `恢复 ${RECOVERY_GUIDE} 后重新运行 pnpm doctor:desktop`,
        ),
    buildExists
      ? check("build-output", "pass", buildPath)
      : check(
          "build-output",
          "warn",
          `尚无桌面构建产物：${buildPath}`,
          "pnpm build:desktop",
        ),
    diagnosticsExists
      ? check("diagnostics", "pass", diagnosticsPath)
      : check(
          "diagnostics",
          "warn",
          `尚无自动桌面诊断索引：${diagnosticsPath}`,
          `pnpm qa:desktop:auto；详见 ${RECOVERY_GUIDE}#日志与诊断`,
        ),
  ];
}

function summarize(checks) {
  return checks.reduce(
    (summary, item) => {
      summary[item.status] += 1;
      return summary;
    },
    { pass: 0, warn: 0, fail: 0 },
  );
}

export async function diagnoseRepository({ repositoryRoot, probes }) {
  const platform = probes.platform;
  const dependencyResults = await dependencyChecks({ probes, repositoryRoot });
  const dependencyManifestsAvailable = dependencyResults[0].status === "pass";
  const checks = [
    await platformCheck(platform),
    await versionCheck({
      probes,
      repositoryRoot,
      id: "node",
      command: "node",
      args: ["--version"],
      label: "Node",
      minimumVersion: MINIMUM_NODE_VERSION,
      next: `安装 Node 22.12 或更高版本；详见 ${RECOVERY_GUIDE}#依赖缺失`,
    }),
    await versionCheck({
      probes,
      repositoryRoot,
      id: "pnpm",
      command: "pnpm",
      args: ["--version"],
      label: "pnpm",
      minimumMajor: MINIMUM_PNPM_MAJOR,
      next: `corepack enable pnpm；详见 ${RECOVERY_GUIDE}#依赖缺失`,
    }),
    await versionCheck({
      probes,
      repositoryRoot,
      id: "rustc",
      command: "rustc",
      args: ["--version"],
      label: "rustc",
      next: `${RECOVERY_GUIDE}#tauri-前置条件`,
    }),
    await versionCheck({
      probes,
      repositoryRoot,
      id: "cargo",
      command: "cargo",
      args: ["--version"],
      label: "Cargo",
      next: `${RECOVERY_GUIDE}#tauri-前置条件`,
    }),
    await versionCheck({
      probes,
      repositoryRoot,
      id: "tauri-cli",
      command: "pnpm",
      args: ["exec", "tauri", "--version"],
      label: "Tauri CLI",
      next: dependencyManifestsAvailable
        ? `pnpm install --frozen-lockfile；详见 ${RECOVERY_GUIDE}#依赖缺失`
        : "先恢复 dependency-manifests，再重新运行 pnpm doctor:desktop",
    }),
    await tauriPrerequisitesCheck({ probes, repositoryRoot, platform }),
  ];

  const host = "127.0.0.1";
  const occupied = await probes.isPortOccupied(host, DEVELOPMENT_PORT);
  checks.push(
    occupied
      ? check(
          "development-port",
          "warn",
          `${host}:${DEVELOPMENT_PORT} 已占用`,
          `${RECOVERY_GUIDE}#开发端口占用`,
        )
      : check("development-port", "pass", `${host}:${DEVELOPMENT_PORT} 可用`),
  );
  checks.push(...dependencyResults);
  checks.push(
    ...(await repositoryPathChecks({ probes, repositoryRoot, platform })),
  );

  return {
    readOnly: true,
    recoveryGuide: RECOVERY_GUIDE,
    checks,
    summary: summarize(checks),
  };
}

export function formatDoctorReport(report) {
  const lines = ["Oh My Pets doctor（只读）"];
  for (const item of report.checks) {
    lines.push(`[${item.status.toUpperCase()}] ${item.id}: ${item.detail}`);
    if (item.next) {
      lines.push(`       next: ${item.next}`);
    }
  }
  lines.push(
    `Summary: pass=${report.summary.pass} warn=${report.summary.warn} fail=${report.summary.fail}`,
  );
  lines.push(`Recovery: ${report.recoveryGuide}`);
  return lines.join("\n");
}

export function doctorExitCode(report) {
  return report.summary.fail > 0 ? 1 : 0;
}

export function createSystemProbes(platform = process.platform) {
  return {
    platform,
    async run(command, args, options = {}) {
      return await new Promise((complete) => {
        execFile(
          command,
          args,
          {
            cwd: options.cwd,
            encoding: "utf8",
            timeout: 5_000,
            windowsHide: true,
          },
          (error, stdout, stderr) => {
            complete({
              ok: !error,
              stdout: stdout ?? "",
              stderr: stderr || error?.message || "",
            });
          },
        );
      });
    },
    async pathExists(path) {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },
    async isPortOccupied(host, port) {
      return await new Promise((complete) => {
        const socket = net.createConnection({ host, port });
        let settled = false;
        const finish = (occupied) => {
          if (settled) {
            return;
          }
          settled = true;
          socket.destroy();
          complete(occupied);
        };
        socket.setTimeout(500);
        socket.once("connect", () => finish(true));
        socket.once("timeout", () => finish(false));
        socket.once("error", () => finish(false));
      });
    },
  };
}
