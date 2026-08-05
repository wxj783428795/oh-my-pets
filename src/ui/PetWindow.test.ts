// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";

import PetWindow from "./PetWindow.vue";
import { platformKey, type Platform } from "./platform";
import type { PetPackPayload, ProductStateSnapshot } from "./types";

type InvokeMock = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;
type EmitMock = (event: string, payload?: unknown) => Promise<void>;

const {
  rendererDestroy,
  rendererMount,
  rendererPlay,
  rendererPlayUntilStopped,
  rendererStop,
} = vi.hoisted(() => ({
  rendererDestroy: vi.fn<() => void>(),
  rendererMount: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  rendererPlay: vi.fn<
    (
      _action: string,
      _holdMs: number,
      _onFirstFrame?: () => void,
    ) => Promise<void>
  >(() => Promise.resolve()),
  rendererPlayUntilStopped: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  rendererStop: vi.fn<() => void>(),
}));

let productStateListener:
  | ((event: {
      event: string;
      id: number;
      payload: ProductStateSnapshot;
    }) => void)
  | undefined;
let interactionListener:
  | ((event: {
      event: string;
      id: number;
      payload: {
        kind: "action";
        revision: number;
        action: string;
        holdMs: number;
        completeOnFinish: boolean;
      };
    }) => void)
  | undefined;
let dragDropListener:
  | ((event: {
      event: string;
      id: number;
      payload:
        | { type: "drop"; paths: string[]; position: { x: number; y: number } }
        | { type: "leave" };
    }) => void)
  | undefined;

