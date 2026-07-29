import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  DEFAULT_HEAD_DIFF_ARGUMENTS,
  assertFormalChangeScope,
  classifyRepositoryPath,
  selectDefaultScopePaths,
} from "./repository-scope.mjs";

function git(repositoryRoot, args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

async function commitFile(repositoryRoot, path, content, message) {
  const absolutePath = join(repositoryRoot, path);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content);
  git(repositoryRoot, ["add", path]);
  git(repositoryRoot, ["commit", "-m", message]);
}

describe("正式主线边界", () => {
  test.each([
    ["src/ui/App.vue", "mainline"],
    [
      "tests/e2e/pet-workbench.spec.ts-snapshots/juanjuan-canvas-chromium-darwin.png",
      "mainline",
    ],
    ["docs/visual-testing.md", "mainline"],
    [".scratch/preview/spec.md", "process"],
    [".scratch/preview/issues/01-build.md", "process"],
    [".scratch/preview/prototypes/shell/package.json", "prototype"],
    ["research/competitor-analysis.md", "research"],
    ["reference/upstream/LICENSE", "reference"],
    [".codex/better-harness/report.html", "generated"],
    ["output/report.pdf", "generated"],
    ["target/release/oh-my-pets", "generated"],
    ["target/playwright/results/diff.png", "generated"],
  ])("%s 分类为 %s", (path, category) => {
    expect(classifyRepositoryPath(path)).toBe(category);
  });

  test("允许正式主线与流程资产共同变更", () => {
    expect(
      assertFormalChangeScope([
        "src-tauri/src/lib.rs",
        "docs/agents/engineering-flow.md",
        ".scratch/preview/issues/01-build.md",
      ]),
    ).toEqual([]);
  });

  test("拒绝把样机、调研、外部参考或生成物混入正式关闭检查", () => {
    const violations = assertFormalChangeScope([
      "src-tauri/src/lib.rs",
      ".scratch/preview/prototypes/shell/package.json",
      "research/process-log.md",
      "reference/upstream/LICENSE",
      "output/report.pdf",
    ]);

    expect(violations).toEqual([
      ".scratch/preview/prototypes/shell/package.json (prototype)",
      "research/process-log.md (research)",
      "reference/upstream/LICENSE (reference)",
      "output/report.pdf (generated)",
    ]);
  });

  test("干净工作树改为检查 HEAD 提交，避免空门禁", () => {
    expect(
      selectDefaultScopePaths(
        [],
        ["src-tauri/src/lib.rs", "research/process-log.md"],
      ),
    ).toEqual(["src-tauri/src/lib.rs", "research/process-log.md"]);
  });

  test("有工作区变更时只检查当前关闭范围", () => {
    expect(
      selectDefaultScopePaths(
        ["src-tauri/src/lib.rs"],
        ["research/process-log.md"],
      ),
    ).toEqual(["src-tauri/src/lib.rs"]);
  });

  test("PR merge commit 按第一父提交检查完整变更范围", async () => {
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), "oh-my-pets-scope-merge-"),
    );
    try {
      git(repositoryRoot, ["init", "--initial-branch=main"]);
      git(repositoryRoot, ["config", "user.name", "Scope Test"]);
      git(repositoryRoot, ["config", "user.email", "scope@example.com"]);
      await commitFile(repositoryRoot, "README.md", "base\n", "建立基线");

      git(repositoryRoot, ["checkout", "-b", "feature"]);
      await commitFile(
        repositoryRoot,
        "research/process-log.md",
        "auxiliary\n",
        "增加辅助范围",
      );

      git(repositoryRoot, ["checkout", "main"]);
      await commitFile(
        repositoryRoot,
        "docs/mainline.md",
        "mainline\n",
        "推进主线",
      );
      git(repositoryRoot, [
        "merge",
        "--no-ff",
        "feature",
        "-m",
        "合并功能分支",
      ]);

      const paths = git(repositoryRoot, DEFAULT_HEAD_DIFF_ARGUMENTS)
        .split("\0")
        .filter(Boolean);

      expect(paths).toContain("research/process-log.md");
      expect(assertFormalChangeScope(paths)).toEqual([
        "research/process-log.md (research)",
      ]);
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });
});
