function normalize(path) {
  return path.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function classifyRepositoryPath(path) {
  const value = normalize(path);

  if (
    value.startsWith(".codex/") ||
    value.startsWith("output/") ||
    value.startsWith("target/")
  ) {
    return "generated";
  }
  if (/^\.scratch\/[^/]+\/prototypes(?:\/|$)/.test(value)) {
    return "prototype";
  }
  if (value.startsWith("research/")) {
    return "research";
  }
  if (value.startsWith("reference/")) {
    return "reference";
  }
  if (
    /^\.scratch\/[^/]+\/(?:spec|map)\.md$/.test(value) ||
    /^\.scratch\/[^/]+\/issues\/[^/]+\.md$/.test(value)
  ) {
    return "process";
  }
  if (value.startsWith(".scratch/")) {
    return "scratch-auxiliary";
  }
  return "mainline";
}

export function assertFormalChangeScope(paths) {
  return [...new Set(paths.map(normalize))]
    .filter(
      (path) => !["mainline", "process"].includes(classifyRepositoryPath(path)),
    )
    .map((path) => `${path} (${classifyRepositoryPath(path)})`);
}

export function selectDefaultScopePaths(workspacePaths, headPaths) {
  const selected = workspacePaths.length > 0 ? workspacePaths : headPaths;
  return [...new Set(selected.map(normalize))];
}
