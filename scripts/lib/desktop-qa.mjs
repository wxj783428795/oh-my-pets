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
  firstResponderPreserved,
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
    typedCount >= minimumTypedCount &&
    firstResponderPreserved === true
  );
}

function processIsRunning(process) {
  return process.exitCode === null && process.signalCode === null;
}

function monitorTargetProcess(target) {
  if (typeof target.once !== "function" || typeof target.off !== "function") {
    return {
      failure: new Promise(() => {}),
      dispose() {},
    };
  }

  let rejectFailure;
  const failure = new Promise((_, reject) => {
    rejectFailure = reject;
  });
  const onExit = (code, signal) => {
    rejectFailure(
      new Error(
        `真实桌面应用在焦点取证完成前提前退出：code=${String(code)}, signal=${String(signal)}`,
      ),
    );
  };
  const onError = (error) => {
    rejectFailure(
      new Error(`真实桌面应用在焦点取证期间发生错误：${error.message}`, {
        cause: error,
      }),
    );
  };
  target.once("exit", onExit);
  target.once("error", onError);
  if (!processIsRunning(target)) {
    queueMicrotask(() => onExit(target.exitCode, target.signalCode));
  }

  return {
    failure,
    dispose() {
      target.off("exit", onExit);
      target.off("error", onError);
    },
  };
}

async function terminateTargetProcess(target, timeoutMs = 5_000) {
  if (!processIsRunning(target)) {
    return;
  }
  if (typeof target.once !== "function" || typeof target.off !== "function") {
    target.kill();
    return;
  }

  await new Promise((resolveTermination, rejectTermination) => {
    let settled = false;
    let timeout;
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      target.off("exit", onExit);
      target.off("error", onError);
      callback(value);
    };
    const onExit = () => finish(resolveTermination);
    const onError = (error) => finish(rejectTermination, error);
    target.once("exit", onExit);
    target.once("error", onError);
    if (!processIsRunning(target)) {
      finish(resolveTermination);
      return;
    }
    try {
      const signalled = target.kill();
      if (!processIsRunning(target)) {
        finish(resolveTermination);
      } else if (signalled === false) {
        finish(
          rejectTermination,
          new Error("无法终止启动焦点探针的真实桌面应用进程"),
        );
      } else {
        timeout = setTimeout(
          () =>
            finish(
              rejectTermination,
              new Error("启动焦点探针的真实桌面应用进程未及时退出"),
            ),
          timeoutMs,
        );
      }
    } catch (error) {
      finish(rejectTermination, error);
    }
  });
}

export async function finishProbedProcess({
  evidence,
  target,
}) {
  const targetProcess = monitorTargetProcess(target);
  let startupFocus;
  let operationError;
  try {
    startupFocus = await Promise.race([
      evidence,
      targetProcess.failure,
    ]);
    if (!processIsRunning(target)) {
      throw new Error("真实桌面应用在焦点取证完成前提前退出");
    }
    startupFocus.preserved = startupFocusPreserved(startupFocus);
  } catch (error) {
    operationError = error;
  }
  targetProcess.dispose();
  try {
    await terminateTargetProcess(target);
  } catch (cleanupError) {
    if (operationError === undefined) {
      operationError = cleanupError;
    }
  }
  if (operationError !== undefined) {
    throw operationError;
  }
  return startupFocus;
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
