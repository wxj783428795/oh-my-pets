import type { Platform } from "./platform";
import type {
  AtlasManifest,
  BehaviorStep,
  PetManifest,
  PetPackPayload,
  ShellSnapshot,
} from "./types";

const shell: ShellSnapshot = {
  clickThrough: false,
  alwaysOnTop: true,
  visibleOnAllWorkspaces: true,
};
let revision = 0;
let initialPackFailuresRemaining =
  new URLSearchParams(window.location.search).get(
    "browserTestInitialPackFailure",
  ) === "1"
    ? 2
    : 0;
let fixturePromise:
  | Promise<{
      manifest: PetManifest;
      atlas: AtlasManifest;
    }>
  | undefined;

async function readFixture(): Promise<{
  manifest: PetManifest;
  atlas: AtlasManifest;
}> {
  fixturePromise ??= Promise.all([
    fetch("/pets/juanjuan/pet.json"),
    fetch("/pets/juanjuan/atlas.json"),
  ]).then(async ([manifestResponse, atlasResponse]) => {
    if (!manifestResponse.ok || !atlasResponse.ok) {
      throw new Error("浏览器测试无法读取仓库内示例宠物包");
    }
    return {
      manifest: (await manifestResponse.json()) as PetManifest,
      atlas: (await atlasResponse.json()) as AtlasManifest,
    };
  });
  return fixturePromise;
}

async function createPack(currentRevision: number): Promise<PetPackPayload> {
  const { atlas, manifest } = await readFixture();
  return {
    revision: currentRevision,
    manifest,
    atlas,
    summary: {
      id: manifest.id,
      version: manifest.version,
      displayName: manifest.displayName,
      description: manifest.description,
      canvas: manifest.canvas,
      atlasImage: atlas.imagePath,
      actionCount: Object.keys(manifest.actions).length,
      frameCount: Object.keys(atlas.frames).length,
      actions: Object.entries(manifest.actions).map(([name, action]) => ({
        name,
        frameCount: action.frames.length,
        durationMs: action.frames.reduce(
          (duration, frame) => duration + frame.durationMs,
          0,
        ),
        loops: action.loop,
      })),
      warnings: [],
    },
    imageUrl: "/pets/juanjuan/atlas.png",
  };
}

async function loadPack(): Promise<PetPackPayload> {
  revision += 1;
  if (initialPackFailuresRemaining > 0) {
    initialPackFailuresRemaining -= 1;
    throw {
      code: "pet-pack.invalid",
      message: "浏览器测试注入的宠物包读取失败",
      details: [
        {
          severity: "error",
          code: "browser-test.injected",
          path: "assets/pets/juanjuan/pet.json",
          message: "受控失败仅用于验证 Web 恢复路径",
        },
      ],
      revision,
    };
  }
  return createPack(revision);
}

function previewStep(action: string): BehaviorStep {
  return {
    action,
    reason: `浏览器测试固定动作：${action}`,
    holdMs: 100,
  };
}

async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  let result: unknown;
  switch (command) {
    case "shell_snapshot":
      result = { ...shell };
      break;
    case "current_pet_pack":
    case "reload_example_pet_pack":
      result = await loadPack();
      break;
    case "set_click_through":
      shell.clickThrough = Boolean(args?.enabled);
      result = { ...shell };
      break;
    case "next_preview_action":
      result = previewStep("idle");
      break;
    case "trigger_preview_action":
      result = previewStep(String(args?.action ?? "idle"));
      break;
    case "reset_window_position":
    case "hide_preview_window":
      result = undefined;
      break;
    case "export_diagnostics":
      result = "target/playwright/browser-test-diagnostics.md";
      break;
    default:
      throw new Error(`浏览器测试 seam 不支持命令：${command}`);
  }
  return structuredClone(result) as T;
}

export const browserTestPlatform: Platform = {
  invoke,
  async emit() {},
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
