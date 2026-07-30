import type { Platform } from "./platform";
import type {
  ActivityFrequency,
  AtlasManifest,
  BehaviorStep,
  PetManifest,
  PetPackPayload,
  PetSize,
  ProductStateSnapshot,
  ShellSnapshot,
} from "./types";

const shell: ShellSnapshot = {
  clickThrough: false,
  alwaysOnTop: true,
  visibleOnAllWorkspaces: true,
};
const productState: ProductStateSnapshot = {
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
    message: "浏览器测试使用内存偏好",
  },
};
const eventListeners = new Map<
  string,
  Set<(event: { event: string; id: number; payload: unknown }) => void>
>();
let eventId = 0;

function publishProductState(): void {
  eventId += 1;
  for (const listener of eventListeners.get("product-state") ?? []) {
    listener({
      event: "product-state",
      id: eventId,
      payload: structuredClone(productState),
    });
  }
}
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
    case "product_state_snapshot":
      result = productState;
      break;
    case "current_pet_pack":
    case "reload_example_pet_pack":
      result = await loadPack();
      break;
    case "set_click_through":
      shell.clickThrough = Boolean(args?.enabled);
      productState.session.clickThrough = shell.clickThrough;
      publishProductState();
      result = { ...shell };
      break;
    case "set_pet_size":
      productState.preferences.petSize = String(args?.petSize) as PetSize;
      publishProductState();
      result = productState;
      break;
    case "set_activity_frequency":
      productState.preferences.activityFrequency = String(
        args?.activityFrequency,
      ) as ActivityFrequency;
      publishProductState();
      result = productState;
      break;
    case "set_launch_at_login":
      productState.preferences.launchAtLogin = Boolean(args?.enabled);
      publishProductState();
      result = productState;
      break;
    case "set_quiet_mode":
      productState.session.quietMode = Boolean(args?.enabled);
      publishProductState();
      result = productState;
      break;
    case "replay_onboarding":
      productState.preferences.onboardingSeen = false;
      publishProductState();
      result = productState;
      break;
    case "next_preview_action":
      result = previewStep("idle");
      break;
    case "trigger_preview_action":
      result = previewStep(String(args?.action ?? "idle"));
      break;
    case "reset_window_position":
      result = undefined;
      break;
    case "hide_preview_window":
      productState.session.petHidden = true;
      publishProductState();
      result = productState;
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
  async listen(event, listener) {
    const listeners = eventListeners.get(event) ?? new Set();
    listeners.add(
      listener as (event: {
        event: string;
        id: number;
        payload: unknown;
      }) => void,
    );
    eventListeners.set(event, listeners);
    return () => {
      listeners.delete(
        listener as (event: {
          event: string;
          id: number;
          payload: unknown;
        }) => void,
      );
    };
  },
  getCurrentWindow: () => ({
    async onDragDropEvent() {
      return () => undefined;
    },
    async startDragging() {},
  }),
};
