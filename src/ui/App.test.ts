// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App.vue";
import type { PetPackPayload } from "./types";

const {
  dragDropListeners,
  eventListeners,
  invoke,
  nativeListen,
  rendererClear,
  rendererMount,
  rendererPlay,
  startDragging,
} = vi.hoisted(() => ({
    dragDropListeners: [] as Array<
      (event: {
        payload: { type: string; paths?: string[] };
      }) => void
    >,
    eventListeners: new Map<string, (event: { payload: unknown }) => void>(),
    invoke: vi.fn(() => new Promise(() => undefined)),
    nativeListen: vi.fn(
      (
        event: string,
        listener: (event: { payload: unknown }) => void,
      ): Promise<() => void> => {
        eventListeners.set(event, listener);
        return Promise.resolve(() => eventListeners.delete(event));
      },
    ),
    rendererClear: vi.fn(),
    rendererMount: vi.fn(() => Promise.resolve()),
    rendererPlay: vi.fn((_action: string, _holdMs: number) =>
      Promise.resolve(),
    ),
    startDragging: vi.fn(() => Promise.resolve()),
  }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: nativeListen,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    hide: vi.fn(() => Promise.resolve()),
    onDragDropEvent: vi.fn(
      (
        listener: (event: {
          payload: { type: string; paths?: string[] };
        }) => void,
      ) => {
        dragDropListeners.push(listener);
        return Promise.resolve(() => undefined);
      },
    ),
    startDragging,
  }),
}));

vi.mock("./pet-renderer", () => ({
  PetRenderer: class {
    async mount(): Promise<void> {
      await rendererMount();
    }

    async play(action: string, holdMs: number): Promise<void> {
      await rendererPlay(action, holdMs);
    }

    clear(): void {
      rendererClear();
    }

    stop(): void {}

    destroy(): void {}
  },
}));

afterEach(() => {
  dragDropListeners.length = 0;
  eventListeners.clear();
  nativeListen.mockReset();
  nativeListen.mockImplementation(
    (
      event: string,
      listener: (event: { payload: unknown }) => void,
    ): Promise<() => void> => {
      eventListeners.set(event, listener);
      return Promise.resolve(() => eventListeners.delete(event));
    },
  );
  rendererClear.mockReset();
  rendererMount.mockReset();
  rendererMount.mockResolvedValue(undefined);
  rendererPlay.mockReset();
  rendererPlay.mockResolvedValue(undefined);
});

function createPack(
  canvas = { width: 1, height: 1 },
  version = "1.2.3",
  revision = 1,
): PetPackPayload {
  return {
    revision,
    manifest: {
      schemaVersion: 1,
      id: "test-cat",
      version,
      displayName: "Test Cat",
      description: "Fixture",
      canvas,
      actions: {},
    },
    atlas: {
      imagePath: "atlas.png",
      pixelWidth: 1,
      pixelHeight: 1,
      frames: {},
    },
    summary: {
      id: "test-cat",
      version,
      displayName: "Test Cat",
      description: "Fixture",
      canvas,
      atlasImage: "atlas.png",
      actionCount: 0,
      frameCount: 0,
      actions: [],
      warnings: [],
    },
    imageUrl: "asset://atlas.png",
  } as PetPackPayload;
}

