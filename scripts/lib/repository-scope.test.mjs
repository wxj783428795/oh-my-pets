import { describe, expect, test } from "vitest";

import {
  assertFormalChangeScope,
  classifyRepositoryPath,
  selectDefaultScopePaths,
} from "./repository-scope.mjs";

describe("正式主线边界", () => {
  test.each([
    ["src/ui/App.vue", "mainline"],
    [".scratch/preview/spec.md", "process"],
    [".scratch/preview/issues/01-build.md", "process"],
    [".scratch/preview/prototypes/shell/package.json", "prototype"],
    ["research/competitor-analysis.md", "research"],
    ["reference/upstream/LICENSE", "reference"],
    [".codex/better-harness/report.html", "generated"],
    ["output/report.pdf", "generated"],
    ["target/release/oh-my-pets", "generated"],
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
});
