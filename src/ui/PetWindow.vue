<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import { PetRenderer } from "./pet-renderer";
import { usePlatform, type UnlistenFn } from "./platform";
import type {
  InteractionPayload,
  PetPackPayload,
  ProductStateSnapshot,
} from "./types";

const petHost = ref<HTMLElement | null>(null);
const loadFailure = ref("");
const dropActive = ref(false);
const productState = ref<ProductStateSnapshot | null>(null);
const currentAction = ref("idle");
const renderer = new PetRenderer();
const { emit, getCurrentWindow, invoke, listen } = usePlatform();
const petWindow = getCurrentWindow();
type PointerArguments = Record<string, number>;
type PointerTerminal =
  { kind: "end"; pointer: PointerArguments } | { kind: "cancel" };
let unlistenProductState: UnlistenFn | undefined;
let mountedPack: PetPackPayload | null = null;
let idlePlaybackStarted = false;
let idlePlaybackToken = 0;
let unlistenInteraction: UnlistenFn | undefined;
let unlistenDragDrop: UnlistenFn | undefined;
let activeCaptureId: number | undefined;
let activePointerId: number | undefined;
let pointerMovePending = false;
let actionRevision = 0;
let pointerGeneration = 0;
let pendingPointerMove: PointerArguments | undefined;
let pendingPointerTerminal: PointerTerminal | undefined;

function currentPendingPointerTerminal(): PointerTerminal | undefined {
  return pendingPointerTerminal;
}

function cancelPointerCapture(captureId: number): void {
  void invoke("cancel_pet_pointer", { captureId }).catch(() => undefined);
}

function pointerArguments(event: PointerEvent): PointerArguments {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return {
    localX: event.clientX - bounds.left,
    localY: event.clientY - bounds.top,
    surfaceWidth: bounds.width,
    surfaceHeight: bounds.height,
    occurredAtMs: event.timeStamp,
  };
}

async function applyInteraction(payload: InteractionPayload): Promise<void> {
  if (
    payload.kind !== "action" ||
    payload.revision === undefined ||
    !payload.action ||
    payload.holdMs === undefined
  ) {
    return;
  }
  const revision = payload.revision;
  if (revision < actionRevision) {
    return;
  }
  actionRevision = Math.max(actionRevision, revision);
  if (payload.action === "idle" && payload.completeOnFinish === false) {
    stopIdlePlayback();
    currentAction.value = "idle";
    startIdlePlayback(() => reportVisibleInteraction(revision, "idle"));
    return;
  }
  stopIdlePlayback();
  currentAction.value = payload.action;
  await renderer.play(payload.action, payload.holdMs, () => {
    reportVisibleInteraction(revision, payload.action as string);
  });
  if (revision !== actionRevision || payload.completeOnFinish === false) {
    return;
  }
  const completed = await invoke<InteractionPayload>("complete_pet_action", {
    revision,
  });
  if (completed.revision !== undefined && completed.revision > actionRevision) {
    await applyInteraction(completed);
  }
}

async function beginPointer(event: PointerEvent): Promise<void> {
  if (event.button !== 0 || activePointerId !== undefined) {
    return;
  }
  const target = event.currentTarget as HTMLElement;
  const pointerId = event.pointerId;
  const generation = ++pointerGeneration;
  activePointerId = pointerId;
  pendingPointerMove = undefined;
  pendingPointerTerminal = undefined;
  let payload: InteractionPayload;
  try {
    payload = await invoke<InteractionPayload>("begin_pet_pointer", {
      pointer: pointerArguments(event),
    });
  } catch {
    clearPointerSession(generation);
    return;
  }
  if (payload.kind !== "captured" || payload.captureId === undefined) {
    clearPointerSession(generation);
    return;
  }
  if (generation !== pointerGeneration || activePointerId !== pointerId) {
    cancelPointerCapture(payload.captureId);
    return;
  }
  activeCaptureId = payload.captureId;
  try {
    target.setPointerCapture?.(pointerId);
  } catch {
    // A rapid pointerup can end native capture before the begin IPC returns.
  }
  try {
    if (pendingPointerMove) {
      const moved = await invoke<InteractionPayload>("update_pet_pointer", {
        captureId: payload.captureId,
        pointer: pendingPointerMove,
      });
      void applyInteraction(moved);
    }
    const terminal = currentPendingPointerTerminal();
    if (terminal?.kind === "end") {
      const ended = await invoke<InteractionPayload>("end_pet_pointer", {
        captureId: payload.captureId,
        pointer: terminal.pointer,
      });
      clearPointerSession(generation);
      await applyInteraction(ended);
    } else if (terminal?.kind === "cancel") {
      const cancelled = await invoke<InteractionPayload>("cancel_pet_pointer", {
        captureId: payload.captureId,
      });
      clearPointerSession(generation);
      await applyInteraction(cancelled);
    }
  } catch {
    cancelPointerCapture(payload.captureId);
    clearPointerSession(generation);
  }
}