describe("窗口拖动柄", () => {
  afterEach(() => {
    invoke.mockClear();
    startDragging.mockClear();
  });

  it("从可识别的专用入口发起窗口拖动", async () => {
    const wrapper = mount(App);

    const handle = wrapper.get('button[aria-label="拖动窗口"]');
    await handle.trigger("pointerdown");

    expect(startDragging).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});

describe("宠物包状态", () => {
  afterEach(() => {
    invoke.mockReset();
  });

  it("重新加载失败后不再保留旧宠物包的成功状态", async () => {
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack())
      .mockRejectedValueOnce({
        code: "pet-pack.invalid",
        message: "示例宠物包未通过校验",
        details: [
          {
            severity: "error",
            code: "json.invalid",
            path: "pet.json",
            message: "JSON 无效",
          },
        ],
      });
    const wrapper = mount(App);
    await flushPromises();
    expect(wrapper.text()).toContain("校验通过");

    const reload = wrapper
      .findAll("button")
      .find((button) => button.text().includes("重新加载示例宠物包"));
    expect(reload).toBeDefined();
    await reload!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("示例宠物包未通过校验");
    expect(wrapper.text()).not.toContain("校验通过");
    expect(wrapper.find(".pack-stats").exists()).toBe(false);
    expect(rendererClear).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("在宠物包摘要中持续显示版本号", async () => {
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack());
    const wrapper = mount(App);
    await flushPromises();

    const summary = wrapper.get(".pack-stats");
    expect(summary.text()).toContain("版本");
    expect(summary.text()).toContain("1.2.3");
    wrapper.unmount();
  });

  it("在宠物包摘要中显示完整画布尺寸", async () => {
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack({ width: 2, height: 3 }));
    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.get(".pack-stats").text()).toContain("2×3");
    wrapper.unmount();
  });

  it("菜单栏重载的渲染失败不会伪报成功", async () => {
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack());
    const wrapper = mount(App);
    await flushPromises();
    rendererMount.mockRejectedValueOnce(new Error("图集加载失败"));

    eventListeners.get("pet-pack-reloaded")!({ payload: createPack() });
    await flushPromises();

    expect(wrapper.text()).toContain("图集加载失败");
    expect(wrapper.text()).not.toContain("已从菜单栏重新加载示例宠物包");
    expect(wrapper.find(".pack-stats").exists()).toBe(false);
    wrapper.unmount();
  });

  it("成功重载挂载期间禁用行为入口", async () => {
    let resolveReloadMount!: () => void;
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack());
    const wrapper = mount(App);
    await flushPromises();
    rendererMount.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReloadMount = resolve;
        }),
    );

    eventListeners.get("pet-pack-reloaded")!({
      payload: createPack({ width: 1, height: 1 }, "2.0.0", 2),
    });
    await vi.waitFor(() => expect(rendererMount).toHaveBeenCalledTimes(2));

    for (const label of ["运行最小时间线", "点击反馈", "模拟投喂"]) {
      const action = wrapper
        .findAll("button")
        .find((button) => button.text().includes(label));
      expect(action).toBeDefined();
      expect(action!.attributes("disabled")).toBeDefined();
    }

    resolveReloadMount();
    await flushPromises();
    wrapper.unmount();
  });

  it("成功重载挂载期间忽略原生文件拖放动作", async () => {
    let resolveReloadMount!: () => void;
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack());
    const wrapper = mount(App);
    await flushPromises();
    rendererMount.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReloadMount = resolve;
        }),
    );

    eventListeners.get("pet-pack-reloaded")!({
      payload: createPack({ width: 1, height: 1 }, "2.0.0", 2),
    });
    await vi.waitFor(() => expect(rendererMount).toHaveBeenCalledTimes(2));
    expect(dragDropListeners).toHaveLength(1);
    dragDropListeners[0]!({
      payload: {
        type: "drop",
        paths: ["/tmp/snack.png"],
      },
    });
    await flushPromises();

    expect(invoke).not.toHaveBeenCalledWith("trigger_preview_action", {
      action: "feed_react",
    });
    expect(wrapper.text()).not.toContain("收到 1 个文件投喂");
    resolveReloadMount();
    await flushPromises();
    wrapper.unmount();
  });

  it("过期的按钮重载结果不会覆盖较新的菜单栏结果", async () => {
    let resolveButtonReload!: (pack: PetPackPayload) => void;
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveButtonReload = resolve;
          }),
      );
    const wrapper = mount(App);
    await flushPromises();
    const reload = wrapper
      .findAll("button")
      .find((button) => button.text().includes("重新加载示例宠物包"));
    expect(reload).toBeDefined();

    await reload!.trigger("click");
    eventListeners.get("pet-pack-reloaded")!({
      payload: createPack({ width: 1, height: 1 }, "2.0.0", 3),
    });
    await flushPromises();
    resolveButtonReload(createPack({ width: 1, height: 1 }, "1.5.0", 2));
    await flushPromises();

    expect(wrapper.get(".pack-stats").text()).toContain("2.0.0");
    expect(wrapper.get(".pack-stats").text()).not.toContain("1.5.0");
    wrapper.unmount();
  });

  it("较新 revision 挂载完成后不再等待旧重载解除行为入口", async () => {
    let resolveButtonReload!: (pack: PetPackPayload) => void;
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveButtonReload = resolve;
          }),
      );
    const wrapper = mount(App);
    await flushPromises();
    const reload = wrapper
      .findAll("button")
      .find((button) => button.text().includes("重新加载示例宠物包"));
    expect(reload).toBeDefined();

    await reload!.trigger("click");
    eventListeners.get("pet-pack-reloaded")!({
      payload: createPack({ width: 1, height: 1 }, "2.0.0", 3),
    });
    await vi.waitFor(() =>
      expect(wrapper.get(".pack-stats").text()).toContain("2.0.0"),
    );

    const trigger = wrapper
      .findAll("button")
      .find((button) => button.text().includes("点击反馈"));
    expect(trigger).toBeDefined();
    expect(trigger!.attributes("disabled")).toBeUndefined();

    resolveButtonReload(createPack({ width: 1, height: 1 }, "1.5.0", 2));
    await flushPromises();
    wrapper.unmount();
  });

  it("较新的按钮结果会覆盖先返回的旧菜单栏结果", async () => {
    let resolveButtonReload!: (pack: PetPackPayload) => void;
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack({ width: 1, height: 1 }, "1.0.0", 1))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveButtonReload = resolve;
          }),
      );
    const wrapper = mount(App);
    await flushPromises();
    const reload = wrapper
      .findAll("button")
      .find((button) => button.text().includes("重新加载示例宠物包"));
    expect(reload).toBeDefined();

    await reload!.trigger("click");
    eventListeners.get("pet-pack-reloaded")!({
      payload: createPack({ width: 1, height: 1 }, "2.0.0", 2),
    });
    await flushPromises();
    resolveButtonReload(createPack({ width: 1, height: 1 }, "3.0.0", 3));
    await flushPromises();

    expect(wrapper.get(".pack-stats").text()).toContain("3.0.0");
    expect(wrapper.get(".pack-stats").text()).not.toContain("2.0.0");
    wrapper.unmount();
  });

  it("较新结果生效后忽略旧 revision 的挂载失败", async () => {
    let rejectOlderMount!: (error: Error) => void;
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack({ width: 1, height: 1 }, "1.0.0", 1));
    const wrapper = mount(App);
    await flushPromises();
    rendererMount
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectOlderMount = reject;
          }),
      )
      .mockResolvedValueOnce(undefined);

    eventListeners.get("pet-pack-reloaded")!({
      payload: createPack({ width: 1, height: 1 }, "2.0.0", 2),
    });
    await vi.waitFor(() => expect(rendererMount).toHaveBeenCalledTimes(2));
    eventListeners.get("pet-pack-reloaded")!({
      payload: createPack({ width: 1, height: 1 }, "3.0.0", 3),
    });
    await flushPromises();
    rejectOlderMount(new Error("旧图集加载失败"));
    await flushPromises();

    expect(wrapper.get(".pack-stats").text()).toContain("3.0.0");
    expect(wrapper.text()).not.toContain("旧图集加载失败");
    expect(rendererClear).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("较新结果生效后忽略旧菜单重载的双重失败事件", async () => {
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack({ width: 1, height: 1 }, "1.0.0", 1));
    const wrapper = mount(App);
    await flushPromises();

    eventListeners.get("pet-pack-reloaded")!({
      payload: createPack({ width: 1, height: 1 }, "3.0.0", 3),
    });
    await flushPromises();
    const staleFailure = {
      code: "pet-pack.invalid",
      message: "旧菜单重载失败",
      details: ["旧错误"],
      revision: 2,
    };
    eventListeners.get("pet-pack-load-failed")!({
      payload: staleFailure,
    });
    eventListeners.get("shell-operation-failed")!({
      payload: staleFailure,
    });
    await flushPromises();

    expect(wrapper.get(".pack-stats").text()).toContain("3.0.0");
    expect(wrapper.text()).not.toContain("旧菜单重载失败");
    expect(wrapper.text()).not.toContain("旧错误");
    wrapper.unmount();
  });

  it("宠物包失败清场后忽略挂起时间线返回的旧步骤", async () => {
    let resolveStep!: (step: {
      action: string;
      holdMs: number;
      reason: string;
    }) => void;
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStep = resolve;
          }),
      );
    const wrapper = mount(App);
    await flushPromises();
    const runTimeline = wrapper
      .findAll("button")
      .find((button) => button.text().includes("运行最小时间线"));
    expect(runTimeline).toBeDefined();

    await runTimeline!.trigger("click");
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("next_preview_action"),
    );
    eventListeners.get("pet-pack-load-failed")!({
      payload: {
        code: "pet-pack.invalid",
        message: "较新的宠物包失败",
        details: [],
        revision: 2,
      },
    });
    resolveStep({
      action: "idle",
      holdMs: 100,
      reason: "旧时间线步骤",
    });
    await flushPromises();

    expect(wrapper.text()).toContain("较新的宠物包失败");
    expect(wrapper.text()).not.toContain("旧时间线步骤");
    expect(rendererPlay).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("宠物包失败清场后忽略挂起时间线返回的旧错误", async () => {
    let rejectStep!: (error: Error) => void;
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack())
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectStep = reject;
          }),
      );
    const wrapper = mount(App);
    await flushPromises();
    const runTimeline = wrapper
      .findAll("button")
      .find((button) => button.text().includes("运行最小时间线"));
    expect(runTimeline).toBeDefined();

    await runTimeline!.trigger("click");
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("next_preview_action"),
    );
    eventListeners.get("pet-pack-load-failed")!({
      payload: {
        code: "pet-pack.invalid",
        message: "较新的宠物包失败",
        details: [],
        revision: 2,
      },
    });
    rejectStep(new Error("旧时间线失败"));
    await flushPromises();

    expect(wrapper.text()).toContain("较新的宠物包失败");
    expect(wrapper.text()).not.toContain("旧时间线失败");
    expect(rendererPlay).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("宠物包失败清场后忽略挂起交互返回的旧动作", async () => {
    let resolveStep!: (step: {
      action: string;
      holdMs: number;
      reason: string;
    }) => void;
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStep = resolve;
          }),
      );
    const wrapper = mount(App);
    await flushPromises();
    const trigger = wrapper
      .findAll("button")
      .find((button) => button.text().includes("点击反馈"));
    expect(trigger).toBeDefined();

    await trigger!.trigger("click");
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("trigger_preview_action", {
        action: "tap_react",
      }),
    );
    eventListeners.get("pet-pack-load-failed")!({
      payload: {
        code: "pet-pack.invalid",
        message: "较新的宠物包失败",
        details: [],
        revision: 2,
      },
    });
    resolveStep({
      action: "tap_react",
      holdMs: 100,
      reason: "旧点击动作",
    });
    await flushPromises();

    expect(wrapper.text()).toContain("较新的宠物包失败");
    expect(wrapper.text()).not.toContain("旧点击动作");
    expect(rendererPlay).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("宠物包失败清场后忽略挂起交互返回的旧错误", async () => {
    let rejectStep!: (error: Error) => void;
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack())
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectStep = reject;
          }),
      );
    const wrapper = mount(App);
    await flushPromises();
    const trigger = wrapper
      .findAll("button")
      .find((button) => button.text().includes("点击反馈"));
    expect(trigger).toBeDefined();

    await trigger!.trigger("click");
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("trigger_preview_action", {
        action: "tap_react",
      }),
    );
    eventListeners.get("pet-pack-load-failed")!({
      payload: {
        code: "pet-pack.invalid",
        message: "较新的宠物包失败",
        details: [],
        revision: 2,
      },
    });
    rejectStep(new Error("旧点击失败"));
    await flushPromises();

    expect(wrapper.text()).toContain("较新的宠物包失败");
    expect(wrapper.text()).not.toContain("旧点击失败");
    expect(rendererPlay).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("显示托盘操作失败事件", async () => {
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack());
    const wrapper = mount(App);
    await flushPromises();

    eventListeners.get("shell-operation-failed")!({
      payload: {
        code: "shell.error",
        message: "无法隐藏窗口",
        details: [],
        revision: null,
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("无法隐藏窗口");
    wrapper.unmount();
  });
});

