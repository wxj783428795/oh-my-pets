import "pixi.js/unsafe-eval";
import { Application, Assets, Rectangle, Sprite, Texture } from "pixi.js";

import type { PetPackPayload } from "./types";

export class PetRenderer {
  private readonly app = new Application();
  private pack: PetPackPayload | null = null;
  private sprite: Sprite | null = null;
  private textures = new Map<string, Texture>();
  private activeAssetUrl: string | null = null;
  private pendingAssetLoads = new Map<string, number>();
  private unloadPromises = new Map<string, Promise<void>>();
  private timer: number | null = null;
  private resolvePlay: (() => void) | null = null;
  private playToken = 0;
  private mountToken = 0;
  private initialized = false;
  private initializePromise: Promise<void> | null = null;
  private destroyed = false;

  constructor() {
    Assets.setPreferences({
      preferCreateImageBitmap: false,
      preferWorkers: false,
    });
  }

  async mount(host: HTMLElement, pack: PetPackPayload): Promise<void> {
    if (this.destroyed) {
      throw new Error("宠物渲染器已销毁");
    }
    this.clear();
    const token = ++this.mountToken;

    await this.ensureInitialized(pack);
    if (token !== this.mountToken) {
      return;
    }
    this.app.renderer.resize(
      pack.manifest.canvas.width,
      pack.manifest.canvas.height,
    );
    host.replaceChildren(this.app.canvas);

    const atlasTexture = await this.loadAtlasTexture(pack.imageUrl, token);
    if (!atlasTexture || token !== this.mountToken) {
      return;
    }
    for (const [name, frame] of Object.entries(pack.atlas.frames)) {
      this.textures.set(
        name,
        new Texture({
          source: atlasTexture.source,
          frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
        }),
      );
    }

    const firstFrame = Object.keys(pack.atlas.frames)[0];
    const texture = this.textures.get(firstFrame);
    if (!texture) {
      throw new Error("图集没有可渲染帧");
    }
    this.pack = pack;
    this.sprite = new Sprite(texture);
    this.app.stage.removeChildren();
    this.app.stage.addChild(this.sprite);
    this.applyFrame(firstFrame);
  }

  async play(actionName: string, holdMs: number): Promise<void> {
    this.stop();
    const token = this.playToken;
    const action = this.pack?.manifest.actions[actionName];
    if (!action || !this.sprite || action.frames.length === 0) {
      return;
    }

    const startedAt = performance.now();
    let index = 0;
    await new Promise<void>((resolve) => {
      const finish = () => {
        if (this.resolvePlay === finish) {
          this.resolvePlay = null;
        }
        resolve();
      };
      this.resolvePlay = finish;
      const advance = () => {
        if (token !== this.playToken) {
          finish();
          return;
        }
        const frame = action.frames[index];
        this.applyFrame(frame.ref);
        const isLastFrame = index === action.frames.length - 1;
        if (!action.loop && isLastFrame) {
          const elapsed = performance.now() - startedAt;
          this.timer = window.setTimeout(finish, Math.max(0, holdMs - elapsed));
          return;
        }
        index = (index + 1) % action.frames.length;
        const elapsed = performance.now() - startedAt;
        const shouldContinue = elapsed + frame.durationMs < holdMs;
        if (shouldContinue) {
          this.timer = window.setTimeout(advance, frame.durationMs);
        } else {
          this.timer = window.setTimeout(finish, Math.max(0, holdMs - elapsed));
        }
      };
      advance();
    });
  }

  stop(): void {
    this.playToken += 1;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.resolvePlay?.();
    this.resolvePlay = null;
  }

  clear(): void {
    this.mountToken += 1;
    this.stop();
    this.clearScene();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.clear();
    if (this.initialized) {
      this.destroyApplication();
    }
  }

  private clearScene(): void {
    const assetUrl = this.activeAssetUrl;
    this.activeAssetUrl = null;
    this.pack = null;
    this.app.stage.removeChildren();
    this.sprite?.destroy();
    this.sprite = null;
    for (const texture of this.textures.values()) {
      texture.destroy(false);
    }
    this.textures.clear();
    if (this.initialized) {
      this.app.renderer.render({ container: this.app.stage });
    }
    if (assetUrl) {
      this.releaseAssetIfUnused(assetUrl);
    }
  }

  private async loadAtlasTexture(
    assetUrl: string,
    token: number,
  ): Promise<Texture | null> {
    await this.unloadPromises.get(assetUrl);
    this.pendingAssetLoads.set(
      assetUrl,
      (this.pendingAssetLoads.get(assetUrl) ?? 0) + 1,
    );
    try {
      const texture = await Assets.load<Texture>(assetUrl);
      if (token !== this.mountToken) {
        return null;
      }
      this.activeAssetUrl = assetUrl;
      return texture;
    } finally {
      const remaining = (this.pendingAssetLoads.get(assetUrl) ?? 1) - 1;
      if (remaining > 0) {
        this.pendingAssetLoads.set(assetUrl, remaining);
      } else {
        this.pendingAssetLoads.delete(assetUrl);
      }
      this.releaseAssetIfUnused(assetUrl);
    }
  }

  private releaseAssetIfUnused(assetUrl: string): void {
    if (
      this.activeAssetUrl === assetUrl ||
      this.pendingAssetLoads.has(assetUrl) ||
      this.unloadPromises.has(assetUrl)
    ) {
      return;
    }
    const unload = Assets.unload(assetUrl)
      .catch(() => undefined)
      .finally(() => {
        if (this.unloadPromises.get(assetUrl) === unload) {
          this.unloadPromises.delete(assetUrl);
        }
      });
    this.unloadPromises.set(assetUrl, unload);
  }

  private async ensureInitialized(pack: PetPackPayload): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (!this.initializePromise) {
      this.initializePromise = this.app
        .init({
          width: pack.manifest.canvas.width,
          height: pack.manifest.canvas.height,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio, 2),
        })
        .then(() => {
          this.app.ticker.stop();
          if (this.destroyed) {
            this.destroyApplication();
          } else {
            this.initialized = true;
          }
        });
    }
    const promise = this.initializePromise;
    try {
      await promise;
    } finally {
      if (this.initializePromise === promise) {
        this.initializePromise = null;
      }
    }
  }

  private destroyApplication(): void {
    this.app.destroy({ removeView: true }, { children: true, texture: true });
    this.initialized = false;
  }

  private applyFrame(name: string): void {
    const frame = this.pack?.atlas.frames[name];
    const texture = this.textures.get(name);
    if (!frame || !texture || !this.sprite) {
      return;
    }
    this.sprite.texture = texture;
    this.sprite.position.set(frame.offsetX, frame.offsetY);
    this.app.renderer.render({ container: this.app.stage });
  }
}
