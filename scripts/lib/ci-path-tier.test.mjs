import { describe, expect, test } from "vitest";

import { selectCiTier } from "./ci-path-tier.mjs";

describe("GitHub CI 路径分层", () => {
  test("纯文档和正式流程资产使用轻量验证", () => {
    expect(
      selectCiTier({
        eventName: "pull_request",
        changedPaths: [
          "AGENTS.md",
          "CONTEXT.md",
          "README.md",
          "docs/agents/delivery-readiness.md",
          ".scratch/preview/spec.md",
          ".scratch/preview/map.md",
          ".scratch/preview/issues/01-shell.md",
        ],
      }),
    ).toBe("lightweight");
  });

  test("混入产品或工程路径时升级为完整验证", () => {
    expect(
      selectCiTier({
        eventName: "pull_request",
        changedPaths: ["docs/visual-testing.md", "src/ui/App.vue"],
      }),
    ).toBe("full");
  });

  test("手动触发始终使用完整验证", () => {
    expect(
      selectCiTier({
        eventName: "workflow_dispatch",
        changedPaths: ["docs/agents/delivery-readiness.md"],
      }),
    ).toBe("full");
  });

  test("无法取得变更路径时保守使用完整验证", () => {
    expect(
      selectCiTier({
        eventName: "pull_request",
        changedPaths: [],
      }),
    ).toBe("full");
  });

  test("含反斜杠的未知根路径使用完整验证", () => {
    expect(
      selectCiTier({
        eventName: "pull_request",
        changedPaths: ["docs\\not-a-doc.md"],
      }),
    ).toBe("full");
  });
});
