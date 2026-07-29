import { extname, posix, relative } from "node:path";

export const ARCHITECTURE_REPORT_PATH =
  "target/quality/architecture/report.json";

const WEB_EXTENSIONS = Object.freeze([".ts", ".vue", ".mjs"]);
const RESOLVABLE_WEB_EXTENSIONS = Object.freeze([".ts", ".vue", ".mjs"]);
const RUST_DOMAIN_PACKAGE = "oh-my-pets-domain";
const RUST_SHELL_PACKAGE = "oh-my-pets";

function normalizedPath(path) {
  return path.replaceAll("\\", "/");
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isFormalSourcePath(path) {
  const normalized = normalizedPath(path);
  if (
    normalized.startsWith("/") ||
    normalized.includes("/../") ||
    normalized.startsWith("../") ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".test.mjs") ||
    normalized.endsWith(".spec.ts") ||
    normalized.endsWith(".spec.mjs") ||
    normalized.endsWith(".d.ts") ||
    normalized === "src/ui/browser-test-platform.ts"
  ) {
    return false;
  }

  if (
    normalized.startsWith("src/ui/") &&
    [".ts", ".vue"].includes(extname(normalized))
  ) {
    return true;
  }
  if (normalized.startsWith("scripts/") && extname(normalized) === ".mjs") {
    return true;
  }
  if (
    (normalized.startsWith("src/pet-domain/src/") ||
      normalized.startsWith("src-tauri/src/")) &&
    extname(normalized) === ".rs"
  ) {
    return true;
  }

  return [
    "src-tauri/build.rs",
    "vite.config.ts",
    "playwright.config.ts",
  ].includes(normalized);
}

function sourceLineCount(source) {
  if (!source) {
    return 0;
  }
  const lines = source.split(/\r?\n/);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines.length;
}

function hotspotGroup(loc) {
  if (loc >= 500) {
    return "large";
  }
  if (loc >= 200) {
    return "medium";
  }
  return "small";
}

function sourceArea(path) {
  if (path.startsWith("src/pet-domain/")) {
    return "domain";
  }
  if (path.startsWith("src-tauri/")) {
    return "desktop";
  }
  if (path.startsWith("src/ui/")) {
    return "web";
  }
  return "engineering";
}

function sourceLanguage(path) {
  const extension = extname(path);
  if (extension === ".rs") {
    return "rust";
  }
  if (extension === ".vue") {
    return "vue";
  }
  if (extension === ".ts") {
    return "typescript";
  }
  return "javascript";
}

function extractImportSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?[^"'`;]*?\s+from\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }
  return [...specifiers].sort(compareText);
}

function resolveInternalImport(importer, specifier, sourcePaths) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const base = posix.normalize(posix.join(posix.dirname(importer), specifier));
  const candidates = [
    base,
    ...RESOLVABLE_WEB_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...RESOLVABLE_WEB_EXTENSIONS.map((extension) =>
      posix.join(base, `index${extension}`),
    ),
  ];
  return candidates.find((candidate) => sourcePaths.has(candidate)) ?? null;
}

function canonicalCycle(cycle) {
  const nodes = cycle.slice(0, -1);
  const smallest = nodes.reduce(
    (best, node, index) => (node < nodes[best] ? index : best),
    0,
  );
  const rotated = [...nodes.slice(smallest), ...nodes.slice(0, smallest)];
  return [...rotated, rotated[0]];
}

function dependencyCycles(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node, []]));
  for (const { from, to } of edges) {
    adjacency.get(from)?.push(to);
  }
  for (const targets of adjacency.values()) {
    targets.sort(compareText);
  }

  const state = new Map();
  const stack = [];
  const cycles = new Map();
  const visit = (node) => {
    state.set(node, "visiting");
    stack.push(node);
    for (const target of adjacency.get(node) ?? []) {
      if (state.get(target) === "visiting") {
        const cycle = canonicalCycle([
          ...stack.slice(stack.indexOf(target)),
          target,
        ]);
        cycles.set(cycle.join(" -> "), cycle);
      } else if (!state.has(target)) {
        visit(target);
      }
    }
    stack.pop();
    state.set(node, "visited");
  };

  for (const node of [...nodes].sort(compareText)) {
    if (!state.has(node)) {
      visit(node);
    }
  }
  return [...cycles.values()].sort((left, right) =>
    compareText(left.join("\0"), right.join("\0")),
  );
}

function webDependencies(sourceFiles) {
  const webFiles = sourceFiles.filter(({ path }) =>
    WEB_EXTENSIONS.includes(extname(path)),
  );
  const sourcePaths = new Set(webFiles.map(({ path }) => path));
  const edges = [];
  const external = [];

  for (const file of webFiles) {
    for (const specifier of extractImportSpecifiers(file.source)) {
      const internal = resolveInternalImport(file.path, specifier, sourcePaths);
      if (internal) {
        edges.push({ from: file.path, to: internal });
      } else if (!specifier.startsWith(".")) {
        external.push({ from: file.path, specifier });
      }
    }
  }

  const compareEdge = (left, right) =>
    compareText(
      `${left.from}\0${left.to ?? left.specifier}`,
      `${right.from}\0${right.to ?? right.specifier}`,
    );
  edges.sort(compareEdge);
  external.sort(compareEdge);
  return {
    edges,
    external,
    cycles: dependencyCycles([...sourcePaths], edges),
  };
}

