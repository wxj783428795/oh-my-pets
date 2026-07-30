// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";

import PetWindow from "./PetWindow.vue";
import { platformKey, type Platform } from "./platform";
import type { PetPackPayload } from "./types";

type InvokeMock = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;
type EmitMock = (event: string, payload?: unknown) => Promise<void>;

const { rendererDestroy, rendererMount } = vi.hoisted(() => ({
  rendererDestroy: vi.fn<() => void>(),
  rendererMount: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));

vi.mock("./pet-renderer", () => ({
  PetRenderer: class {
    async mount(): Promise<void> {
      await rendererMount();
    }

    destroy(): void {
      rendererDestroy();
    }
  },
}));

function createPack(): PetPackPayload {
  return {
    revision: 1,
    manifest: {
      schemaVersion: 1,
      id: "juanjuan",
      version: "0.1.0",
      displayName: "卷卷",
      description: "测试宠物",
      canvas: { width: 320, height: 320 },
      actions: {},
    },
    atlas: {
      imagePath: "atlas.png",
      pixelWidth: 320,
      pixelHeight: 320,
      frames: {},
    },
    summary: {
      id: "juanjuan",
      version: "0.1.0",
      displayName: "卷卷",
      description: "测试宠物",
      canvas: { width: 320, height: 320 },
      atlasImage: "atlas.png",
      actionCount: 0,
      frameCount: 0,
      actions: [],
      warnings: [],
    },
    imageUrl: "asset://atlas.png",
  };
}

function platform(
  invoke: InvokeMock,
  emit: EmitMock,
): Platform {
  return {
    async invoke<T>(
      command: string,
      args?: Record<string, unknown>,
    ): Promise<T> {
      return (await (args === undefined
        ? invoke(command)
        : invoke(command, args))) as T;
    },
    async emit<T>(event: string, payload?: T): Promise<void> {
      await emit(event, payload);
    },
    async listen() {
      return () => undefined;
    },
    getCurrentWindow: () => ({
      async onDragDropEvent() {
        return () => undefined;
      },
      async startDragging() {},
    }),
  };
}

afterEach(() => {
  rendererDestroy.mockReset();
  rendererMount.mockReset();
  rendererMount.mockResolvedValue(undefined);
});

describe("宠物产品表面", () => {
  test("挂载宠物后以 pet 身份报告真实前端 smoke 状态", async () => {
    const invoke = vi.fn<InvokeMock>().mockResolvedValue(createPack());
    const emit = vi.fn<EmitMock>().mockResolvedValue(undefined);
    const wrapper = mount(PetWindow, {
      global: {
        provide: {
          [platformKey as symbol]: platform(invoke, emit),
        },
      },
    });

    await flushPromises();

    expect(wrapper.get("main").attributes("aria-label")).toBe("桌面宠物");
    expect(wrapper.find(".workbench").exists()).toBe(false);
    expect(rendererMount).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith(
      "frontend-smoke-status",
      expect.objectContaining({
        surface: "pet",
        loaded: true,
      }),
    );

    wrapper.unmount();
    expect(rendererDestroy).toHaveBeenCalledOnce();
  });

  test("当前宠物包尚未就绪时使用统一重载恢复路径", async () => {
    const invoke = vi
      .fn<InvokeMock>()
      .mockRejectedValueOnce(new Error("尚未加载"))
      .mockResolvedValueOnce(createPack());
    const wrapper = mount(PetWindow, {
      global: {
        provide: {
          [platformKey as symbol]: platform(
            invoke,
            vi.fn<EmitMock>().mockResolvedValue(undefined),
          ),
        },
      },
    });

    await flushPromises();

    expect(invoke).toHaveBeenNthCalledWith(1, "current_pet_pack");
    expect(invoke).toHaveBeenNthCalledWith(2, "reload_example_pet_pack");
    expect(rendererMount).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  test("渲染失败只在宠物表面显示恢复提示并报告失败", async () => {
    rendererMount.mockRejectedValueOnce(new Error("WebGL 不可用"));
    const emit = vi.fn<EmitMock>().mockResolvedValue(undefined);
    const wrapper = mount(PetWindow, {
      global: {
        provide: {
          [platformKey as symbol]: platform(
            vi.fn<InvokeMock>().mockResolvedValue(createPack()),
            emit,
          ),
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain("宠物暂时无法显示");
    expect(emit).toHaveBeenCalledWith(
      "frontend-smoke-status",
      expect.objectContaining({
        surface: "pet",
        loaded: false,
        detail: "WebGL 不可用",
      }),
    );
    wrapper.unmount();
  });
});
