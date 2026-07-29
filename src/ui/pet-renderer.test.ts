// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { PetRenderer } from "./pet-renderer";
import type { PetPackPayload } from "./types";

const {
  appDestroy,
  appInit,
  assetLoad,
  assetSetPreferences,
  assetUnload,
  destroyedSprites,
  destroyedTextures,
  renderedFrames,
} = vi.hoisted(() => ({
  appDestroy: vi.fn<() => void>(),
  appInit: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  assetLoad: vi.fn<() => Promise<{ source: object }>>(() =>
    Promise.resolve({ source: {} }),
  ),
  assetSetPreferences: vi.fn<(options: unknown) => void>(),
  assetUnload: vi.fn<(assetUrl: string) => Promise<void>>(() =>
    Promise.resolve(),
  ),
  destroyedSprites: [] as boolean[],
  destroyedTextures: [] as boolean[],
  renderedFrames: [] as Array<number | null>,
}));

vi.mock("pixi.js", () => {
  class MockRectangle {
    constructor(
      readonly x: number,
      readonly y: number,
      readonly width: number,
      readonly height: number,
    ) {}
  }

  class MockTexture {
    readonly source: object;
    readonly frame?: MockRectangle;

    constructor(options: { source: object; frame?: MockRectangle }) {
      this.source = options.source;
      this.frame = options.frame;
    }

    destroy(): void {
      destroyedTextures.push(true);
    }
  }

  class MockSprite {
    texture: MockTexture;
    readonly position = { set: vi.fn<(x: number, y: number) => void>() };

    constructor(texture: MockTexture) {
      this.texture = texture;
    }

    destroy(): void {
      destroyedSprites.push(true);
    }
  }

  class MockApplication {
    readonly canvas = document.createElement("canvas");
    readonly ticker = { stop: vi.fn<() => void>() };
    readonly stage = {
      children: [] as MockSprite[],
      removeChildren: () => {
        this.stage.children = [];
      },
      addChild: (sprite: MockSprite) => {
        this.stage.children.push(sprite);
      },
    };
    readonly renderer = {
      resize: vi.fn<(width: number, height: number) => void>(),
      render: () => {
        const sprite = this.stage.children.at(-1);
        const x = sprite?.texture.frame?.x;
        renderedFrames.push(x ?? null);
      },
    };

    async init(): Promise<void> {
      await appInit();
    }

    destroy(): void {
      appDestroy();
    }
  }

  return {
    Application: MockApplication,
    Assets: {
      load: assetLoad,
      setPreferences: assetSetPreferences,
      unload: assetUnload,
    },
    Rectangle: MockRectangle,
    Sprite: MockSprite,
    Texture: MockTexture,
  };
});

function createPack(): PetPackPayload {
  const frames = [
    { ref: "first", durationMs: 10 },
    { ref: "second", durationMs: 10 },
  ];
  return {
    revision: 1,
    manifest: {
      schemaVersion: 1,
      id: "test-cat",
      version: "1.0.0",
      displayName: "Test Cat",
      description: "Fixture",
      canvas: { width: 2, height: 1 },
      actions: {
        one_shot: { loop: false, frames, cuePoints: [] },
        repeating: { loop: true, frames, cuePoints: [] },
      },
    },
    atlas: {
      imagePath: "atlas.png",
      pixelWidth: 2,
      pixelHeight: 1,
      frames: {
        first: { x: 0, y: 0, w: 1, h: 1, offsetX: 0, offsetY: 0 },
        second: { x: 1, y: 0, w: 1, h: 1, offsetX: 1, offsetY: 0 },
      },
    },
    summary: {
      id: "test-cat",
      version: "1.0.0",
      displayName: "Test Cat",
      description: "Fixture",
      canvas: { width: 2, height: 1 },
      atlasImage: "atlas.png",
      actionCount: 2,
      frameCount: 2,
      actions: [],
      warnings: [],
    },
    imageUrl: "asset://atlas.png",
  };
}

