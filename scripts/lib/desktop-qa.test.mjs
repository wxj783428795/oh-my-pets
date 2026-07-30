import { EventEmitter } from "node:events";

import { describe, expect, test } from "vitest";

import {
  AUTOMATED_DESKTOP_CHECKS,
  DESKTOP_QA_SOURCE_PATHS,
  desktopExecutablePath,
  finishProbedProcess,
  MANUAL_DESKTOP_CHECKS,
  manualQaPassed,
  manualQaPlatformError,
  startupFocusPreserved,
  validateDesktopSmokeReport,
  waitForCleanExit,
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
    startupFocus: {
      beforePid: 100,
      appPid: 200,
      observedPids: [100, 100],
      typedCount: 100,
      minimumTypedCount: 100,
      preserved: true,
    },
    sourceFingerprint: "a".repeat(64),
  };
}

describe("桌面 smoke 报告", () => {
  test("源码指纹覆盖 Vite 的根 HTML 入口", () => {
    expect(DESKTOP_QA_SOURCE_PATHS).toContain("index.html");
  });

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

  test("应用进程一旦成为前台进程就判定启动抢焦点", () => {
    expect(
      startupFocusPreserved({
        beforePid: 100,
        appPid: 200,
        observedPids: [100, 200],
        typedCount: 100,
        minimumTypedCount: 100,
      }),
    ).toBe(false);
    expect(
      startupFocusPreserved({
        beforePid: 100,
        appPid: 200,
        observedPids: [100, 300],
        typedCount: 100,
        minimumTypedCount: 100,
      }),
    ).toBe(false);
    expect(
      startupFocusPreserved({
        beforePid: 100,
        appPid: 200,
        observedPids: [100, 100],
        typedCount: 100,
        minimumTypedCount: 100,
      }),
    ).toBe(true);
  });

  test("前台 PID 未变但连续输入中断时仍判定启动抢焦点", () => {
    expect(
      startupFocusPreserved({
        beforePid: 100,
        appPid: 200,
        observedPids: [100, 100],
        typedCount: 42,
        minimumTypedCount: 100,
      }),
    ).toBe(false);
  });

  test("焦点证据失败时终止并收拢目标桌面进程", async () => {
    const target = {
      exitCode: null,
      signalCode: null,
      killCalled: false,
      kill() {
        this.killCalled = true;
        this.exitCode = 0;
      },
    };

    await expect(
      finishProbedProcess({
        evidence: Promise.reject(new Error("连续输入中断")),
        target,
        completion: Promise.resolve(),
      }),
    ).rejects.toThrow("连续输入中断");
    expect(target.killCalled).toBe(true);
  });

  test("缺少连续输入证据时拒绝自动 smoke 报告", () => {
    const report = validReport();
    delete report.startupFocus.typedCount;

    expect(validateDesktopSmokeReport(report)).toContain(
      "报告必须包含未抢焦点的真实启动证据",
    );
  });

  test("缺少真实启动焦点证据时拒绝自动 smoke 报告", () => {
    const report = validReport();
    delete report.startupFocus;

    expect(validateDesktopSmokeReport(report)).toContain(
      "报告必须包含未抢焦点的真实启动证据",
    );
  });

  test("人工 QA 拒绝复用其他源码状态生成的自动报告", () => {
    const report = validReport();

    expect(
      validateDesktopSmokeReport(report, {
        expectedSourceFingerprint: "b".repeat(64),
      }),
    ).toContain("自动 smoke 报告与当前桌面源码不匹配");
  });

  test("缺少桌面源码指纹时拒绝自动 smoke 报告", () => {
    const report = validReport();
    delete report.sourceFingerprint;

    expect(validateDesktopSmokeReport(report)).toContain(
      "报告必须包含桌面源码指纹",
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
      "确认开启点击穿透后桌面目标可被物理点击，并能从菜单栏关闭穿透",
    );
  });

  test("人工验收覆盖跨启动持久化矩阵和损坏恢复", () => {
    expect(MANUAL_DESKTOP_CHECKS).toContain(
      "确认通过菜单召回宠物并记住其位置；尺寸、活动频率、登录时启动和最后位置在重启后保留；安静、隐藏、穿透与运行时动作在重启后重置",
    );
    expect(MANUAL_DESKTOP_CHECKS).toContain(
      "确认使用损坏或未知版本偏好启动时宠物仍可见、设置回到安全默认值，诊断可理解且不包含偏好文件路径",
    );
    expect(MANUAL_DESKTOP_CHECKS.join("\n")).toContain(
      "通过菜单召回宠物并记住其位置",
    );
    expect(MANUAL_DESKTOP_CHECKS.join("\n")).not.toContain("移动宠物");
  });

  test("人工验收只要求观察当前 ticket 已接入的设置效果", () => {
    expect(MANUAL_DESKTOP_CHECKS).toContain(
      "确认尺寸会立即同步到宠物，活动频率在重新打开偏好设置后保持选择；登录时启动与 macOS 系统设置中的登录项一致",
    );
    expect(MANUAL_DESKTOP_CHECKS.join("\n")).not.toContain(
      "活动频率和登录时启动会立即同步到宠物与菜单",
    );
  });

  test("人工验收不会把新手提示状态 seam 误称为已完成界面", () => {
    expect(MANUAL_DESKTOP_CHECKS).toContain(
      "确认可重复打开偏好设置，重新加载卷卷、重置新手提示状态和导出诊断均可用；界面明确说明实际提示流程后续接入，关闭设置后宠物与菜单栏继续运行",
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

  test("退出监听先订阅再复查状态，不会漏掉干净退出事件", async () => {
    const app = new EventEmitter();
    app.exitCode = null;
    app.signalCode = null;
    const exit = waitForCleanExit(app, 100);

    app.exitCode = 0;
    app.emit("exit", 0, null);

    await expect(exit).resolves.toBe(true);
  });

  test("调用退出等待前进程已经干净结束时直接接受退出状态", async () => {
    const app = new EventEmitter();
    app.exitCode = 0;
    app.signalCode = null;

    await expect(waitForCleanExit(app, 100)).resolves.toBe(true);
  });
});
