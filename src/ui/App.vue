<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import { actionLabel } from "./action-labels";
import { PetRenderer } from "./pet-renderer";
import type {
  BehaviorStep,
  CommandError,
  PetPackPayload,
  ShellSnapshot,
  ValidationIssue,
} from "./types";

const previewHost = ref<HTMLElement | null>(null);
const pack = ref<PetPackPayload | null>(null);
const shell = ref<ShellSnapshot>({
  clickThrough: false,
  alwaysOnTop: true,
  visibleOnAllWorkspaces: true,
});
const shellFailure = ref<CommandError | null>(null);
const currentStep = ref<BehaviorStep | null>(null);
const timelineRunning = ref(false);
const loading = ref(true);
const dropActive = ref(false);
const status = ref("正在读取 Rust 领域层返回的宠物包摘要…");
const diagnosticPath = ref("");
const issues = ref<ValidationIssue[]>([]);
const renderer = new PetRenderer();
const unlisteners: UnlistenFn[] = [];
let timelineToken = 0;
let latestPackRevision = 0;
let nextLoadingOperation = 0;
const loadingOperations = new Set<number>();

const appWindow = getCurrentWindow();
const packHealth = computed(() => {
  if (!pack.value) {
    return "未加载";
  }
  return pack.value.summary.warnings.length > 0 ? "可用，有警告" : "校验通过";
});
const actionNames = computed(() =>
  pack.value ? Object.keys(pack.value.manifest.actions) : [],
);

function normalizeError(error: unknown): CommandError {
  if (typeof error === "object" && error !== null) {
    const candidate = error as Partial<CommandError>;
    if (candidate.message) {
      return {
        code: candidate.code ?? "unknown",
        message: candidate.message,
        details: candidate.details ?? [],
        revision: candidate.revision ?? null,
      };
    }
  }
  return {
    code: "unknown",
    message: String(error),
    details: [],
    revision: null,
  };
}

function syncLoading(): void {
  loading.value = loadingOperations.size > 0;
}

function beginLoading(): number {
  const operation = ++nextLoadingOperation;
  loadingOperations.add(operation);
  loading.value = true;
  return operation;
}

function finishLoading(operation: number): void {
  loadingOperations.delete(operation);
  syncLoading();
}

function claimRevision(revision: number, operation?: number): boolean {
  if (revision < latestPackRevision) {
    return false;
  }
  latestPackRevision = revision;
  loadingOperations.clear();
  if (operation !== undefined) {
    loadingOperations.add(operation);
  }
  syncLoading();
  return true;
}

function claimFailure(failure: CommandError, operation?: number): boolean {
  return (
    failure.revision === null ||
    claimRevision(failure.revision, operation)
  );
}

function showPackFailure(failure: CommandError): void {
  stopTimeline();
  renderer.clear();
  pack.value = null;
  currentStep.value = null;
  issues.value = failure.details;
  status.value = failure.message;
}

async function mountPack(
  payload: PetPackPayload,
  loadingOperation: number,
): Promise<boolean> {
  if (!claimRevision(payload.revision, loadingOperation)) {
    return false;
  }
  try {
    await nextTick();
    if (payload.revision !== latestPackRevision) {
      return false;
    }
    if (!previewHost.value) {
      throw new Error("预览容器不存在");
    }
    await renderer.mount(previewHost.value, payload);
    if (payload.revision !== latestPackRevision) {
      return false;
    }
    pack.value = payload;
    issues.value = payload.summary.warnings;
    return true;
  } catch (error) {
    if (payload.revision !== latestPackRevision) {
      return false;
    }
    const failure = normalizeError(error);
    throw {
      ...failure,
      revision: payload.revision,
    } satisfies CommandError;
  }
}

async function loadInitialPack(): Promise<void> {
  const loadingOperation = beginLoading();
  try {
    let payload: PetPackPayload;
    try {
      payload = await invoke<PetPackPayload>("current_pet_pack");
    } catch {
      payload = await invoke<PetPackPayload>("reload_example_pet_pack");
    }
    if (!(await mountPack(payload, loadingOperation))) {
      return;
    }
    status.value = `已从正式主线加载 ${payload.summary.displayName} ${payload.summary.version}`;
  } catch (error) {
    const failure = normalizeError(error);
    if (!claimFailure(failure, loadingOperation)) {
      return;
    }
    showPackFailure(failure);
  } finally {
    finishLoading(loadingOperation);
  }
}

