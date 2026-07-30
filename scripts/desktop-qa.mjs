#!/usr/bin/env node

import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import {
  DESKTOP_QA_SOURCE_PATHS,
  desktopExecutablePath,
  MANUAL_DESKTOP_CHECKS,
  manualQaPassed,
  manualQaPlatformError,
  startupFocusPreserved,
  validateDesktopSmokeReport,
  waitForCleanExit,
} from "./lib/desktop-qa.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const outputDir = resolve(repositoryRoot, "target", "desktop-smoke");
const automaticReportPath = resolve(outputDir, "report.json");
const manualReportPath = resolve(outputDir, "manual-qa.json");
const manualMode = process.argv.includes("--manual");
const binaryPath = desktopExecutablePath({
  repositoryRoot,
  platform: process.platform,
  manualMode,
});
const execFileAsync = promisify(execFile);

function desktopSourceFingerprint() {
  const listedPaths = execFileSync(
    "git",
    [
      "ls-files",
      "-co",
      "--exclude-standard",
      "-z",
      "--",
      ...DESKTOP_QA_SOURCE_PATHS,
    ],
    {
      cwd: repositoryRoot,
      encoding: "buffer",
    },
  )
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const hash = createHash("sha256");
  for (const relativePath of [...new Set(listedPaths)].sort()) {
    hash.update(relativePath);
    hash.update("\0");
    const absolutePath = resolve(repositoryRoot, relativePath);
    if (existsSync(absolutePath)) {
      hash.update(readFileSync(absolutePath));
    } else {
      hash.update("<deleted>");
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function frontmostApplicationPid() {
  const { stdout } = await execFileAsync("osascript", [
    "-e",
    'tell application "System Events" to get unix id of first application process whose frontmost is true',
  ]);
  const pid = Number.parseInt(stdout.trim(), 10);
  if (!Number.isInteger(pid)) {
    throw new Error(`无法识别当前前台应用进程：${stdout.trim()}`);
  }
  return pid;
}

async function observeStartupFocus(beforePid, appPid) {
  const observedPids = [];
  for (const waitMs of [100, 100]) {
    await delay(waitMs);
    observedPids.push(await frontmostApplicationPid());
  }
  return {
    beforePid,
    appPid,
    observedPids,
    preserved: startupFocusPreserved({
      beforePid,
      appPid,
      observedPids,
    }),
  };
}

function waitForProcess(child) {
  return new Promise((resolveProcess, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("桌面 smoke 超过 30 秒未结束"));
    }, 30_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolveProcess();
      } else {
        reject(
          new Error(
            `桌面 smoke 异常退出：code=${String(code)}, signal=${String(signal)}`,
          ),
        );
      }
    });
  });
}

async function runProcess(environment) {
  const beforePid = await frontmostApplicationPid();
  const child = spawn(binaryPath, [], {
    cwd: repositoryRoot,
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });
  const completion = waitForProcess(child);
  const startupFocus = await observeStartupFocus(beforePid, child.pid);
  await completion;
  return startupFocus;
}

async function runAutomaticQa() {
  if (!existsSync(binaryPath)) {
    throw new Error(`未找到真实 Tauri 构建产物：${binaryPath}`);
  }
  await mkdir(outputDir, { recursive: true });
  rmSync(automaticReportPath, { force: true });
  const sourceFingerprint = desktopSourceFingerprint();
  const startupFocus = await runProcess({
    OH_MY_PETS_DESKTOP_SMOKE_REPORT: automaticReportPath,
  });
  if (!existsSync(automaticReportPath)) {
    throw new Error("Tauri 应用未生成桌面 smoke 报告");
  }

  const report = JSON.parse(readFileSync(automaticReportPath, "utf8"));
  report.startupFocus = startupFocus;
  report.sourceFingerprint = sourceFingerprint;
  writeFileSync(automaticReportPath, `${JSON.stringify(report, null, 2)}\n`);
  const errors = validateDesktopSmokeReport(report);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  for (const check of report.checks) {
    console.log(`自动通过 ${check.name}: ${check.detail}`);
  }
  console.log(`自动化报告：${automaticReportPath}`);
  return report;
}

