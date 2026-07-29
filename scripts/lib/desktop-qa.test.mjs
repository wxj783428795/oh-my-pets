import { describe, expect, test } from "vitest";

import {
  AUTOMATED_DESKTOP_CHECKS,
  desktopExecutablePath,
  MANUAL_DESKTOP_CHECKS,
  manualQaPassed,
  manualQaPlatformError,
  validateDesktopSmokeReport,
} from "./desktop-qa.mjs";

function validReport() {
  return {
    schemaVersion: 1,
    passed: true,
    checks: AUTOMATED_DESKTOP_CHECKS.map((name) => ({
      name,
      status: "passed",
      detail: "通过",
    })),
    manualQaRequired: true,
    manualItems: ["确认菜单栏图标可见并能通过真实点击恢复窗口"],
  };
}

describe("桌面 smoke 报告", () => {
  test("接受覆盖全部自动化步骤且声明仍需人工 QA 的报告", () => {
    expect(validateDesktopSmokeReport(validReport())).toEqual([]);
  });

  test("缺失任何自动化步骤时失败", () => {
    const report = validReport();
    report.checks = report.checks.filter(
      ({ name }) => name !== "diagnostics_export",
    );

    expect(validateDesktopSmokeReport(report)).toContain(
      "缺少自动化检查: diagnostics_export",
    );
  });

  test("不允许把人工桌面 QA 伪装成自动化完成", () => {
    const report = validReport();
    report.manualQaRequired = false;

    expect(validateDesktopSmokeReport(report)).toContain(
      "报告必须明确 manualQaRequired=true",
    );
  });

  test("人工 QA 只允许真实 macOS 桌面", () => {
    expect(manualQaPlatformError("darwin")).toBeNull();
    expect(manualQaPlatformError("linux")).toBe(
      "真实桌面人工 QA 仅支持 macOS（darwin），当前平台为 linux",
    );
  });

  test("macOS 人工 QA 从带图标的 app bundle 启动", () => {
    expect(
      desktopExecutablePath({
        repositoryRoot: "/repo",
        platform: "darwin",
        manualMode: true,
      }),
    ).toBe(
      "/repo/target/release/bundle/macos/Oh My Pets.app/Contents/MacOS/oh-my-pets",
    );
    expect(
      desktopExecutablePath({
        repositoryRoot: "/repo",
        platform: "darwin",
        manualMode: false,
      }),
    ).toBe("/repo/target/release/oh-my-pets");
  });

  test("人工验收明确区分单帧工程包与首发逐帧动画", () => {
    expect(MANUAL_DESKTOP_CHECKS).toContain(
      "确认示例宠物可见，运行最小时间线后语义动作状态持续切换（当前单帧占位资源不验收逐帧动画）",
    );
  });

  test("人工回答与应用存活必须同时成立", () => {
    const results = [
      { item: "菜单栏恢复", passed: true },
      { item: "点击穿透", passed: true },
    ];

    expect(manualQaPassed(results, true)).toBe(true);
    expect(manualQaPassed(results, false)).toBe(false);
    expect(
      manualQaPassed([...results, { item: "诊断导出", passed: false }], true),
    ).toBe(false);
  });
});