describe("预览工作台恢复", () => {
  afterEach(() => {
    invoke.mockClear();
  });

  it("通过 Rust 桥接导出诊断摘要并展示本地路径", async () => {
    invoke
      .mockResolvedValueOnce({
        clickThrough: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      })
      .mockResolvedValueOnce(createPack())
      .mockResolvedValueOnce("/tmp/oh-my-pets-diagnostics.md");
    const wrapper = mount(App);
    await flushPromises();

    const exportButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("导出诊断摘要"));
    expect(exportButton).toBeDefined();
    await exportButton!.trigger("click");
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith("export_diagnostics");
    expect(wrapper.text()).toContain("/tmp/oh-my-pets-diagnostics.md");
    expect(wrapper.text()).toContain("诊断摘要已写入本地日志目录");
    wrapper.unmount();
  });

  it("通过 Rust 桌宠壳收起窗口并显示失败状态", async () => {
    const wrapper = mount(App);
    invoke.mockReset();
    invoke.mockRejectedValueOnce({
      code: "shell.hide-failed",
      message: "无法收起预览工作台",
      details: [],
    });

    await wrapper.get('button[aria-label="隐藏窗口"]').trigger("click");
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith("hide_preview_window");
    expect(wrapper.text()).toContain("无法收起预览工作台");
    wrapper.unmount();
  });
});

