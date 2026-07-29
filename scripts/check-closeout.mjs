#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  readCloseoutCommitHash,
  validateCloseoutTicket,
} from "./lib/closeout.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const baseline = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "closeout-baseline.json"), "utf8"),
);
const baselineTickets = new Set(baseline.tickets);

function gitPathList(args) {
  const output = execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean);
}

function trackedAndUntrackedTickets() {
  const paths = [
    ...gitPathList(["ls-files", "-z", "--", ".scratch"]),
    ...gitPathList([
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      ".scratch",
    ]),
  ];
  return [...new Set(paths)].filter((path) =>
    /^\.scratch\/[^/]+\/issues\/[^/]+\.md$/.test(path),
  );
}

function commitExists(hash) {
  try {
    execFileSync("git", ["cat-file", "-e", `${hash}^{commit}`], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

const ticketFlag = process.argv.indexOf("--ticket");
const explicitTicket =
  ticketFlag === -1 ? null : (process.argv[ticketFlag + 1] ?? null);
if (ticketFlag !== -1 && !explicitTicket) {
  console.error("用法: pnpm closeout:check -- --ticket <ticket.md>");
  process.exit(2);
}

const tickets = explicitTicket
  ? [explicitTicket]
  : trackedAndUntrackedTickets();
const failures = [];
let checked = 0;
let grandfathered = 0;
let open = 0;

for (const ticket of tickets) {
  const absolutePath = resolve(repositoryRoot, ticket);
  const markdown = readFileSync(absolutePath, "utf8");
  const result = validateCloseoutTicket(markdown);
  const relativePath = absolutePath
    .slice(repositoryRoot.length + 1)
    .replaceAll("\\", "/");

  if (!explicitTicket && result.status !== "resolved") {
    open += 1;
    continue;
  }
  if (!explicitTicket && baselineTickets.has(relativePath)) {
    grandfathered += 1;
    continue;
  }

  checked += 1;
  const errors = [...result.errors];
  const hash = readCloseoutCommitHash(markdown);
  if (/^[0-9a-f]{7,40}$/i.test(hash) && !commitExists(hash)) {
    errors.push(`Commit Hash 在仓库中不存在: ${hash}`);
  }
  if (errors.length > 0) {
    failures.push({ ticket: relativePath, errors });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`关闭证据不完整: ${failure.ticket}`);
    for (const error of failure.errors) {
      console.error(`  - ${error}`);
    }
  }
  process.exit(1);
}

console.log(
  `关闭证据检查通过：校验 ${checked} 张，历史基线 ${grandfathered} 张，未关闭 ${open} 张。`,
);
