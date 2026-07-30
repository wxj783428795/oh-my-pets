// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";

import PreferencesWindow from "./PreferencesWindow.vue";
import { platformKey, type Platform } from "./platform";
import type { ProductStateSnapshot } from "./types";

function snapshot(
  overrides: Partial<ProductStateSnapshot["preferences"]> = {},
): ProductStateSnapshot {
  return {
    preferences: {
      petSize: "medium",
      activityFrequency: "standard",
      launchAtLogin: false,
      lastValidPosition: null,
      onboardingSeen: true,
      ...overrides,
    },
    session: {
      quietMode: false,
      petHidden: false,
      clickThrough: false,
      currentAction: "idle",
      velocity: { x: 0, y: 0 },
      behaviorTimerMs: null,
    },
    preferenceHealth: {
      kind: "healthy",
      message: "偏好已加载",
    },
  };
}

function testPlatform(initial: ProductStateSnapshot) {
  let productState = initial;
  let productListener:
    | ((event: {
        event: string;
        id: number;
        payload: ProductStateSnapshot;
      }) => void)
    | undefined;
  const invoke = vi.fn<
    (command: string, args?: Record<string, unknown>) => Promise<unknown>
  >(
    async (
      command: string,
      args?: Record<string, unknown>,
    ): Promise<unknown> => {
      if (command === "product_state_snapshot") {
        return productState;
      }
      if (command === "set_pet_size") {
        productState = snapshot({
          ...productState.preferences,
          petSize: String(
            args?.petSize,
          ) as ProductStateSnapshot["preferences"]["petSize"],
        });
        return productState;
      }
      if (command === "set_activity_frequency") {
        productState = snapshot({
          ...productState.preferences,
          activityFrequency: String(
            args?.activityFrequency,
          ) as ProductStateSnapshot["preferences"]["activityFrequency"],
        });
        return productState;
      }
      if (command === "set_launch_at_login") {
        productState = snapshot({
          ...productState.preferences,
          launchAtLogin: Boolean(args?.enabled),
        });
        return productState;
      }
      if (
        command === "reload_example_pet_pack" ||
        command === "replay_onboarding" ||
        command === "export_diagnostics"
      ) {
        return command === "export_diagnostics"
          ? "target/diagnostics.md"
          : productState;
      }
      throw new Error(`未处理命令：${command}`);
    },
  );
  const platform: Platform = {
    async invoke<T>(
      command: string,
      args?: Record<string, unknown>,
    ): Promise<T> {
      return (await (args === undefined
        ? invoke(command)
        : invoke(command, args))) as T;
    },
    async emit() {},
    async listen(event, listener) {
      if (event === "product-state") {
        productListener = listener as typeof productListener;
      }
      return () => {
        productListener = undefined;
      };
    },
    getCurrentWindow: () => ({
      async onDragDropEvent() {
        return () => undefined;
      },
      async startDragging() {},
    }),
  };
  return {
    invoke,
    platform,
    push(next: ProductStateSnapshot) {
      productListener?.({ event: "product-state", id: 1, payload: next });
    },
  };
}

describe("偏好设置产品表面", () => {
  test("读取 Rust 快照并把低频设置写回同一状态源", async () => {
    const harness = testPlatform(snapshot());
    const wrapper = mount(PreferencesWindow, {
      global: {
        provide: {
          [platformKey as symbol]: harness.platform,
        },
      },
    });
    await flushPromises();

    expect(
      wrapper.get<HTMLInputElement>('input[value="medium"]').element.checked,
    ).toBe(true);
    expect(
      wrapper.get<HTMLInputElement>('input[value="standard"]').element.checked,
    ).toBe(true);
    expect(
      wrapper.get<HTMLInputElement>('input[name="launch-at-login"]').element
        .checked,
    ).toBe(false);

    await wrapper.get('input[value="large"]').setValue(true);
    await wrapper.get('input[value="high"]').setValue(true);
    await wrapper.get('input[name="launch-at-login"]').setValue(true);
    await flushPromises();

    expect(harness.invoke).toHaveBeenCalledWith("set_pet_size", {
      petSize: "large",
    });
    expect(harness.invoke).toHaveBeenCalledWith("set_activity_frequency", {
      activityFrequency: "high",
    });
    expect(harness.invoke).toHaveBeenCalledWith("set_launch_at_login", {
      enabled: true,
    });
  });

  test("Rust 事件更新控件，恢复动作继续复用正式命令", async () => {
    const harness = testPlatform(snapshot());
    const wrapper = mount(PreferencesWindow, {
      global: {
        provide: {
          [platformKey as symbol]: harness.platform,
        },
      },
    });
    await flushPromises();

    harness.push(
      snapshot({
        petSize: "small",
        activityFrequency: "low",
        launchAtLogin: true,
      }),
    );
    await flushPromises();

    expect(
      wrapper.get<HTMLInputElement>('input[value="small"]').element.checked,
    ).toBe(true);
    expect(
      wrapper.get<HTMLInputElement>('input[value="low"]').element.checked,
    ).toBe(true);
    expect(
      wrapper.get<HTMLInputElement>('input[name="launch-at-login"]').element
        .checked,
    ).toBe(true);

    await wrapper.get('button[data-action="reload-pack"]').trigger("click");
    await flushPromises();
    await wrapper
      .get('button[data-action="replay-onboarding"]')
      .trigger("click");
    await flushPromises();
    expect(
      wrapper.get('button[data-action="replay-onboarding"]').text(),
    ).toBe("重置新手提示状态");
    expect(wrapper.text()).toContain(
      "新手提示状态已重置；提示界面将在后续体验流程接入",
    );
    await wrapper
      .get('button[data-action="export-diagnostics"]')
      .trigger("click");
    await flushPromises();

    expect(harness.invoke).toHaveBeenCalledWith("reload_example_pet_pack");
    expect(harness.invoke).toHaveBeenCalledWith("replay_onboarding");
    expect(harness.invoke).toHaveBeenCalledWith("export_diagnostics");
    expect(wrapper.text()).toContain("target/diagnostics.md");
  });
});
