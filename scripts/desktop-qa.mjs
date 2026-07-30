#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";

import {
  DESKTOP_QA_SOURCE_PATHS,
  desktopExecutablePath,
  finishProbedProcess,
  MANUAL_DESKTOP_CHECKS,
  manualQaPassed,
  manualQaPlatformError,
  validateDesktopSmokeReport,
  waitForCleanExit,
} from "./lib/desktop-qa.mjs";
import {
  frontmostApplicationPid,
  startMacosStartupFocusProbe,
} from "./lib/startup-focus-probe.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const outputDir = resolve(repositoryRoot, "target", "desktop-smoke");
const automaticReportPath = resolve(outputDir, "report.json");
const manualReportPath = resolve(outputDir, "manual-qa.json");
const qaPreferencesPath = resolve(outputDir, "preferences.json");
const manualMode = process.argv.includes("--manual");
const binaryPath = desktopExecutablePath({
  repositoryRoot,
  platform: process.platform,
  manualMode,
});

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
    preserved:
      beforePid !== appPid && observedPids.every((pid) => pid === beforePid),
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
  const { evidence, target: child } = await startMacosStartupFocusProbe({
    repositoryRoot,
    targetPath: binaryPath,
    targetEnvironment: environment,
  });
  if (!child) {
    throw new Error("启动焦点探针没有创建桌面应用进程");
  }
  const completion = waitForProcess(child);
  return finishProbedProcess({
    evidence,
    target: child,
    completion,
  });
}

async function runAutomaticQa() {
  if (!existsSync(binaryPath)) {
    throw new Error(`未找到真实 Tauri 构建产物：${binaryPath}`);
  }
  await mkdir(outputDir, { recursive: true });
  rmSync(automaticReportPath, { force: true });
  rmSync(qaPreferencesPath, { force: true });
  const sourceFingerprint = desktopSourceFingerprint();
  const startupFocus = await runProcess({
    OH_MY_PETS_DESKTOP_SMOKE_REPORT: automaticReportPath,
    OH_MY_PETS_QA_PREFERENCES_PATH: qaPreferencesPath,
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

async function startManualApp() {
  const beforePid = await frontmostApplicationPid();
  const app = spawn(binaryPath, [], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      OH_MY_PETS_QA_PREFERENCES_PATH: qaPreferencesPath,
    },
    detached: false,
    stdio: "ignore",
  });
  const startupFocus = await observeStartupFocus(beforePid, app.pid);
  if (!startupFocus.preserved) {
    app.kill();
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
  return app;
}

async function stopForQaRestart(app) {
  if (!appIsRunning(app)) {
    throw new Error("人工 QA 应用在计划重启前已经退出");
  }
  app.kill();
  await waitForCleanExit(app);
  if (appIsRunning(app)) {
    throw new Error("人工 QA 应用未能在计划重启前结束");
  }
}

async function performManualExperienceItem(item, app, readline) {
  if (item.includes("在重启后保留")) {
    const ready = await readline.question(
      "请先把尺寸、活动频率改成非默认值，通过菜单召回宠物并记住其位置，再开启安静、隐藏和鼠标穿透；登录项保持你希望的最终状态。完成后输入 r，脚本将重启隔离测试应用。[r/N] ",
    );
    if (ready.trim().toLowerCase() !== "r") {
      return { app, passed: false };
    }
    await stopForQaRestart(app);
    app = await startManualApp();
  }

  if (item.includes("损坏或未知版本偏好")) {
    const validPreferences = existsSync(qaPreferencesPath)
      ? readFileSync(qaPreferencesPath)
      : null;
    await stopForQaRestart(app);
    writeFileSync(
      qaPreferencesPath,
      '{"version":99,"qaInjected":"unknown-version"}\n',
    );
    app = await startManualApp();
    const answer = await readline.question(`${item}\n通过？[y/N] `);
    const passed = /^y(?:es)?$/i.test(answer.trim());
    await stopForQaRestart(app);
    if (validPreferences) {
      writeFileSync(qaPreferencesPath, validPreferences);
    } else {
      rmSync(qaPreferencesPath, { force: true });
    }
    app = await startManualApp();
    return { app, passed };
  }

  const answer = await readline.question(`${item}\n通过？[y/N] `);
  return { app, passed: /^y(?:es)?$/i.test(answer.trim()) };
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

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const results = [];
  let appStayedRunningUntilExitCheck = true;
  let appExitedCleanly = false;
  let app;
  try {
    app = await startManualApp();
    console.log("\n应用已启动。请在真实 macOS 桌面逐项操作：");
    const experienceItems = MANUAL_DESKTOP_CHECKS.slice(0, -1);
    const exitItem = MANUAL_DESKTOP_CHECKS.at(-1);
    for (const item of experienceItems) {
      if (!appIsRunning(app)) {
        appStayedRunningUntilExitCheck = false;
        results.push({ item, passed: false });
        continue;
      }

      const itemResult = await performManualExperienceItem(item, app, readline);
      app = itemResult.app;
      results.push({ item, passed: itemResult.passed });
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
    if (app && app.exitCode === null) {
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