async function reloadPack(): Promise<void> {
  stopTimeline();
  const loadingOperation = beginLoading();
  try {
    const payload = await invoke<PetPackPayload>("reload_example_pet_pack");
    if (!(await mountPack(payload, loadingOperation))) {
      return;
    }
    status.value = `宠物包已重新校验并加载，共 ${payload.summary.actionCount} 个动作`;
  } catch (error) {
    const failure = normalizeError(error);
    if (!claimFailure(failure, loadingOperation)) {
      return;
    }
    showPackFailure(failure);
  } finally {
    finishLoading(loadingOperation);
  }
}

async function runTimeline(): Promise<void> {
  if (!pack.value || timelineRunning.value) {
    return;
  }
  timelineRunning.value = true;
  const token = ++timelineToken;
  while (timelineRunning.value && token === timelineToken) {
    try {
      const step = await invoke<BehaviorStep>("next_preview_action");
      if (!timelineRunning.value || token !== timelineToken || !pack.value) {
        return;
      }
      currentStep.value = step;
      status.value = step.reason;
      await renderer.play(step.action, step.holdMs);
    } catch (error) {
      if (token !== timelineToken || !pack.value) {
        return;
      }
      status.value = normalizeError(error).message;
      stopTimeline();
    }
  }
}

function stopTimeline(): void {
  timelineRunning.value = false;
  timelineToken += 1;
  renderer.stop();
}

async function triggerAction(action: string): Promise<void> {
  if (!pack.value || loading.value) {
    return;
  }
  stopTimeline();
  const token = timelineToken;
  try {
    const step = await invoke<BehaviorStep>("trigger_preview_action", {
      action,
    });
    if (token !== timelineToken || !pack.value) {
      return;
    }
    currentStep.value = step;
    status.value = step.reason;
    await renderer.play(step.action, step.holdMs);
  } catch (error) {
    if (token !== timelineToken || !pack.value) {
      return;
    }
    status.value = normalizeError(error).message;
  }
}

async function toggleClickThrough(): Promise<void> {
  try {
    shell.value = await invoke<ShellSnapshot>("set_click_through", {
      enabled: !shell.value.clickThrough,
    });
    status.value = shell.value.clickThrough
      ? "点击穿透已开启。请从菜单栏选择“关闭点击穿透”恢复交互。"
      : "点击穿透已关闭。";
  } catch (error) {
    status.value = normalizeError(error).message;
  }
}

async function resetPosition(): Promise<void> {
  try {
    await invoke("reset_window_position");
    status.value = "窗口已重置到当前显示器右下工作区。";
  } catch (error) {
    status.value = normalizeError(error).message;
  }
}

async function hidePreviewWindow(): Promise<void> {
  try {
    await invoke("hide_preview_window");
  } catch (error) {
    status.value = normalizeError(error).message;
  }
}

async function startWindowDrag(event: PointerEvent): Promise<void> {
  if (event.button !== 0) {
    return;
  }
  try {
    await appWindow.startDragging();
  } catch (error) {
    status.value = normalizeError(error).message;
  }
}

async function exportDiagnostics(): Promise<void> {
  try {
    diagnosticPath.value = await invoke<string>("export_diagnostics");
    status.value = "诊断摘要已写入本地日志目录。";
  } catch (error) {
    status.value = normalizeError(error).message;
  }
}

async function handleReloadedPack(payload: PetPackPayload): Promise<void> {
  stopTimeline();
  const loadingOperation = beginLoading();
  try {
    if (!(await mountPack(payload, loadingOperation))) {
      return;
    }
    status.value = "已从菜单栏重新加载示例宠物包。";
  } catch (error) {
    const failure = normalizeError(error);
    if (!claimFailure(failure, loadingOperation)) {
      return;
    }
    showPackFailure(failure);
  } finally {
    finishLoading(loadingOperation);
  }
}

