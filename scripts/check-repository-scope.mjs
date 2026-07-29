#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import {
  DEFAULT_HEAD_DIFF_ARGUMENTS,
  assertFormalChangeScope,
  classifyRepositoryPath,
  selectDefaultScopePaths,
} from "./lib/repository-scope.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const reportOnly = process.argv.includes("--report");
const baseFlag = process.argv.indexOf("--base");
const base = baseFlag === -1 ? null : (process.argv[baseFlag + 1] ?? null);
if (baseFlag !== -1 && !base) {
  console.error("用法: pnpm scope:check -- --base <git-revision>");
  process.exit(2);
}

function gitPathList(args) {
  const output = execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean);
}

const workspacePaths = [
  ...gitPathList(["diff", "--name-only", "-z"]),
  ...gitPathList(["diff", "--cached", "--name-only", "-z"]),
  ...gitPathList(["ls-files", "--others", "--exclude-standard", "-z"]),
];
let changedPaths;
if (base) {
  changedPaths = [
    ...new Set([
      ...workspacePaths,
      ...gitPathList(["diff", "--name-only", "-z", `${base}...HEAD`]),
    ]),
  ];
} else {
  const headPaths = gitPathList(DEFAULT_HEAD_DIFF_ARGUMENTS);
  changedPaths = selectDefaultScopePaths(workspacePaths, headPaths);
}

const counts = new Map();
for (const path of changedPaths) {
  const category = classifyRepositoryPath(path);
  counts.set(category, (counts.get(category) ?? 0) + 1);
}

const summary =
  [...counts].map(([category, count]) => `${category}=${count}`).join(", ") ||
  "无变更";
console.log(`变更范围：${summary}`);

const violations = assertFormalChangeScope(changedPaths);
if (violations.length > 0) {
  const prefix = reportOnly ? "辅助范围：" : "正式关闭检查拒绝辅助范围：";
  for (const violation of violations) {
    console[reportOnly ? "log" : "error"](`${prefix}${violation}`);
  }
  if (!reportOnly) {
    console.error(
      "请把样机、调研、外部参考或生成物从正式主线变更中分离；本命令不会删除或移动文件。",
    );
    process.exit(1);
  }
}
