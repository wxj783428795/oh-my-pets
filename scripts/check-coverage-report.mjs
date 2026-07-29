#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateCoverageReport } from "./lib/coverage-contract.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const kind = process.argv[2];

try {
  const result = await validateCoverageReport({
    kind,
    repositoryRoot,
    async readJson(path) {
      return JSON.parse(await readFile(path, "utf8"));
    },
  });
  console.log(`覆盖率范围检查通过：${result.files} 个正式源码文件`);
  console.log(`范围清单：${result.report}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
