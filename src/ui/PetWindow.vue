<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import { PetRenderer } from "./pet-renderer";
import { usePlatform } from "./platform";
import type { PetPackPayload } from "./types";

const petHost = ref<HTMLElement | null>(null);
const loadFailure = ref("");
const renderer = new PetRenderer();
const { emit, invoke } = usePlatform();

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

onMounted(async () => {
  try {
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
  renderer.destroy();
});
</script>

<template>
  <main class="pet-surface" aria-label="桌面宠物">
    <div ref="petHost" class="pet-canvas" />
    <p v-if="loadFailure" class="pet-load-error" role="status">
      宠物暂时无法显示
    </p>
  </main>
</template>
