#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import {
  desktopExecutablePath,
  MANUAL_DESKTOP_CHECKS,
  manualQaPassed,
  manualQaPlatformError,
  validateDesktopSmokeReport,
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

async function runProcess(environment) {
  return await new Promise((resolveProcess, reject) => {
    const child = spawn(binaryPath, [], {
      cwd: repositoryRoot,
      env: { ...process.env, ...environment },
      stdio: "inherit",
    });
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

async function runAutomaticQa() {
  if (!existsSync(binaryPath)) {
    throw new Error(`未找到真实 Tauri 构建产物：${binaryPath}`);
  }
  await mkdir(outputDir, { recursive: true });
  rmSync(automaticReportPath, { force: true });
  await runProcess({
    OH_MY_PETS_DESKTOP_SMOKE_REPORT: automaticReportPath,
  });
  if (!existsSync(automaticReportPath)) {
    throw new Error("Tauri 应用未生成桌面 smoke 报告");
  }

  const report = JSON.parse(readFileSync(automaticReportPath, "utf8"));
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

function appIsRunning(app) {
  return app.exitCode === null && app.signalCode === null;
}

async function waitForCleanExit(app, timeoutMs = 5_000) {
  if (!appIsRunning(app)) {
    return app.exitCode === 0 && app.signalCode === null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const [code, signal] = await once(app, "exit", {
      signal: controller.signal,
    });
    return code === 0 && signal === null;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return false;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
  const automaticReport = await runAutomaticQa();
  if (manualMode) {
    await runManualQa(automaticReport);
  } else {
    console.log(
      "自动化 smoke 已通过；真实菜单栏点击、视觉显示和点击穿透体验仍需运行 pnpm qa:desktop 由人工确认。",
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
