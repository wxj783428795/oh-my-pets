import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

const configUrl = new URL("../../src-tauri/tauri.conf.json", import.meta.url);
const infoPlistUrl = new URL("../../src-tauri/Info.plist", import.meta.url);
const desktopLibUrl = new URL("../../src-tauri/src/lib.rs", import.meta.url);
const displayRuntimeUrl = new URL(
  "../../src-tauri/src/display_runtime.rs",
  import.meta.url,
);
const nativePetPositionUrl = new URL(
  "../../src-tauri/src/native_pet_position.rs",
  import.meta.url,
);
const capabilityUrl = new URL(
  "../../src-tauri/capabilities/default.json",
  import.meta.url,
);
const packageUrl = new URL("../../package.json", import.meta.url);

describe("Tauri 内容安全策略", () => {
  test("只允许图片上下文读取 data URL 且不放开动态求值", async () => {
    const config = JSON.parse(await readFile(configUrl, "utf8"));
    const csp = config.app.security.csp;

    expect(csp).toMatch(/img-src[^;]*\bdata:/);
    expect(csp).not.toMatch(/connect-src[^;]*\bdata:/);
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test("macOS 人工 QA 构建带品牌图标的 app bundle", async () => {
    const config = JSON.parse(await readFile(configUrl, "utf8"));
    const packageJson = JSON.parse(await readFile(packageUrl, "utf8"));

    expect(config.bundle.icon).toContain("icons/icon.icns");
    expect(packageJson.scripts["build:desktop:qa"]).toBe(
      "tauri build --bundles app",
    );
    expect(
      packageJson.scripts["qa:desktop"].startsWith("pnpm build:desktop:qa &&"),
    ).toBe(true);
  });
});

describe("macOS 产品窗口拓扑", () => {
  test("app bundle 从 Launch Services 阶段就是不抢焦点的菜单栏应用", async () => {
    const infoPlist = await readFile(infoPlistUrl, "utf8");

    expect(infoPlist).toMatch(/<key>LSUIElement<\/key>\s*<true\s*\/>/);
  });

  test("启动时只创建不抢焦点的透明宠物窗口", async () => {
    const config = JSON.parse(await readFile(configUrl, "utf8"));

    expect(config.app.windows).toEqual([
      expect.objectContaining({
        label: "pet",
        url: "index.html?surface=pet",
        width: 320,
        height: 320,
        minWidth: 320,
        minHeight: 320,
        maxWidth: 320,
        maxHeight: 320,
        transparent: true,
        decorations: false,
        shadow: false,
        resizable: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
        visible: true,
        focus: false,
        focusable: false,
      }),
    ]);
  });

  test("macOS 启动握手先阻止强制激活再恢复菜单栏应用策略", async () => {
    const desktopLib = await readFile(desktopLibUrl, "utf8");

    expect(desktopLib).toMatch(
      /setup\(\|app\|[\s\S]*ActivationPolicy::Accessory[\s\S]*let mut app = builder[\s\S]*ActivationPolicy::Prohibited[\s\S]*app\.run/,
    );
    expect(desktopLib).toContain("ADR 0002");
  });

  test("多显示器事实只由 Rust 平台适配层读取且状态发布错误不会被吞掉", async () => {
    const desktopLib = await readFile(desktopLibUrl, "utf8");
    const displayRuntime = await readFile(displayRuntimeUrl, "utf8");
    const nativePetPosition = await readFile(nativePetPositionUrl, "utf8");

    expect(nativePetPosition).toContain(
      "display_runtime::{capture_display_snapshot, outer_window_size}",
    );
    expect(nativePetPosition).toContain(
      "Result<(PhysicalPoint, MotionStep), String>",
    );
    expect(desktopLib).toContain("NativePetPositionController");
    expect(displayRuntime).toContain(".available_monitors()");
    expect(displayRuntime).toContain(".cursor_position()");
    expect(displayRuntime).toContain("monitor.scale_factor()");
    expect(displayRuntime).toContain("monitor.work_area()");
    expect(desktopLib).not.toMatch(/let _ = refresh_tray_menu/);
    expect(desktopLib).toMatch(
      /fn publish_product_state[\s\S]*Result<\(\), CommandError>/,
    );
  });

  test("权限覆盖按需创建的偏好窗口但不保留旧主窗口角色", async () => {
    const capability = JSON.parse(await readFile(capabilityUrl, "utf8"));

    expect(capability.windows).toEqual(["pet", "preferences"]);
    expect(capability.windows).not.toContain("main");
  });
});