async function endPointer(event: PointerEvent): Promise<void> {
  if (
    activePointerId === undefined ||
    (activePointerId !== undefined && event.pointerId !== activePointerId)
  ) {
    return;
  }
  const pointer = pointerArguments(event);
  if (activeCaptureId === undefined) {
    pendingPointerTerminal ??= { kind: "end", pointer };
    return;
  }
  if (pendingPointerTerminal) {
    return;
  }
  pendingPointerTerminal = { kind: "end", pointer };
  const generation = pointerGeneration;
  const captureId = activeCaptureId;
  try {
    const payload = await invoke<InteractionPayload>("end_pet_pointer", {
      captureId,
      pointer,
    });
    await applyInteraction(payload);
  } catch {
    cancelPointerCapture(captureId);
  } finally {
    clearPointerSession(generation);
  }
}

async function updatePointer(event: PointerEvent): Promise<void> {
  if (
    pointerMovePending ||
    activePointerId === undefined ||
    pendingPointerTerminal !== undefined ||
    (activePointerId !== undefined && event.pointerId !== activePointerId)
  ) {
    return;
  }
  const pointer = pointerArguments(event);
  if (activeCaptureId === undefined) {
    pendingPointerMove = pointer;
    return;
  }
  pointerMovePending = true;
  try {
    const payload = await invoke<InteractionPayload>("update_pet_pointer", {
      captureId: activeCaptureId,
      pointer,
    });
    void applyInteraction(payload);
  } catch {
    const captureId = activeCaptureId;
    if (captureId !== undefined) {
      cancelPointerCapture(captureId);
    }
    clearPointerSession(pointerGeneration);
  } finally {
    pointerMovePending = false;
  }
}

async function cancelPointer(event: PointerEvent): Promise<void> {
  if (
    activePointerId === undefined ||
    (activePointerId !== undefined && event.pointerId !== activePointerId)
  ) {
    return;
  }
  if (activeCaptureId === undefined) {
    pendingPointerTerminal ??= { kind: "cancel" };
    return;
  }
  if (pendingPointerTerminal) {
    return;
  }
  pendingPointerTerminal = { kind: "cancel" };
  const generation = pointerGeneration;
  const captureId = activeCaptureId;
  try {
    const payload = await invoke<InteractionPayload>("cancel_pet_pointer", {
      captureId,
    });
    await applyInteraction(payload);
  } catch {
    // The session is still cleared locally so one failed IPC cannot lock input.
  } finally {
    clearPointerSession(generation);
  }
}

function clearPointerSession(generation: number): void {
  if (generation !== pointerGeneration) {
    return;
  }
  activeCaptureId = undefined;
  activePointerId = undefined;
  pendingPointerMove = undefined;
  pendingPointerTerminal = undefined;
  pointerMovePending = false;
}

function nativeDropArguments(position: { x: number; y: number }) {
  const bounds = petHost.value?.getBoundingClientRect();
  if (!bounds) {
    return undefined;
  }
  const density = window.devicePixelRatio || 1;
  return {
    localX: position.x / density - bounds.left,
    localY: position.y / density - bounds.top,
    surfaceWidth: bounds.width,
    surfaceHeight: bounds.height,
    occurredAtMs: performance.now(),
  };
}

async function bindFileDrop(): Promise<void> {
  unlistenDragDrop = await petWindow.onDragDropEvent(({ payload }) => {
    if (payload.type === "leave") {
      dropActive.value = false;
      return;
    }
    if (payload.type === "enter" || payload.type === "over") {
      dropActive.value = true;
      return;
    }
    dropActive.value = false;
    const input = nativeDropArguments(payload.position);
    if (!input) {
      return;
    }
    void invoke<InteractionPayload>("handle_pet_file_drop", {
      paths: payload.paths,
      pointer: input,
    })
      .then(applyInteraction)
      .catch(() => undefined);
  });
}

function errorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}

async function reportSmoke(loaded: boolean, detail: string): Promise<void> {
  try {
    await emit("frontend-smoke-status", {
      surface: "pet",
      loaded,
      detail: detail.replace(/data:[^\s]+/g, "data:<omitted>"),
    });
  } catch {
    // Smoke observability must not change the product loading outcome.
  }
}

function reportVisibleInteraction(revision: number, action: string): void {
  void emit("pet-interaction-visible", { revision, action }).catch(
    () => undefined,
  );
}

function stopIdlePlayback(): void {
  idlePlaybackToken += 1;
  const shouldStopRenderer =
    idlePlaybackStarted || currentAction.value === "idle";
  idlePlaybackStarted = false;
  if (shouldStopRenderer) {
    renderer.stop();
  }
}

function startIdlePlayback(onFirstFrame?: () => void): void {
  if (
    idlePlaybackStarted ||
    !mountedPack?.manifest.actions.idle ||
    productState.value?.session.quietMode
  ) {
    return;
  }
  idlePlaybackStarted = true;
  const token = ++idlePlaybackToken;
  void renderer
    .playUntilStopped("idle", onFirstFrame)
    .catch(async (error: unknown) => {
      if (token !== idlePlaybackToken) {
        return;
      }
      loadFailure.value = errorMessage(error);
      await reportSmoke(false, loadFailure.value);
    })
    .finally(() => {
      if (token === idlePlaybackToken) {
        idlePlaybackStarted = false;
      }
    });
}

function syncIdlePlayback(): void {
  if (
    productState.value?.session.quietMode ||
    productState.value?.session.currentAction !== "idle"
  ) {
    stopIdlePlayback();
  } else {
    startIdlePlayback();
  }
}

onMounted(async () => {
  try {
    unlistenProductState = await listen<ProductStateSnapshot>(
      "product-state",
      (event) => {
        productState.value = event.payload;
        syncIdlePlayback();
      },
    );
    unlistenInteraction = await listen<InteractionPayload>(
      "pet-interaction",
      (event) => {
        void applyInteraction(event.payload);
      },
    );
    productState.value = await invoke<ProductStateSnapshot>(
      "product_state_snapshot",
    );
  } catch {
    // 产品状态有 Rust 安全默认值；事件 seam 的瞬时失败不能阻止宠物挂载。
  }

  try {
    await bindFileDrop();
    let pack: PetPackPayload;
    try {
      pack = await invoke<PetPackPayload>("current_pet_pack");
    } catch {
      pack = await invoke<PetPackPayload>("reload_example_pet_pack");
    }
    await nextTick();
    if (!petHost.value) {
      throw new Error("宠物窗口渲染容器不存在");
    }
    await renderer.mount(petHost.value, pack);
    mountedPack = pack;
    syncIdlePlayback();
    await reportSmoke(
      true,
      `${pack.summary.displayName} ${pack.summary.version} 已挂载到宠物窗口`,
    );
  } catch (error) {
    loadFailure.value = errorMessage(error);
    await reportSmoke(false, loadFailure.value);
  }
});

onBeforeUnmount(() => {
  actionRevision += 1;
  pointerGeneration += 1;
  if (activeCaptureId !== undefined) {
    cancelPointerCapture(activeCaptureId);
  }
  activeCaptureId = undefined;
  activePointerId = undefined;
  pendingPointerMove = undefined;
  pendingPointerTerminal = undefined;
  unlistenProductState?.();
  mountedPack = null;
  stopIdlePlayback();
  unlistenInteraction?.();
  unlistenDragDrop?.();
  renderer.destroy();
});
</script>

<template>
  <main
    class="pet-surface"
    aria-label="桌面宠物"
    :data-pet-size="productState?.preferences.petSize ?? 'medium'"
    :data-quiet-mode="productState?.session.quietMode ?? false"
  >
    <div
      ref="petHost"
      class="pet-canvas"
      :class="{ 'drop-active': dropActive }"
      :data-current-action="currentAction"
      @pointerdown="beginPointer"
      @pointermove="updatePointer"
      @pointerup="endPointer"
      @pointercancel="cancelPointer"
    />
    <p v-if="loadFailure" class="pet-load-error" role="status">
      宠物暂时无法显示
    </p>
  </main>
</template>
