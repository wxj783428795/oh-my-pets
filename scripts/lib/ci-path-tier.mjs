import { classifyRepositoryPath } from "./repository-scope.mjs";

const lightweightRootPaths = new Set(["AGENTS.md", "CONTEXT.md", "README.md"]);

function isLightweightPath(path) {
  if (path.includes("\\")) {
    return false;
  }
  return (
    lightweightRootPaths.has(path) ||
    path.startsWith("docs/") ||
    classifyRepositoryPath(path) === "process"
  );
}

export function selectCiTier({ eventName, changedPaths }) {
  if (eventName !== "pull_request" || changedPaths.length === 0) {
    return "full";
  }
  return changedPaths.every(isLightweightPath) ? "lightweight" : "full";
}
