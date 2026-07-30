import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const keyCount = 100;

async function waitForFile(path, process, description) {
  const deadline = Date.now() + 10_000;
  while (!existsSync(path)) {
    if (process.exitCode !== null || process.signalCode !== null) {
      throw new Error(`${description}提前退出`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`等待${description}超时`);
    }
    await delay(10);
  }
}

export async function frontmostApplicationPid() {
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

async function injectKeys() {
  const script = `
    tell application "System Events"
      repeat ${keyCount} times
        keystroke "x"
        delay 0.02
      end repeat
    end tell
  `;
  await execFileAsync("osascript", ["-e", script]);
}

async function compileProbe({ repositoryRoot, outputDir }) {
  const sourcePath = resolve(
    repositoryRoot,
    "scripts",
    "macos-focus-probe.swift",
  );
  const executablePath = resolve(outputDir, "macos-focus-probe");
  await execFileAsync("xcrun", [
    "swiftc",
    sourcePath,
    "-framework",
    "AppKit",
    "-o",
    executablePath,
  ]);
  return executablePath;
}

async function collectEvidence({
  probe,
  readyPath,
  resultPath,
  beforePid,
  appPid,
}) {
  const observedPids = [];
  try {
    const typing = injectKeys();
    for (const waitMs of [100, 100]) {
      await delay(waitMs);
      observedPids.push(await frontmostApplicationPid());
    }
    await typing;
    await waitForFile(resultPath, probe, "焦点探针");
    const typedCount = Number.parseInt(readFileSync(resultPath, "utf8"), 10);
    if (!Number.isInteger(typedCount)) {
      throw new Error("焦点探针没有返回有效的按键数量");
    }
    return {
      beforePid,
      appPid,
      observedPids,
      typedCount,
      minimumTypedCount: keyCount,
    };
  } finally {
    if (probe.exitCode === null && probe.signalCode === null) {
      probe.kill();
    }
    rmSync(readyPath, { force: true });
    rmSync(resultPath, { force: true });
  }
}

export async function startMacosStartupFocusProbe({
  repositoryRoot,
  targetPath,
  targetEnvironment = {},
}) {
  if (process.platform !== "darwin") {
    throw new Error("启动焦点连续输入探针仅支持 macOS");
  }

  const outputDir = resolve(repositoryRoot, "target", "desktop-smoke");
  await mkdir(outputDir, { recursive: true });
  const readyPath = resolve(outputDir, "focus-probe-ready");
  const resultPath = resolve(outputDir, "focus-probe-result");
  rmSync(readyPath, { force: true });
  rmSync(resultPath, { force: true });

  const probePath = await compileProbe({ repositoryRoot, outputDir });
  const probe = spawn(probePath, [readyPath, resultPath], {
    cwd: repositoryRoot,
    stdio: "ignore",
  });
  await waitForFile(readyPath, probe, "焦点探针");
  const beforePid = await frontmostApplicationPid();
  if (beforePid !== probe.pid) {
    probe.kill();
    throw new Error(
      `焦点探针未成为前台应用：expected=${probe.pid}, actual=${beforePid}`,
    );
  }

  const target = targetPath
    ? spawn(targetPath, [], {
        cwd: repositoryRoot,
        env: { ...process.env, ...targetEnvironment },
        stdio: "inherit",
      })
    : null;
  const evidence = collectEvidence({
    probe,
    readyPath,
    resultPath,
    beforePid,
    appPid: target?.pid ?? null,
  });
  return { evidence, target };
}
