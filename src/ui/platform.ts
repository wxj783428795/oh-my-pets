import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  emit as tauriEmit,
  listen as tauriListen,
  type EventCallback,
  type UnlistenFn,
} from "@tauri-apps/api/event";
import {
  getCurrentWindow as getTauriCurrentWindow,
  type DragDropEvent,
} from "@tauri-apps/api/window";
import { inject, type InjectionKey } from "vue";

export type { UnlistenFn };

export type PlatformWindow = {
  onDragDropEvent(handler: EventCallback<DragDropEvent>): Promise<UnlistenFn>;
  startDragging(): Promise<void>;
};

export type Platform = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  emit<T>(event: string, payload?: T): Promise<void>;
  listen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn>;
  getCurrentWindow(): PlatformWindow;
};

export const tauriPlatform: Platform = {
  invoke: tauriInvoke,
  emit: tauriEmit,
  listen: tauriListen,
  getCurrentWindow: getTauriCurrentWindow,
};

export const platformKey: InjectionKey<Platform> = Symbol("platform");

export function usePlatform(): Platform {
  return inject(platformKey, tauriPlatform);
}
