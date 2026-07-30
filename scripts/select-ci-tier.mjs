#!/usr/bin/env node

import { execFileSync } from "node:child_process";

import { selectCiTier } from "./lib/ci-path-tier.mjs";

const eventName = process.env.GITHUB_EVENT_NAME ?? "";
const baseSha = process.env.CI_BASE_SHA ?? "";
const headSha = process.env.CI_HEAD_SHA ?? "";
let changedPaths = [];

if (eventName === "pull_request" && baseSha && headSha) {
  try {
    changedPaths = execFileSync(
      "git",
      [
        "diff",
        "--no-renames",
        "--name-only",
        "-z",
        `${baseSha}...${headSha}`,
        "--",
      ],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean);
  } catch (error) {
    console.error(`无法读取 Pull Request 变更路径，将执行完整验证：${error}`);
  }
}

const tier = selectCiTier({ eventName, changedPaths });
process.stdout.write(`tier=${tier}\n`);