describe("宠物动作播放", () => {
  afterEach(() => {
    vi.useRealTimers();
    appDestroy.mockReset();
    appInit.mockReset();
    appInit.mockResolvedValue(undefined);
    assetLoad.mockReset();
    assetLoad.mockResolvedValue({ source: {} });
    assetSetPreferences.mockReset();
    assetUnload.mockReset();
    assetUnload.mockResolvedValue(undefined);
    destroyedSprites.length = 0;
    destroyedTextures.length = 0;
    renderedFrames.length = 0;
  });

  it("使用 WebKit 可用的图片元素路径加载内联图集", () => {
    const renderer = new PetRenderer();

    expect(assetSetPreferences).toHaveBeenCalledWith({
      preferCreateImageBitmap: false,
      preferWorkers: false,
    });
    renderer.destroy();
  });

  it("按动作声明决定停在末帧或循环播放", async () => {
    vi.useFakeTimers();
    const renderer = new PetRenderer();
    await renderer.mount(document.createElement("div"), createPack());
    renderedFrames.length = 0;

    const oneShot = renderer.play("one_shot", 35);
    await vi.advanceTimersByTimeAsync(35);
    await oneShot;
    expect(renderedFrames).toEqual([0, 1]);

    renderedFrames.length = 0;
    const repeating = renderer.play("repeating", 35);
    await vi.advanceTimersByTimeAsync(35);
    await repeating;
    expect(renderedFrames).toEqual([0, 1, 0, 1]);

    renderer.destroy();
  });

  it("重新挂载前释放旧场景并在加载失败时保持空画布", async () => {
    const renderer = new PetRenderer();
    const host = document.createElement("div");
    await renderer.mount(host, createPack());
    renderedFrames.length = 0;
    assetLoad.mockRejectedValueOnce(new Error("图集加载失败"));

    await expect(renderer.mount(host, createPack())).rejects.toThrow(
      "图集加载失败",
    );

    expect(destroyedSprites).toHaveLength(1);
    expect(destroyedTextures).toHaveLength(2);
    expect(renderedFrames).toEqual([null]);
    renderer.destroy();
  });

  it("主动清理时释放当前场景并显示空画布", async () => {
    const renderer = new PetRenderer();
    await renderer.mount(document.createElement("div"), createPack());
    renderedFrames.length = 0;

    renderer.clear();

    expect(destroyedSprites).toHaveLength(1);
    expect(destroyedTextures).toHaveLength(2);
    expect(renderedFrames).toEqual([null]);
    expect(assetUnload).toHaveBeenCalledWith("asset://atlas.png");
    renderer.destroy();
  });

  it("图集加载完成后清理仍会阻止旧挂载重新建立场景", async () => {
    let resolveLoad!: (texture: { source: object }) => void;
    assetLoad.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const renderer = new PetRenderer();
    const mounting = renderer.mount(
      document.createElement("div"),
      createPack(),
    );
    await vi.waitFor(() => expect(assetLoad).toHaveBeenCalledOnce());

    resolveLoad({ source: {} });
    await Promise.resolve();
    renderer.clear();
    await mounting;

    expect(renderedFrames.at(-1)).toBeNull();
    expect(destroyedSprites).toHaveLength(0);
    renderer.destroy();
  });

  it("并发挂载乱序完成时只显示最新宠物包", async () => {
    let resolveFirst!: (texture: { source: object }) => void;
    let resolveSecond!: (texture: { source: object }) => void;
    assetLoad
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const renderer = new PetRenderer();
    const host = document.createElement("div");
    const firstPack = createPack();
    const secondPack = createPack();
    secondPack.imageUrl = "asset://new-atlas.png";
    secondPack.atlas.frames.first.x = 10;
    secondPack.atlas.frames.second.x = 11;

    const firstMount = renderer.mount(host, firstPack);
    await vi.waitFor(() => expect(assetLoad).toHaveBeenCalledTimes(1));
    const secondMount = renderer.mount(host, secondPack);
    await vi.waitFor(() => expect(assetLoad).toHaveBeenCalledTimes(2));
    resolveSecond({ source: {} });
    await secondMount;
    resolveFirst({ source: {} });
    await firstMount;

    expect(renderedFrames.at(-1)).toBe(10);
    expect(assetUnload).toHaveBeenCalledWith(firstPack.imageUrl);
    expect(assetUnload).not.toHaveBeenCalledWith(secondPack.imageUrl);
    renderer.destroy();
  });

  it("同一资源并发挂载时旧结果不会卸载最新场景的图集", async () => {
    let resolveFirst!: (texture: { source: object }) => void;
    let resolveSecond!: (texture: { source: object }) => void;
    assetLoad
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const renderer = new PetRenderer();
    const host = document.createElement("div");
    const firstPack = createPack();
    const secondPack = createPack();
    secondPack.atlas.frames.first.x = 20;
    secondPack.atlas.frames.second.x = 21;

    const firstMount = renderer.mount(host, firstPack);
    await vi.waitFor(() => expect(assetLoad).toHaveBeenCalledTimes(1));
    const secondMount = renderer.mount(host, secondPack);
    await vi.waitFor(() => expect(assetLoad).toHaveBeenCalledTimes(2));
    resolveSecond({ source: {} });
    await secondMount;
    resolveFirst({ source: {} });
    await firstMount;

    expect(renderedFrames.at(-1)).toBe(20);
    expect(assetUnload).not.toHaveBeenCalled();
    renderer.destroy();
    expect(assetUnload).toHaveBeenCalledWith(firstPack.imageUrl);
  });

  it("初始化挂起时销毁会在初始化完成后释放应用", async () => {
    let resolveInit!: () => void;
    appInit.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInit = resolve;
        }),
    );
    const renderer = new PetRenderer();

    const mounting = renderer.mount(
      document.createElement("div"),
      createPack(),
    );
    await vi.waitFor(() => expect(appInit).toHaveBeenCalledOnce());
    renderer.destroy();
    expect(appDestroy).not.toHaveBeenCalled();
    resolveInit();
    await mounting;

    expect(appDestroy).toHaveBeenCalledOnce();
    expect(assetLoad).not.toHaveBeenCalled();
  });
});
