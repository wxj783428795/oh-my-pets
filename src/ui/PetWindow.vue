<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import { PetRenderer } from "./pet-renderer";
import { usePlatform, type UnlistenFn } from "./platform";
import type { PetPackPayload, ProductStateSnapshot } from "./types";

const petHost = ref<HTMLElement | null>(null);
const loadFailure = ref("");
const productState = ref<ProductStateSnapshot | null>(null);
const renderer = new PetRenderer();
const { emit, invoke, listen } = usePlatform();
let unlistenProductState: UnlistenFn | undefined;

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
    unlistenProductState = await listen<ProductStateSnapshot>(
      "product-state",
      (event) => {
        productState.value = event.payload;
      },
    );
    productState.value = await invoke<ProductStateSnapshot>(
      "product_state_snapshot",
    );
  } catch {
    // 产品状态有 Rust 安全默认值；事件 seam 的瞬时失败不能阻止宠物挂载。
  }

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
  unlistenProductState?.();
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
    <div ref="petHost" class="pet-canvas" />
    <p v-if="loadFailure" class="pet-load-error" role="status">
      宠物暂时无法显示
    </p>
  </main>
</template>