describe("启动错误恢复", () => {
  afterEach(() => {
    invoke.mockReset();
  });

  it("壳层快照失败后仍绑定原生监听并加载宠物包", async () => {
    invoke
      .mockRejectedValueOnce({
        code: "shell.snapshot-failed",
        message: "无法读取窗口状态",
        details: [],
      })
      .mockResolvedValueOnce(createPack());

    const wrapper = mount(App);
    await flushPromises();

    expect(nativeListen).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("current_pet_pack");
    expect(wrapper.find(".pack-stats").exists()).toBe(true);
    expect(wrapper.text()).toContain(
      "窗口状态暂不可用，恢复控制仍可使用：无法读取窗口状态",
    );

    eventListeners.get("shell-state")!({
      payload: {
        clickThrough: true,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
      },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("窗口状态暂不可用");
    expect(wrapper.text()).toContain("窗口状态已恢复");
    wrapper.unmount();
  });

  it("原生监听注册中途失败时清理已注册监听并显示错误", async () => {
    const firstUnlisten = vi.fn();
    invoke.mockResolvedValueOnce({
      clickThrough: false,
      alwaysOnTop: true,
      visibleOnAllWorkspaces: true,
    });
    nativeListen
      .mockResolvedValueOnce(firstUnlisten)
      .mockRejectedValueOnce(new Error("原生事件监听注册失败"));

    const wrapper = mount(App);
    await flushPromises();

    expect(firstUnlisten).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain("原生事件监听注册失败");
    wrapper.unmount();
  });
});
