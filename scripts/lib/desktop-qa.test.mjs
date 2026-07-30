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
      ({ name }) => name !== "preferences_recovery",
    );

    expect(validateDesktopSmokeReport(report)).toContain(
      "缺少自动化检查: preferences_recovery",
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

  test("人工验收明确要求只启动宠物且不抢焦点", () => {
    expect(MANUAL_DESKTOP_CHECKS).toContain(
      "确认正常启动后只显示宠物，不出现偏好设置或高级开发预览，且不会从当前应用抢走键盘焦点",
    );
  });

  test("人工验收保留点击穿透的物理体验检查", () => {
    expect(MANUAL_DESKTOP_CHECKS).toContain(
      "确认在高级开发预览开启点击穿透后，桌面目标可被物理点击，并能从同一入口关闭；收起后可经菜单栏重新打开偏好设置恢复",
    );
  });

  test("人工清单最后以菜单退出且要求应用干净结束", () => {
    expect(MANUAL_DESKTOP_CHECKS.at(-1)).toBe(
      "确认菜单栏的退出操作会同时结束宠物、偏好设置和菜单栏入口",
    );
  });

  test("人工回答、退出前持续存活与最终干净退出必须同时成立", () => {
    const results = [
      { item: "菜单栏恢复", passed: true },
      { item: "点击穿透", passed: true },
      { item: "菜单退出", passed: true },
    ];

    expect(manualQaPassed(results, true, true)).toBe(true);
    expect(manualQaPassed(results, false, true)).toBe(false);
    expect(manualQaPassed(results, true, false)).toBe(false);
    expect(
      manualQaPassed(
        [...results, { item: "诊断导出", passed: false }],
        true,
        true,
      ),
    ).toBe(false);
  });
});