function readAutomaticQaReport() {
  if (!existsSync(automaticReportPath)) {
    throw new Error(
      "未找到当前桌面自动 smoke 报告；请先运行 pnpm qa:desktop:auto，再运行 pnpm qa:desktop。",
    );
  }
  const report = JSON.parse(readFileSync(automaticReportPath, "utf8"));
  const errors = validateDesktopSmokeReport(report, {
    expectedSourceFingerprint: desktopSourceFingerprint(),
  });
  if (errors.length > 0) {
    throw new Error(
      `现有桌面自动 smoke 报告无效；请先重新运行 pnpm qa:desktop:auto。\n${errors.join("\n")}`,
    );
  }
  console.log(`复用已通过的自动化报告：${automaticReportPath}`);
  return report;
}

function appIsRunning(app) {
  return app.exitCode === null && app.signalCode === null;
}

async function runManualQa(automaticReport) {
  const platformError = manualQaPlatformError(process.platform);
  if (platformError) {
    throw new Error(platformError);
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "真实 macOS 桌面人工 QA 需要交互式终端；请由验收人运行 pnpm qa:desktop。",
    );
  }

  const beforePid = await frontmostApplicationPid();
  const app = spawn(binaryPath, [], {
    cwd: repositoryRoot,
    detached: false,
    stdio: "ignore",
  });
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const results = [];
  let appStayedRunningUntilExitCheck = true;
  let appExitedCleanly = false;
  try {
    const startupFocus = await observeStartupFocus(beforePid, app.pid);
    if (!startupFocus.preserved) {
      throw new Error(
        `人工 QA 应用启动时抢走了前台焦点：应用 PID=${startupFocus.appPid}，观测=${startupFocus.observedPids.join(",")}`,
      );
    }
    await new Promise((resolveStart, rejectStart) => {
      let settled = false;
      const rejectBeforeStart = (error) => {
        if (!settled) {
          settled = true;
          rejectStart(error);
        }
      };
      app.once("error", rejectBeforeStart);
      app.once("exit", (code, signal) => {
        rejectBeforeStart(
          new Error(
            `人工 QA 应用启动后提前退出：code=${String(code)}, signal=${String(signal)}`,
          ),
        );
      });
      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolveStart();
        }
      }, 1_000);
    });
    console.log("\n应用已启动。请在真实 macOS 桌面逐项操作：");
    const experienceItems = MANUAL_DESKTOP_CHECKS.slice(0, -1);
    const exitItem = MANUAL_DESKTOP_CHECKS.at(-1);
    for (const item of experienceItems) {
      if (!appIsRunning(app)) {
        appStayedRunningUntilExitCheck = false;
        results.push({ item, passed: false });
        continue;
      }
      const answer = await readline.question(`${item}\n通过？[y/N] `);
      results.push({ item, passed: /^y(?:es)?$/i.test(answer.trim()) });
      appStayedRunningUntilExitCheck &&= appIsRunning(app);
    }
    if (exitItem && appStayedRunningUntilExitCheck && appIsRunning(app)) {
      const answer = await readline.question(`${exitItem}\n通过？[y/N] `);
      const passed = /^y(?:es)?$/i.test(answer.trim());
      results.push({ item: exitItem, passed });
      if (passed) {
        appExitedCleanly = await waitForCleanExit(app);
      }
    } else if (exitItem) {
      results.push({ item: exitItem, passed: false });
    }
  } finally {
    readline.close();
    if (app.exitCode === null) {
      app.kill();
    }
  }

  const report = {
    schemaVersion: 1,
    performedAt: new Date().toISOString(),
    platform: process.platform,
    automaticReport: automaticReportPath,
    sourceFingerprint: automaticReport.sourceFingerprint,
    diagnosticPath:
      automaticReport.checks.find(({ name }) => name === "diagnostics_export")
        ?.detail ?? null,
    appStayedRunningUntilExitCheck,
    appExitedCleanly,
    passed: manualQaPassed(
      results,
      appStayedRunningUntilExitCheck,
      appExitedCleanly,
    ),
    checks: results,
  };
  writeFileSync(manualReportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`人工 QA 报告：${manualReportPath}`);
  if (!report.passed) {
    throw new Error("人工 QA 未全部通过，不得关闭 ticket");
  }
}

try {
  if (manualMode) {
    const automaticReport = readAutomaticQaReport();
    await runManualQa(automaticReport);
  } else {
    await runAutomaticQa();
    console.log(
      "自动化 smoke 已通过；真实菜单栏点击、视觉显示和点击穿透体验仍需运行 pnpm qa:desktop 由人工确认。",
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
