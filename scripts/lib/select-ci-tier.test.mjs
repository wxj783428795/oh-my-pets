import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const scriptPath = fileURLToPath(
  new URL("../select-ci-tier.mjs", import.meta.url),
);

function git(repositoryRoot, args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

async function commitFile(repositoryRoot, path, content, message) {
  const absolutePath = join(repositoryRoot, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
  git(repositoryRoot, ["add", path]);
  git(repositoryRoot, ["commit", "-m", message]);
}

describe("CI 层级选择命令", () => {
  test("代码重命名到文档目录仍使用完整验证", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "ci-path-tier-"));
    try {
      git(repositoryRoot, ["init", "-q"]);
      git(repositoryRoot, ["config", "user.name", "Test User"]);
      git(repositoryRoot, ["config", "user.email", "test@example.com"]);
      await commitFile(
        repositoryRoot,
        "src/app.ts",
        "export const app = true;\n",
        "add source",
      );
      const baseSha = git(repositoryRoot, ["rev-parse", "HEAD"]).trim();
      await mkdir(join(repositoryRoot, "docs"), { recursive: true });
      git(repositoryRoot, ["mv", "src/app.ts", "docs/app.ts"]);
      git(repositoryRoot, ["commit", "-m", "move source"]);
      const headSha = git(repositoryRoot, ["rev-parse", "HEAD"]).trim();

      const output = execFileSync("node", [scriptPath], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "pull_request",
          CI_BASE_SHA: baseSha,
          CI_HEAD_SHA: headSha,
        },
      });

      expect(output.trim()).toBe("tier=full");
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });
});