async function bindNativeEvents(): Promise<void> {
  unlisteners.push(
    await listen<ShellSnapshot>("shell-state", ({ payload }) => {
      shell.value = payload;
      if (shellFailure.value) {
        shellFailure.value = null;
        status.value = "窗口状态已恢复。";
      }
    }),
  );
  unlisteners.push(
    await listen<PetPackPayload>("pet-pack-reloaded", ({ payload }) => {
      void handleReloadedPack(payload);
    }),
  );
  unlisteners.push(
    await listen<CommandError>("pet-pack-load-failed", ({ payload }) => {
      if (claimFailure(payload)) {
        showPackFailure(payload);
      }
    }),
  );
  unlisteners.push(
    await listen<CommandError>("shell-operation-failed", ({ payload }) => {
      if (!claimFailure(payload)) {
        return;
      }
      issues.value = payload.details;
      status.value = payload.message;
    }),
  );
  unlisteners.push(
    await listen<string>("diagnostics-exported", ({ payload }) => {
      diagnosticPath.value = payload;
      status.value = "已从菜单栏导出诊断摘要。";
    }),
  );
  unlisteners.push(
    await appWindow.onDragDropEvent(({ payload }) => {
      if (payload.type === "enter" || payload.type === "over") {
        dropActive.value = true;
      } else if (payload.type === "leave") {
        dropActive.value = false;
      } else if (payload.type === "drop") {
        dropActive.value = false;
        if (!pack.value || loading.value) {
          return;
        }
        status.value = `收到 ${payload.paths.length} 个文件投喂；文件内容未读取。`;
        void triggerAction("feed_react");
      }
    }),
  );
}

function clearNativeEvents(): void {
  for (const unlisten of unlisteners.splice(0)) {
    unlisten();
  }
}

onMounted(async () => {
  try {
    shell.value = await invoke<ShellSnapshot>("shell_snapshot");
  } catch (error) {
    shellFailure.value = normalizeError(error);
  }

  try {
    await bindNativeEvents();
    await loadInitialPack();
    if (shellFailure.value && pack.value) {
      status.value = `窗口状态暂不可用，恢复控制仍可使用：${shellFailure.value.message}`;
    }
  } catch (error) {
    clearNativeEvents();
    loadingOperations.clear();
    syncLoading();
    const failure = normalizeError(error);
    issues.value = failure.details;
    status.value = failure.message;
  }
});

onBeforeUnmount(() => {
  stopTimeline();
  renderer.destroy();
  clearNativeEvents();
});
</script>

