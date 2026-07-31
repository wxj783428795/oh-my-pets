import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const contract = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "..", "desktop-smoke-contract.json"),
    "utf8",
  ),
);
const minimumFocusPidSamples = 10;

export const AUTOMATED_DESKTOP_CHECKS = Object.freeze(contract.automatedChecks);
export const MANUAL_DESKTOP_CHECKS = Object.freeze(contract.manualItems);
export const DESKTOP_QA_SOURCE_PATHS = Object.freeze([
  "src",
  "src-tauri",
  "assets",
  "scripts",
  "index.html",
  "package.json",
  "pnpm-lock.yaml",
  "Cargo.toml",
  "Cargo.lock",
  ".node-version",
  "rust-toolchain.toml",
  "vite.config.ts",
  "playwright.config.ts",
  "tsconfig.json",
]);

export function startupFocusPreserved({
  beforePid,
  appPid,
  observedPids,
  typedCount,
  minimumTypedCount,
}) {
  return (
    Number.isInteger(beforePid) &&
    Number.isInteger(appPid) &&
    beforePid !== appPid &&
    Array.isArray(observedPids) &&
    observedPids.length >= minimumFocusPidSamples &&
    observedPids.every((pid) => Number.isInteger(pid) && pid === beforePid) &&
    Number.isInteger(typedCount) &&
    Number.isInteger(minimumTypedCount) &&
    minimumTypedCount > 0 &&
    typedCount >= minimumTypedCount
  );
}

function processIsRunning(process) {
  return process.exitCode === null && process.signalCode === null;
}

export async function finishProbedProcess({
  evidence,
  target,
  completion,
}) {
  try {
    const startupFocus = await evidence;
    startupFocus.preserved = startupFocusPreserved(startupFocus);
    await completion;
    return startupFocus;
  } catch (error) {
    if (processIsRunning(target)) {
      target.kill();
    }
    await Promise.resolve(completion).catch(() => {});
    throw error;
  } finally {
    if (processIsRunning(target)) {
      target.kill();
    }
  }
}

export function desktopExecutablePath({
  repositoryRoot,
  platform,
  manualMode,
}) {
  if (platform === "darwin" && manualMode) {
    return resolve(
      repositoryRoot,
      "target",
      "release",
      "bundle",
      "macos",
      "Oh My Pets.app",
      "Contents",
      "MacOS",
      "oh-my-pets",
    );
  }
  const binaryName = platform === "win32" ? "oh-my-pets.exe" : "oh-my-pets";
  return resolve(repositoryRoot, "target", "release", binaryName);
}

export function validateDesktopSmokeReport(
  report,
  { expectedSourceFingerprint } = {},
) {
  const errors = [];
  if (!report || typeof report !== "object") {
    return ["桌面 smoke 报告必须是 JSON 对象"];
  }
  if (report.schemaVersion !== contract.schemaVersion) {
    errors.push(`schemaVersion 必须是 ${contract.schemaVersion}`);
  }
  if (report.passed !== true) {
    errors.push("报告 passed 必须是 true");
  }

  const checks = Array.isArray(report.checks) ? report.checks : [];
  for (const name of AUTOMATED_DESKTOP_CHECKS) {
    const check = checks.find((candidate) => candidate?.name === name);
    if (!check) {
      errors.push(`缺少自动化检查: ${name}`);
    } else if (check.status !== "passed") {
      errors.push(`自动化检查未通过: ${name}`);
    }
  }

  if (report.manualQaRequired !== true) {
    errors.push("报告必须明确 manualQaRequired=true");
  }
  if (!Array.isArray(report.manualItems) || report.manualItems.length === 0) {
    errors.push("报告必须列出真实 macOS 桌面人工 QA 项");
  }
  if (
    report.startupFocus?.preserved !== true ||
    !startupFocusPreserved(report.startupFocus)
  ) {
    errors.push("报告必须包含未抢焦点的真实启动证据");
  }
  if (
    typeof report.sourceFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(report.sourceFingerprint)
  ) {
    errors.push("报告必须包含桌面源码指纹");
  } else if (
    expectedSourceFingerprint !== undefined &&
    report.sourceFingerprint !== expectedSourceFingerprint
  ) {
    errors.push("自动 smoke 报告与当前桌面源码不匹配");
  }
  return errors;
}

export function manualQaPlatformError(platform) {
  return platform === "darwin"
    ? null
    : `真实桌面人工 QA 仅支持 macOS（darwin），当前平台为 ${platform}`;
}

export async function waitForCleanExit(app, timeoutMs = 5_000) {
  const currentExitIsClean = () =>
    app.exitCode === 0 && app.signalCode === null;
  let onExit;
  const exited = new Promise((resolveExit) => {
    onExit = (code, signal) => resolveExit(code === 0 && signal === null);
    app.once("exit", onExit);
  });
  if (app.exitCode !== null || app.signalCode !== null) {
    app.off("exit", onExit);
    return currentExitIsClean();
  }

  let timeout;
  const timedOut = new Promise((resolveTimeout) => {
    timeout = setTimeout(() => resolveTimeout(null), timeoutMs);
  });
  const clean = await Promise.race([exited, timedOut]);
  clearTimeout(timeout);
  app.off("exit", onExit);
  return clean ?? currentExitIsClean();
}

export function manualQaPassed(
  results,
  appStayedRunningUntilExitCheck,
  appExitedCleanly,
) {
  return (
    appStayedRunningUntilExitCheck === true &&
    appExitedCleanly === true &&
    results.length > 0 &&
    results.every(({ passed }) => passed === true)
  );
}
