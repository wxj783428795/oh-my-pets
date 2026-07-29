import { relative, resolve } from "node:path";

export const WEB_COVERAGE_INCLUDE = Object.freeze([
  "src/ui/**/*.{ts,vue}",
  "scripts/**/*.mjs",
]);
export const WEB_COVERAGE_EXCLUDE = Object.freeze([
  "**/*.test.{ts,mjs}",
  "**/*.d.ts",
]);
export const WEB_COVERAGE_REPORTERS = Object.freeze([
  "text",
  "json-summary",
  "html",
]);
export const WEB_COVERAGE_REPORTS_DIRECTORY = "target/coverage/web";
export const WEB_COVERAGE_SUMMARY_PATH = `${WEB_COVERAGE_REPORTS_DIRECTORY}/coverage-summary.json`;
export const RUST_COVERAGE_SUMMARY_PATH = "target/coverage/rust/summary.json";
export const RUST_COVERAGE_OUTPUT_DIRECTORY = "target/coverage/rust";
export const RUST_COVERAGE_HTML_INDEX = `${RUST_COVERAGE_OUTPUT_DIRECTORY}/html/index.html`;

function repositoryPath(filename, repositoryRoot) {
  return relative(repositoryRoot, resolve(repositoryRoot, filename)).replaceAll(
    "\\",
    "/",
  );
}

function isWebSource(path) {
  if (path.endsWith(".d.ts") || /\.test\.(?:ts|mjs)$/.test(path)) {
    return false;
  }
  return (
    /^src\/ui\/.+\.(?:ts|vue)$/.test(path) || /^scripts\/.+\.mjs$/.test(path)
  );
}

function isRustSource(path) {
  return (
    /^src\/pet-domain\/src\/.+\.rs$/.test(path) ||
    /^src-tauri\/src\/.+\.rs$/.test(path)
  );
}

function validatePaths(paths, repositoryRoot, label, predicate) {
  const normalized = paths.map((path) => repositoryPath(path, repositoryRoot));
  if (normalized.length === 0) {
    throw new Error(`${label}覆盖率报告没有正式源码`);
  }
  const unexpected = normalized.filter((path) => !predicate(path));
  if (unexpected.length > 0) {
    throw new Error(`${label}覆盖率包含非正式源码：${unexpected.join(", ")}`);
  }
  return { files: normalized.length };
}

export function validateWebCoverageSummary(summary, repositoryRoot) {
  return validatePaths(
    Object.keys(summary).filter((path) => path !== "total"),
    repositoryRoot,
    "Vitest ",
    isWebSource,
  );
}

export function validateRustCoverageSummary(summary, repositoryRoot) {
  const paths = (summary.data ?? []).flatMap((entry) =>
    (entry.files ?? []).map((file) => file.filename),
  );
  return validatePaths(paths, repositoryRoot, "Rust ", isRustSource);
}

export async function validateCoverageReport({
  kind,
  repositoryRoot,
  readJson,
}) {
  const contracts = {
    web: {
      path: WEB_COVERAGE_SUMMARY_PATH,
      validate: validateWebCoverageSummary,
    },
    rust: {
      path: RUST_COVERAGE_SUMMARY_PATH,
      validate: validateRustCoverageSummary,
    },
  };
  const contract = contracts[kind];
  if (!contract) {
    throw new Error(`未知覆盖率报告类型：${kind}`);
  }
  const result = contract.validate(
    await readJson(resolve(repositoryRoot, contract.path)),
    repositoryRoot,
  );
  return { ...result, report: contract.path };
}
