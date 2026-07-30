<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import { usePlatform, type UnlistenFn } from "./platform";
import type { ActivityFrequency, PetSize, ProductStateSnapshot } from "./types";

const { invoke, listen } = usePlatform();
const productState = ref<ProductStateSnapshot | null>(null);
const feedback = ref("");
const failure = ref("");
const pending = ref(false);
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

async function updateState(
  command: string,
  args?: Record<string, unknown>,
): Promise<void> {
  pending.value = true;
  failure.value = "";
  feedback.value = "";
  try {
    productState.value = await invoke<ProductStateSnapshot>(command, args);
  } catch (error) {
    failure.value = errorMessage(error);
  } finally {
    pending.value = false;
  }
}

async function setPetSize(petSize: PetSize): Promise<void> {
  await updateState("set_pet_size", { petSize });
}

async function setActivityFrequency(
  activityFrequency: ActivityFrequency,
): Promise<void> {
  await updateState("set_activity_frequency", { activityFrequency });
}

async function setLaunchAtLogin(enabled: boolean): Promise<void> {
  await updateState("set_launch_at_login", { enabled });
}

async function runAction(
  action: () => Promise<string>,
  success: (result: string) => string,
): Promise<void> {
  pending.value = true;
  failure.value = "";
  feedback.value = "";
  try {
    feedback.value = success(await action());
  } catch (error) {
    failure.value = errorMessage(error);
  } finally {
    pending.value = false;
  }
}

async function reloadPack(): Promise<void> {
  await runAction(
    async () => {
      await invoke("reload_example_pet_pack");
      return "";
    },
    () => "内置卷卷已重新加载",
  );
}

async function replayOnboarding(): Promise<void> {
  pending.value = true;
  failure.value = "";
  feedback.value = "";
  try {
    productState.value =
      await invoke<ProductStateSnapshot>("replay_onboarding");
    feedback.value = "新手提示状态已重置；提示界面将在后续体验流程接入";
  } catch (error) {
    failure.value = errorMessage(error);
  } finally {
    pending.value = false;
  }
}

async function exportDiagnostics(): Promise<void> {
  await runAction(
    () => invoke<string>("export_diagnostics"),
    (path) => `诊断已导出：${path}`,
  );
}

onMounted(async () => {
  unlistenProductState = await listen<ProductStateSnapshot>(
    "product-state",
    (event) => {
      productState.value = event.payload;
    },
  );
  try {
    productState.value = await invoke<ProductStateSnapshot>(
      "product_state_snapshot",
    );
  } catch (error) {
    failure.value = errorMessage(error);
  }
});

onBeforeUnmount(() => {
  unlistenProductState?.();
});
</script>

<template>
  <main class="preferences-surface">
    <header class="preferences-titlebar" data-tauri-drag-region>
      <div>
        <p class="eyebrow">OH MY PETS</p>
        <h1>偏好设置</h1>
      </div>
      <span>macOS 预览候选版</span>
    </header>

    <div v-if="productState" class="preferences-grid">
      <section class="preference-card" aria-labelledby="appearance-title">
        <p class="section-label">APPEARANCE</p>
        <h2 id="appearance-title">宠物尺寸</h2>
        <div class="segmented-control">
          <label v-for="option in ['small', 'medium', 'large']" :key="option">
            <input
              name="pet-size"
              type="radio"
              :value="option"
              :checked="productState.preferences.petSize === option"
              :disabled="pending"
              @change="setPetSize(option as PetSize)"
            />
            <span>{{
              { small: "小", medium: "中", large: "大" }[option]
            }}</span>
          </label>
        </div>
      </section>

      <section class="preference-card" aria-labelledby="activity-title">
        <p class="section-label">ACTIVITY</p>
        <h2 id="activity-title">活动频率</h2>
        <div class="segmented-control">
          <label v-for="option in ['low', 'standard', 'high']" :key="option">
            <input
              name="activity-frequency"
              type="radio"
              :value="option"
              :checked="productState.preferences.activityFrequency === option"
              :disabled="pending"
              @change="setActivityFrequency(option as ActivityFrequency)"
            />
            <span>{{
              { low: "低", standard: "标准", high: "高" }[option]
            }}</span>
          </label>
        </div>
      </section>

      <section class="preference-card wide" aria-labelledby="system-title">
        <div>
          <p class="section-label">SYSTEM</p>
          <h2 id="system-title">登录时启动</h2>
          <p>使用 macOS 系统登录项，界面始终以系统实际状态为准。</p>
        </div>
        <label class="switch-control">
          <input
            name="launch-at-login"
            type="checkbox"
            :checked="productState.preferences.launchAtLogin"
            :disabled="pending"
            @change="
              setLaunchAtLogin(($event.target as HTMLInputElement).checked)
            "
          />
          <span>登录时启动 Oh My Pets</span>
        </label>
      </section>

      <section class="preference-card wide" aria-labelledby="recovery-title">
        <div>
          <p class="section-label">RECOVERY</p>
          <h2 id="recovery-title">内容与诊断</h2>
          <p>{{ productState.preferenceHealth.message }}</p>
        </div>
        <div class="preference-actions">
          <button
            type="button"
            data-action="reload-pack"
            :disabled="pending"
            @click="reloadPack"
          >
            重新加载内置卷卷
          </button>
          <button
            type="button"
            data-action="replay-onboarding"
            :disabled="pending"
            @click="replayOnboarding"
          >
            重置新手提示状态
          </button>
          <button
            type="button"
            data-action="export-diagnostics"
            :disabled="pending"
            @click="exportDiagnostics"
          >
            导出诊断摘要
          </button>
        </div>
      </section>
    </div>

    <p v-else-if="!failure" class="preferences-loading" role="status">
      正在读取产品状态…
    </p>
    <p v-if="feedback" class="preferences-feedback" role="status">
      {{ feedback }}
    </p>
    <p v-if="failure" class="preferences-failure" role="alert">
      {{ failure }}
    </p>

    <section class="developer-entry" aria-labelledby="developer-entry-title">
      <div>
        <p class="section-label">ADVANCED</p>
        <h2 id="developer-entry-title">高级开发预览</h2>
        <p>宠物包校验、动作时间线与诊断工作台，仅用于开发与验证。</p>
      </div>
      <a class="developer-link" href="?surface=developer">打开开发预览</a>
    </section>
  </main>
</template>