function productSnapshot(): ProductStateSnapshot {
  return {
    preferences: {
      petSize: "medium",
      activityFrequency: "standard",
      launchAtLogin: false,
      lastValidPosition: null,
      onboardingSeen: false,
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

vi.mock("./pet-renderer", () => ({
  PetRenderer: class {
    async mount(): Promise<void> {
      await rendererMount();
    }

    async playUntilStopped(
      _action: string,
      onFirstFrame?: () => void,
    ): Promise<void> {
      onFirstFrame?.();
      await rendererPlayUntilStopped();
    }

    destroy(): void {
      rendererDestroy();
    }

    async play(
      action: string,
      holdMs: number,
      onFirstFrame?: () => void,
    ): Promise<void> {
      onFirstFrame?.();
      await rendererPlay(action, holdMs);
    }

    stop(): void {
      rendererStop();
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
      layout: {
        baseline: { x: 160, y: 292 },
        hitbox: { x: 54, y: 32, width: 212, height: 260 },
        dropZone: { x: 86, y: 112, width: 148, height: 132 },
        bubbleAnchor: { x: 160, y: 24 },
      },
      actions: {
        idle: {
          loop: true,
          frames: [
            { ref: "idle_00", durationMs: 720 },
            { ref: "idle_01", durationMs: 180 },
          ],
          cuePoints: [],
        },
      },
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

function platform(invoke: InvokeMock, emit: EmitMock): Platform {
  return {
    async invoke<T>(
      command: string,
      args?: Record<string, unknown>,
    ): Promise<T> {
      if (command === "product_state_snapshot") {
        return productSnapshot() as T;
      }
      if (command === "native_file_drop_coordinate_space") {
        return "logical" as T;
      }
      return (await (args === undefined
        ? invoke(command)
        : invoke(command, args))) as T;
    },
    async emit<T>(event: string, payload?: T): Promise<void> {
      await emit(event, payload);
    },
    async listen(event, listener) {
      if (event === "product-state") {
        productStateListener = listener as typeof productStateListener;
      } else if (event === "pet-interaction") {
        interactionListener = listener as typeof interactionListener;
      }
      return () => {
        if (event === "product-state") {
          productStateListener = undefined;
        } else if (event === "pet-interaction") {
          interactionListener = undefined;
        }
      };
    },
    getCurrentWindow: () => ({
      async onDragDropEvent(handler) {
        dragDropListener = handler as typeof dragDropListener;
        return () => {
          dragDropListener = undefined;
        };
      },
      async startDragging() {},
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  rendererDestroy.mockReset();
  rendererMount.mockReset();
  rendererMount.mockResolvedValue(undefined);
  rendererPlay.mockReset();
  rendererPlay.mockResolvedValue(undefined);
  rendererPlayUntilStopped.mockReset();
  rendererPlayUntilStopped.mockResolvedValue(undefined);
  rendererStop.mockReset();
  productStateListener = undefined;
  interactionListener = undefined;
  dragDropListener = undefined;
});

describe("宠物产品表面", () => {
  test("热区内点击由 Rust 捕获并播放返回的 tap_react", async () => {
    const invoke = vi.fn<InvokeMock>(async (command) => {
      if (command === "current_pet_pack") {
        return createPack();
      }
      if (command === "begin_pet_pointer") {
        return { kind: "captured", captureId: 7 };
      }
      if (command === "end_pet_pointer") {
        return {
          kind: "action",
          revision: 1,
          action: "tap_react",
          holdMs: 620,
        };
      }
      if (command === "complete_pet_action") {
        return { kind: "ignored" };
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const emit = vi.fn<EmitMock>().mockResolvedValue(undefined);
    const wrapper = mount(PetWindow, {
      global: {
        provide: {
          [platformKey as symbol]: platform(invoke, emit),
        },
      },
    });
    await flushPromises();
    const canvas = wrapper.get(".pet-canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      x: 80,
      y: 80,
      left: 80,
      top: 80,
      right: 240,
      bottom: 240,
      width: 160,
      height: 160,
      toJSON: () => ({}),
    });

    const dispatchPointer = (type: string, timeStamp: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: 160,
        clientY: 160,
      });
      Object.defineProperty(event, "pointerId", { value: 3 });
      Object.defineProperty(event, "timeStamp", { value: timeStamp });
      canvas.element.dispatchEvent(event);
    };
    dispatchPointer("pointerdown", 10);
    await flushPromises();
    dispatchPointer("pointerup", 30);
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith(
      "begin_pet_pointer",
      expect.objectContaining({
        pointer: expect.objectContaining({ localX: 80, localY: 80 }),
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "end_pet_pointer",
      expect.objectContaining({ captureId: 7 }),
    );
    expect(rendererPlay).toHaveBeenCalledWith("tap_react", 620);
    wrapper.unmount();
  });

  test("互动动作完成回到 idle 后恢复持续逐帧播放", async () => {
    const invoke = vi.fn<InvokeMock>(async (command) => {
      if (command === "current_pet_pack") {
        return createPack();
      }
      if (command === "complete_pet_action") {
        return {
          kind: "action",
          revision: 2,
          action: "idle",
          holdMs: 60_000,
          completeOnFinish: false,
        };
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const emit = vi.fn<EmitMock>().mockResolvedValue(undefined);
    const wrapper = mount(PetWindow, {
      global: {
        provide: {
          [platformKey as symbol]: platform(invoke, emit),
        },
      },
    });
    await flushPromises();

    interactionListener?.({
      event: "pet-interaction",
      id: 2,
      payload: {
        kind: "action",
        revision: 1,
        action: "tap_react",
        holdMs: 620,
        completeOnFinish: true,
      },
    });
    await flushPromises();

    expect(rendererPlay).toHaveBeenCalledWith("tap_react", 620);
    expect(rendererPlayUntilStopped).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith("pet-interaction-visible", {
      revision: 2,
      action: "idle",
    });
    expect(wrapper.get(".pet-canvas").attributes("data-current-action")).toBe(
      "idle",
    );
    wrapper.unmount();
  });

  test("捕获后的指针移动由 Rust 驱动原生窗口并播放 drag_hold", async () => {
    const invoke = vi.fn<InvokeMock>(async (command) => {
      if (command === "current_pet_pack") {
        return createPack();
      }
      if (command === "begin_pet_pointer") {
        return { kind: "captured", captureId: 9 };
      }
      if (command === "update_pet_pointer") {
        return {
          kind: "action",
          revision: 1,
          action: "drag_hold",
          holdMs: 60_000,
        };
      }
      if (command === "complete_pet_action") {
        return { kind: "ignored" };
      }
      throw new Error(`unexpected command: ${command}`);
    });
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
    const canvas = wrapper.get(".pet-canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      x: 80,
      y: 80,
      left: 80,
      top: 80,
      right: 240,
      bottom: 240,
      width: 160,
      height: 160,
      toJSON: () => ({}),
    });
    const dispatchPointer = (
      type: string,
      clientX: number,
      timeStamp: number,
    ) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX,
        clientY: 160,
      });
      Object.defineProperty(event, "pointerId", { value: 4 });
      Object.defineProperty(event, "timeStamp", { value: timeStamp });
      canvas.element.dispatchEvent(event);
    };

    dispatchPointer("pointerdown", 160, 10);
    await flushPromises();
    dispatchPointer("pointermove", 180, 30);
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith(
      "update_pet_pointer",
      expect.objectContaining({
        captureId: 9,
        pointer: expect.objectContaining({ localX: 100 }),
      }),
    );
    expect(rendererPlay).toHaveBeenCalledWith("drag_hold", 60_000);
    wrapper.unmount();
  });

  test("begin IPC 返回前发生的快速拖拽和释放仍会依次送达 Rust", async () => {
    let resolveBegin: ((payload: unknown) => void) | undefined;
    const pendingBegin = new Promise<unknown>((resolve) => {
      resolveBegin = resolve;
    });
    const invoke = vi.fn<InvokeMock>(async (command) => {
      if (command === "current_pet_pack") {
        return createPack();
      }
      if (command === "begin_pet_pointer") {
        return pendingBegin;
      }
      if (command === "update_pet_pointer") {
        return {
          kind: "action",
          revision: 1,
          action: "drag_hold",
          holdMs: 60_000,
          completeOnFinish: false,
        };
      }
      if (command === "end_pet_pointer") {
        return {
          kind: "action",
          revision: 2,
          action: "fall",
          holdMs: 60_000,
          completeOnFinish: false,
        };
      }
      throw new Error(`unexpected command: ${command}`);
    });
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
    const canvas = wrapper.get(".pet-canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 160,
      bottom: 160,
      width: 160,
      height: 160,
      toJSON: () => ({}),
    });
    const dispatch = (type: string, clientX: number, timeStamp: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX,
        clientY: 80,
      });
      Object.defineProperty(event, "pointerId", { value: 17 });
      Object.defineProperty(event, "timeStamp", { value: timeStamp });
      canvas.element.dispatchEvent(event);
    };

    dispatch("pointerdown", 80, 10);
    dispatch("pointermove", 120, 20);
    dispatch("pointerup", 140, 30);
    resolveBegin?.({ kind: "captured", captureId: 21 });
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith(
      "update_pet_pointer",
      expect.objectContaining({ captureId: 21 }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "end_pet_pointer",
      expect.objectContaining({ captureId: 21 }),
    );
    expect(rendererPlay).toHaveBeenCalledWith("drag_hold", 60_000);
    expect(rendererPlay).toHaveBeenCalledWith("fall", 60_000);
    wrapper.unmount();
  });

  test("macOS Retina 中心投喂播放反馈且不暴露瞬时路径", async () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const sensitiveMarker = "OMP_PRIVATE_DROP_42";
    const invoke = vi.fn<InvokeMock>(async (command, args) => {
      if (command === "current_pet_pack") {
        return createPack();
      }
      if (command === "handle_pet_file_drop") {
        const pointer = args?.pointer as
          | { localX: number; localY: number }
          | undefined;
        if (pointer?.localX !== 80 || pointer.localY !== 80) {
          return { kind: "ignored" };
        }
        return {
          kind: "action",
          revision: 1,
          action: "feed_react",
          holdMs: 1_100,
        };
      }
      if (command === "complete_pet_action") {
        return { kind: "ignored" };
      }
      throw new Error(`unexpected command: ${command}`);
    });
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
    const canvas = wrapper.get(".pet-canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      x: 80,
      y: 80,
      left: 80,
      top: 80,
      right: 240,
      bottom: 240,
      width: 160,
      height: 160,
      toJSON: () => ({}),
    });

    dragDropListener?.({
      event: "tauri://drag-drop",
      id: 1,
      payload: {
        type: "drop",
        paths: [`/private/${sensitiveMarker}.txt`],
        position: { x: 160, y: 160 },
      },
    });
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith(
      "handle_pet_file_drop",
      expect.objectContaining({
        paths: [`/private/${sensitiveMarker}.txt`],
        pointer: expect.objectContaining({ localX: 80, localY: 80 }),
      }),
    );
    expect(rendererPlay).toHaveBeenCalledWith("feed_react", 1_100);
    expect(wrapper.html()).not.toContain(sensitiveMarker);
    wrapper.unmount();
  });

  test("Rust 后台抛掷事件驱动 land 动画而不要求逐帧 IPC", async () => {
    const invoke = vi.fn<InvokeMock>(async (command) => {
      if (command === "current_pet_pack") {
        return createPack();
      }
      if (command === "complete_pet_action") {
        return { kind: "ignored" };
      }
      throw new Error(`unexpected command: ${command}`);
    });
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

    interactionListener?.({
      event: "pet-interaction",
      id: 2,
      payload: {
        kind: "action",
        revision: 12,
        action: "land",
        holdMs: 320,
        completeOnFinish: true,
      },
    });
    await flushPromises();

    expect(rendererPlay).toHaveBeenCalledWith("land", 320);
    wrapper.unmount();
  });

  test("首个动作帧渲染后立即回报可见反馈而不等待动作结束", async () => {
    let finishPlayback: (() => void) | undefined;
    rendererPlay.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishPlayback = resolve;
        }),
    );
    const invoke = vi.fn<InvokeMock>(async (command) => {
      if (command === "current_pet_pack") {
        return createPack();
      }
      if (command === "complete_pet_action") {
        return { kind: "ignored" };
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const emit = vi.fn<EmitMock>().mockResolvedValue(undefined);
    const wrapper = mount(PetWindow, {
      global: {
        provide: {
          [platformKey as symbol]: platform(invoke, emit),
        },
      },
    });
    await flushPromises();

    interactionListener?.({
      event: "pet-interaction",
      id: 2,
      payload: {
        kind: "action",
        revision: 18,
        action: "tap_react",
        holdMs: 620,
        completeOnFinish: true,
      },
    });
    await flushPromises();

    expect(emit).toHaveBeenCalledWith("pet-interaction-visible", {
      revision: 18,
      action: "tap_react",
    });
    expect(invoke).not.toHaveBeenCalledWith(
      "complete_pet_action",
      expect.anything(),
    );

    finishPlayback?.();
    await flushPromises();
    wrapper.unmount();
  });

  test("晚到的旧 revision 事件不会覆盖更新动作", async () => {
    const invoke = vi.fn<InvokeMock>(async (command) => {
      if (command === "current_pet_pack") {
        return createPack();
      }
      throw new Error(`unexpected command: ${command}`);
    });
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

    interactionListener?.({
      event: "pet-interaction",
      id: 2,
      payload: {
        kind: "action",
        revision: 12,
        action: "land",
        holdMs: 320,
        completeOnFinish: false,
      },
    });
    await flushPromises();
    interactionListener?.({
      event: "pet-interaction",
      id: 3,
      payload: {
        kind: "action",
        revision: 11,
        action: "tap_react",
        holdMs: 620,
        completeOnFinish: false,
      },
    });
    await flushPromises();

    expect(rendererPlay).toHaveBeenCalledTimes(1);
    expect(rendererPlay).toHaveBeenCalledWith("land", 320);
    wrapper.unmount();
  });

  test("pointercancel 走取消命令且不伪装成释放", async () => {
    const invoke = vi.fn<InvokeMock>(async (command) => {
      if (command === "current_pet_pack") {
        return createPack();
      }
      if (command === "begin_pet_pointer") {
        return { kind: "captured", captureId: 13 };
      }
      if (command === "cancel_pet_pointer") {
        return { kind: "ignored" };
      }
      throw new Error(`unexpected command: ${command}`);
    });
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
    const canvas = wrapper.get(".pet-canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 160,
      bottom: 160,
      width: 160,
      height: 160,
      toJSON: () => ({}),
    });
    const dispatch = (type: string) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: 80,
        clientY: 80,
      });
      Object.defineProperty(event, "pointerId", { value: 6 });
      canvas.element.dispatchEvent(event);
    };

    dispatch("pointerdown");
    await flushPromises();
    dispatch("pointercancel");
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith("cancel_pet_pointer", {
      captureId: 13,
    });
    expect(invoke).not.toHaveBeenCalledWith(
      "end_pet_pointer",
      expect.anything(),
    );
    wrapper.unmount();
  });

  test("终止 IPC 失败后清理捕获状态并允许下一次点击", async () => {
    let captureId = 30;
    const invoke = vi.fn<InvokeMock>(async (command) => {
      if (command === "current_pet_pack") {
        return createPack();
      }
      if (command === "begin_pet_pointer") {
        captureId += 1;
        return { kind: "captured", captureId };
      }
      if (command === "end_pet_pointer") {
        throw new Error("temporary IPC failure");
      }
      if (command === "cancel_pet_pointer") {
        return { kind: "ignored" };
      }
      throw new Error(`unexpected command: ${command}`);
    });
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
    const canvas = wrapper.get(".pet-canvas");
    vi.spyOn(canvas.element, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 160,
      bottom: 160,
      width: 160,
      height: 160,
      toJSON: () => ({}),
    });
    const dispatch = (type: string, pointerId: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: 80,
        clientY: 80,
      });
      Object.defineProperty(event, "pointerId", { value: pointerId });
      canvas.element.dispatchEvent(event);
    };

    dispatch("pointerdown", 40);
    await flushPromises();
    dispatch("pointerup", 40);
    await flushPromises();
    dispatch("pointerdown", 41);
    await flushPromises();

    expect(
      invoke.mock.calls.filter(([command]) => command === "begin_pet_pointer"),
    ).toHaveLength(2);
    wrapper.unmount();
  });

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
    expect(rendererPlayUntilStopped).toHaveBeenCalledOnce();
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

  test("尺寸和安静模式只跟随 Rust 产品状态快照与事件", async () => {
    const wrapper = mount(PetWindow, {
      global: {
        provide: {
          [platformKey as symbol]: platform(
            vi.fn<InvokeMock>().mockResolvedValue(createPack()),
            vi.fn<EmitMock>().mockResolvedValue(undefined),
          ),
        },
      },
    });
    await flushPromises();

    expect(wrapper.get("main").attributes("data-pet-size")).toBe("medium");
    expect(wrapper.get("main").attributes("data-quiet-mode")).toBe("false");

    const next = productSnapshot();
    next.preferences.petSize = "small";
    next.session.quietMode = true;
    productStateListener?.({
      event: "product-state",
      id: 1,
      payload: next,
    });
    await flushPromises();

    expect(wrapper.get("main").attributes("data-pet-size")).toBe("small");
    expect(wrapper.get("main").attributes("data-quiet-mode")).toBe("true");
    expect(rendererStop).toHaveBeenCalledOnce();

    next.session.quietMode = false;
    productStateListener?.({
      event: "product-state",
      id: 2,
      payload: next,
    });
    await flushPromises();

    expect(rendererPlayUntilStopped).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
