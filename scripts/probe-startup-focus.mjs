#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { startMacosStartupFocusProbe } from "./lib/startup-focus-probe.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const binaryPath = resolve(
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
const preferencesPath = resolve(
  repositoryRoot,
  "target",
  "desktop-smoke",
  "focus-probe-preferences.json",
);
const baselineOnly = process.argv.includes("--baseline");

if (!baselineOnly && !existsSync(binaryPath)) {
  throw new Error(`缺少已构建的 QA 应用：${binaryPath}`);
}

const { evidence, target } = await startMacosStartupFocusProbe({
  repositoryRoot,
  targetPath: baselineOnly ? undefined : binaryPath,
  targetEnvironment: {
    OH_MY_PETS_QA_PREFERENCES_PATH: preferencesPath,
  },
});

try {
  const result = await evidence;
  const preserved =
    result.typedCount >= result.minimumTypedCount &&
    result.observedPids.every((pid) => pid === result.beforePid);
  console.log(JSON.stringify({ ...result, baselineOnly, preserved }, null, 2));
  if (!preserved) {
    process.exitCode = 1;
  }
} finally {
  if (target && target.exitCode === null && target.signalCode === null) {
    target.kill();
  }
}
