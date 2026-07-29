import { execFile } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARCHITECTURE_REPORT_PATH,
  analyzeArchitecture,
  formatArchitectureSummary,
  isFormalSourcePath,
} from "./lib/architecture.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const reportPath = resolve(repositoryRoot, ARCHITECTURE_REPORT_PATH);
const temporaryReportPath = `${reportPath}.tmp`;
const oxlintCli = resolve(
  repositoryRoot,
  "node_modules",
  "oxlint",
  "bin",
  "oxlint",
);
const sourceRoots = [
  "scripts",
  "src/pet-domain/src",
  "src-tauri/src",
  "src/ui",
];
const sourceFilesAtRoot = [
  "playwright.config.ts",
  "src-tauri/build.rs",
  "vite.config.ts",
];

function run(command, args) {
  return new Promise((complete) => {
    execFile(
      command,
      args,
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        complete({
          status: error ? (Number.isInteger(error.code) ? error.code : 1) : 0,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          output: [stdout, stderr].filter(Boolean).join("\n").trim(),
        });
      },
    );
  });
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function discoverSourceFiles() {
  const candidates = [
    ...sourceFilesAtRoot.map((path) => resolve(repositoryRoot, path)),
  ];
  for (const root of sourceRoots) {
    candidates.push(...(await listFiles(resolve(repositoryRoot, root))));
  }
  const paths = candidates
    .map((path) => relative(repositoryRoot, path).replaceAll("\\", "/"))
    .filter(isFormalSourcePath)
    .sort();
  return await Promise.all(
    paths.map(async (path) => ({
      path,
      source: await readFile(resolve(repositoryRoot, path), "utf8"),
    })),
  );
}

function versionFrom(output) {
  return output.match(/\b\d+\.\d+\.\d+\b/)?.[0] ?? "unknown";
}

async function runOxlint(webPaths) {
  const versionResult = await run(process.execPath, [oxlintCli, "--version"]);
  if (versionResult.status !== 0) {
    return { name: "oxlint", version: "unknown", ...versionResult };
  }
  const result = await run(process.execPath, [oxlintCli, ...webPaths]);
  return {
    name: "oxlint",
    version: versionFrom(versionResult.output),
    ...result,
  };
}

async function runClippy() {
  const versionResult = await run("cargo", ["clippy", "--version"]);
  if (versionResult.status !== 0) {
    return { name: "clippy", version: "unknown", ...versionResult };
  }
  const result = await run("cargo", [
    "clippy",
    "--workspace",
    "--lib",
    "--bins",
    "--",
    "-D",
    "warnings",
    "-D",
    "clippy::cognitive_complexity",
  ]);
  return {
    name: "clippy",
    version: versionFrom(versionResult.output),
    ...result,
  };
}

async function loadCargoMetadata() {
  const result = await run("cargo", [
    "metadata",
    "--format-version=1",
    "--no-deps",
  ]);
  if (result.status !== 0) {
    throw new Error(`Cargo metadata 分析失败：${result.output}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Cargo metadata 分析失败：${error.message}`, {
      cause: error,
    });
  }
}

try {
  await mkdir(dirname(reportPath), { recursive: true });
  await Promise.all([
    rm(reportPath, { force: true }),
    rm(temporaryReportPath, { force: true }),
  ]);
  const sourceFiles = await discoverSourceFiles();
  const webPaths = sourceFiles
    .map(({ path }) => path)
    .filter((path) =>
      [".mjs", ".ts", ".vue"].some((end) => path.endsWith(end)),
    );
  const [cargoMetadata, oxlint, clippy] = await Promise.all([
    loadCargoMetadata(),
    runOxlint(webPaths),
    runClippy(),
  ]);
  const report = analyzeArchitecture({
    repositoryRoot,
    sourceFiles,
    cargoMetadata,
    analyzerResults: [oxlint, clippy],
  });
  await writeFile(temporaryReportPath, `${JSON.stringify(report, null, 2)}\n`);
  await rename(temporaryReportPath, reportPath);
  console.log(formatArchitectureSummary(report));
} catch (error) {
  await rm(temporaryReportPath, { force: true }).catch(() => {});
  console.error(`架构检查失败：${error.message}`);
  process.exitCode = 1;
}