<template>
  <main class="workbench">
    <header class="titlebar">
      <div class="brand" data-tauri-drag-region>
        <span class="brand-mark">卷</span>
        <div data-tauri-drag-region>
          <p>OH MY PETS</p>
          <span>macOS preview mainline · 0.1.0</span>
        </div>
      </div>
      <div class="window-actions">
        <button
          class="drag-handle"
          type="button"
          aria-label="拖动窗口"
          @pointerdown.stop.prevent="startWindowDrag"
        >
          <span class="drag-grip" aria-hidden="true" />
          拖动
        </button>
        <button
          class="window-button"
          type="button"
          aria-label="隐藏窗口"
          @click="hidePreviewWindow"
        >
          收起
        </button>
      </div>
    </header>

    <section class="hero">
      <div>
        <p class="eyebrow">正式主线 / 工程工作台</p>
        <h1>把一只宠物包，<br />交给 Rust 照看。</h1>
      </div>
      <p class="hero-note">
        当前只验证 macOS
        预览版的工程结构、内容边界与恢复入口。图集是工程占位帧，不代表首发美术已完成。
      </p>
    </section>

    <section class="workspace-grid">
      <article class="preview-card">
        <div class="card-heading">
          <div>
            <p class="section-label">PIXIJS PREVIEW</p>
            <h2>{{ pack?.summary.displayName ?? "等待宠物包" }}</h2>
          </div>
          <span class="health-pill" :data-state="pack ? 'ready' : 'error'">{{
            packHealth
          }}</span>
        </div>

        <div class="pet-stage" :class="{ 'drop-active': dropActive }">
          <div ref="previewHost" class="pixi-host" />
          <div v-if="loading" class="stage-message">校验中…</div>
          <div v-if="dropActive" class="drop-message">
            松手投喂，不读取文件内容
          </div>
          <span class="stage-baseline" aria-hidden="true" />
        </div>

        <div class="timeline-status">
          <span class="pulse" :class="{ active: timelineRunning }" />
          <div>
            <small>当前语义动作</small>
            <strong>{{
              currentStep ? actionLabel(currentStep.action) : "尚未开始"
            }}</strong>
          </div>
          <code>{{ currentStep?.action ?? "—" }}</code>
        </div>

        <div class="primary-actions">
          <button
            v-if="!timelineRunning"
            class="button primary"
            type="button"
            :disabled="!pack || loading"
            @click="runTimeline"
          >
            运行最小时间线
          </button>
          <button
            v-else
            class="button primary stop"
            type="button"
            @click="stopTimeline"
          >
            停止时间线
          </button>
          <button
            class="button"
            type="button"
            :disabled="!pack || loading"
            @click="triggerAction('tap_react')"
          >
            点击反馈
          </button>
          <button
            class="button"
            type="button"
            :disabled="!pack || loading"
            @click="triggerAction('feed_react')"
          >
            模拟投喂
          </button>
        </div>
      </article>

      <aside class="control-column">
        <article class="control-card">
          <div class="card-heading compact">
            <div>
              <p class="section-label">RECOVERY</p>
              <h2>恢复能力</h2>
            </div>
            <span class="menu-hint">菜单栏常驻</span>
          </div>
          <div class="control-list">
            <button type="button" @click="resetPosition">
              <span>重置位置</span>
              <small>当前显示器右下角</small>
            </button>
            <button
              type="button"
              :class="{ warning: shell.clickThrough }"
              @click="toggleClickThrough"
            >
              <span>{{
                shell.clickThrough ? "关闭点击穿透" : "开启点击穿透"
              }}</span>
              <small>{{
                shell.clickThrough ? "也可从菜单栏恢复" : "会暂停系统文件拖放"
              }}</small>
            </button>
            <button type="button" @click="reloadPack">
              <span>重新加载示例宠物包</span>
              <small>再次执行 Rust 校验</small>
            </button>
            <button type="button" @click="exportDiagnostics">
              <span>导出诊断摘要</span>
              <small>本地 Markdown</small>
            </button>
          </div>
          <p v-if="diagnosticPath" class="diagnostic-path">
            {{ diagnosticPath }}
          </p>
        </article>

        <article class="control-card pack-card">
          <p class="section-label">PET PACK</p>
          <dl v-if="pack" class="pack-stats">
            <div>
              <dt>标识</dt>
              <dd>{{ pack.summary.id }}</dd>
            </div>
            <div>
              <dt>版本</dt>
              <dd>{{ pack.summary.version }}</dd>
            </div>
            <div>
              <dt>动作</dt>
              <dd>{{ pack.summary.actionCount }}</dd>
            </div>
            <div>
              <dt>图集帧</dt>
              <dd>{{ pack.summary.frameCount }}</dd>
            </div>
            <div>
              <dt>画布</dt>
              <dd>{{ pack.summary.canvas.width }}×{{ pack.summary.canvas.height }}</dd>
            </div>
          </dl>
          <div class="action-cloud" aria-label="已加载语义动作">
            <span v-for="action in actionNames" :key="action">{{
              action
            }}</span>
          </div>
        </article>
      </aside>
    </section>

    <section
      class="status-strip"
      :data-error="issues.some((issue) => issue.severity === 'error')"
    >
      <div>
        <span class="status-dot" />
        <p>{{ status }}</p>
      </div>
      <p class="constraint">已知约束：整窗点击穿透与系统级文件拖放不能共存</p>
    </section>

    <section v-if="issues.length > 0" class="issues-panel">
      <p class="section-label">VALIDATION NOTES</p>
      <ul>
        <li v-for="issue in issues" :key="`${issue.code}-${issue.path}`">
          <code>{{ issue.path }}</code>
          <span>{{ issue.message }}</span>
        </li>
      </ul>
    </section>
  </main>
</template>
