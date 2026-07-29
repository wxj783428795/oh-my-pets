#!/usr/bin/env node

import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  RUST_COVERAGE_HTML_INDEX,
  validateCoverageReport,
} from "./lib/coverage-contract.mjs";
import { createCommandRunner, runRustCoverage } from "./lib/coverage-rust.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");

try {
  await mkdir(resolve(repositoryRoot, "target", "coverage", "rust"), {
    recursive: true,
  });
  await runRustCoverage({
    repositoryRoot,
    run: createCommandRunner(),
  });
  const result = await validateCoverageReport({
    kind: "rust",
    repositoryRoot,
    async readJson(path) {
      return JSON.parse(await readFile(path, "utf8"));
    },
  });
  console.log(`Rust 覆盖率范围检查通过：${result.files} 个正式源码文件`);
  console.log(`范围清单：${result.report}`);
  console.log(`HTML：${RUST_COVERAGE_HTML_INDEX}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