function rustDependencies(metadata, repositoryRoot) {
  if (!metadata || !Array.isArray(metadata.packages)) {
    throw new Error("Cargo metadata 分析失败：缺少 packages");
  }
  const workspaceIds = new Set(metadata.workspace_members ?? []);
  const packages = metadata.packages
    .filter((item) => workspaceIds.has(item.id))
    .map((item) => {
      const manifestPath = normalizedPath(
        relative(repositoryRoot, item.manifest_path),
      );
      if (manifestPath === ".." || manifestPath.startsWith("../")) {
        throw new Error(
          `Cargo workspace 包位于仓库外：${normalizedPath(item.manifest_path)}`,
        );
      }
      return {
        name: item.name,
        manifestPath,
        dependencies: item.dependencies.map(({ name }) => name),
      };
    })
    .sort((left, right) => compareText(left.name, right.name));
  if (packages.length === 0) {
    throw new Error("Cargo metadata 分析失败：workspace packages 为空");
  }

  const packageNames = new Set(packages.map(({ name }) => name));
  const edges = packages
    .flatMap((item) =>
      item.dependencies
        .filter((name) => packageNames.has(name))
        .map((name) => ({ from: item.name, to: name })),
    )
    .sort((left, right) =>
      compareText(`${left.from}\0${left.to}`, `${right.from}\0${right.to}`),
    );
  const cycles = dependencyCycles([...packageNames], edges);
  const forbidden = edges.filter(
    ({ from, to }) => from === RUST_DOMAIN_PACKAGE && to === RUST_SHELL_PACKAGE,
  );

  return {
    packages: packages.map(({ name, manifestPath }) => ({
      name,
      manifestPath,
    })),
    edges,
    cycles,
    forbidden,
  };
}

export function assertAnalyzerSuccess(result) {
  if (result?.status === 0) {
    return;
  }
  const reason = result?.output?.trim() || `退出码 ${result?.status ?? "未知"}`;
  throw new Error(`${result?.name ?? "未知分析器"} 分析失败：${reason}`);
}

function analyzerSummary(results, name, rules) {
  const result = results.find((item) => item.name === name);
  if (!result) {
    throw new Error(`${name} 分析失败：缺少执行结果`);
  }
  assertAnalyzerSuccess(result);
  return {
    analyzer: name,
    version: result.version,
    rules,
    status: "passed",
  };
}

export function analyzeArchitecture({
  repositoryRoot,
  sourceFiles,
  cargoMetadata,
  analyzerResults,
}) {
  if (sourceFiles.length === 0) {
    throw new Error("正式源码范围为空");
  }
  const invalid = sourceFiles
    .map(({ path }) => normalizedPath(path))
    .filter((path) => !isFormalSourcePath(path));
  if (invalid.length > 0) {
    throw new Error(`正式源码范围包含越界文件：${invalid.sort().join(", ")}`);
  }
  const duplicatePaths = sourceFiles
    .map(({ path }) => normalizedPath(path))
    .filter((path, index, paths) => paths.indexOf(path) !== index);
  if (duplicatePaths.length > 0) {
    throw new Error(`正式源码范围包含重复文件：${duplicatePaths.join(", ")}`);
  }

  const normalizedFiles = sourceFiles
    .map(({ path, source }) => ({
      path: normalizedPath(path),
      source,
    }))
    .sort((left, right) => compareText(left.path, right.path));
  const modules = normalizedFiles.map(({ path, source }) => {
    const loc = sourceLineCount(source);
    return {
      path,
      area: sourceArea(path),
      language: sourceLanguage(path),
      loc,
      hotspotGroup: hotspotGroup(loc),
    };
  });
  const hotspotGroups = { large: 0, medium: 0, small: 0 };
  for (const module of modules) {
    hotspotGroups[module.hotspotGroup] += 1;
  }

  const web = webDependencies(normalizedFiles);
  if (web.cycles.length > 0) {
    throw new Error(`前端循环依赖：${web.cycles[0].join(" -> ")}`);
  }
  const rust = rustDependencies(cargoMetadata, repositoryRoot);
  if (rust.cycles.length > 0) {
    throw new Error(`Rust workspace 循环依赖：${rust.cycles[0].join(" -> ")}`);
  }
  if (rust.forbidden.length > 0) {
    const { from, to } = rust.forbidden[0];
    throw new Error(`禁止的 Rust 依赖方向：${from} -> ${to}`);
  }

  return {
    schemaVersion: 1,
    source: {
      summary: {
        files: modules.length,
        loc: modules.reduce((total, module) => total + module.loc, 0),
        hotspotGroups,
      },
      modules,
      hotspots: [...modules]
        .sort(
          (left, right) =>
            right.loc - left.loc || compareText(left.path, right.path),
        )
        .slice(0, 10),
    },
    dependencies: {
      web,
      rust,
    },
    complexity: {
      web: analyzerSummary(analyzerResults, "oxlint", [
        "complexity",
        "import/no-cycle",
      ]),
      rust: analyzerSummary(analyzerResults, "clippy", [
        "clippy::cognitive_complexity",
      ]),
    },
  };
}

export function formatArchitectureSummary(report) {
  const lines = [
    `架构反馈：${ARCHITECTURE_REPORT_PATH}`,
    `正式源码：${report.source.summary.files} 个模块，${report.source.summary.loc} LOC`,
    [
      "热点分组：",
      `large=${report.source.summary.hotspotGroups.large}`,
      `medium=${report.source.summary.hotspotGroups.medium}`,
      `small=${report.source.summary.hotspotGroups.small}`,
    ].join(" "),
    `前端内部依赖：${report.dependencies.web.edges.length} 条，循环 0`,
    `Rust workspace 依赖：${report.dependencies.rust.edges.length} 条，禁止方向 0`,
    "复杂度：Oxlint 与 Clippy 通过",
  ];
  for (const module of report.source.hotspots.slice(0, 5)) {
    lines.push(`- ${module.path}: ${module.loc} LOC (${module.hotspotGroup})`);
  }
  return lines.join("\n");
}
