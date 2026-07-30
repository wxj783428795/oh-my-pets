import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import {
  PRODUCTION_ACTIONS,
  decodeRgbaPng,
  validateProductionPetPack,
  validateProductionPetMetadata,
  validateProductionPetPixels,
} from "./production-pet-assets.mjs";

function productionFixture() {
  const frames = {};
  const actions = {};
  let frameIndex = 0;
  for (const [actionName, contract] of Object.entries(PRODUCTION_ACTIONS)) {
    const actionFrames = [];
    for (let index = 0; index < contract.frameCount; index += 1) {
      const ref = `${actionName}_${String(index).padStart(2, "0")}`;
      frames[ref] = {
        x: frameIndex * 2,
        y: 0,
        w: 200,
        h: 230,
        offsetX: 60,
        offsetY: 58,
      };
      actionFrames.push({ ref, durationMs: 120 });
      frameIndex += 1;
    }
    actions[actionName] = {
      loop: contract.loop,
      frames: actionFrames,
      cuePoints: [],
    };
  }
  return {
    manifest: {
      schemaVersion: 1,
      id: "juanjuan-cat",
      version: "1.0.0",
      renderer: "sprite-atlas-v1",
      canvas: { width: 320, height: 320 },
      atlasPath: "atlas.json",
      layout: {
        baseline: { x: 160, y: 288 },
        hitbox: { x: 70, y: 58, width: 180, height: 230 },
        dropZone: { x: 90, y: 118, width: 140, height: 120 },
        bubbleAnchor: { x: 160, y: 34 },
      },
      actions,
    },
    atlas: {
      imagePath: "atlas.png",
      pixelWidth: frameIndex * 2,
      pixelHeight: 2,
      frames,
    },
  };
}

function rgbaImage(width, height, painter) {
  const data = new Uint8Array(width * height * 4);
  painter(data, width);
  return { width, height, data };
}

function paintPixel(data, width, x, y, [red, green, blue, alpha]) {
  const offset = (y * width + x) * 4;
  data.set([red, green, blue, alpha], offset);
}

describe("正式卷卷资产契约", () => {
  test("接受 accepted spec 对应的 15 动作与 86 个独立帧元数据", () => {
    const { manifest, atlas } = productionFixture();

    expect(validateProductionPetMetadata(manifest, atlas)).toEqual([]);
    expect(Object.values(PRODUCTION_ACTIONS)).toHaveLength(15);
    expect(
      Object.values(PRODUCTION_ACTIONS).reduce(
        (total, action) => total + action.frameCount,
        0,
      ),
    ).toBe(86);
  });

  test("拒绝复用同一帧引用和只改 offset 的平移伪动画", () => {
    const { manifest, atlas } = productionFixture();
    manifest.actions.idle.frames[1].ref = manifest.actions.idle.frames[0].ref;
    atlas.frames.idle_01.offsetX += 8;

    expect(validateProductionPetMetadata(manifest, atlas)).toContainEqual(
      expect.objectContaining({ code: "production.frame-ref-reused" }),
    );
  });

  test("拒绝标准画布外的帧和主体占比过小的动作", () => {
    const { manifest, atlas } = productionFixture();
    atlas.frames.idle_00.offsetX = 140;
    for (const frame of manifest.actions.idle.frames) {
      atlas.frames[frame.ref].h = 180;
      atlas.frames[frame.ref].offsetY = 108;
    }

    const issues = validateProductionPetMetadata(manifest, atlas);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "production.frame-canvas-bounds" }),
        expect.objectContaining({ code: "production.frame-occupancy" }),
      ]),
    );
  });

  test("拒绝透明留白、脚底漂移和缩放后仍相同的像素帧", () => {
    const manifest = {
      layout: { baseline: { y: 4 } },
      actions: {
        idle: {
          frames: [
            { ref: "idle_00", durationMs: 120 },
            { ref: "idle_01", durationMs: 120 },
          ],
        },
      },
    };
    const atlas = {
      frames: {
        idle_00: { x: 0, y: 0, w: 3, h: 3, offsetX: 0, offsetY: 1 },
        idle_01: { x: 3, y: 0, w: 4, h: 4, offsetX: 0, offsetY: 4 },
      },
    };
    const image = rgbaImage(7, 4, (data, width) => {
      paintPixel(data, width, 1, 1, [232, 132, 52, 255]);
      paintPixel(data, width, 4, 1, [232, 132, 52, 255]);
      paintPixel(data, width, 5, 1, [232, 132, 52, 255]);
      paintPixel(data, width, 4, 2, [232, 132, 52, 255]);
      paintPixel(data, width, 5, 2, [232, 132, 52, 255]);
    });

    const issues = validateProductionPetPixels(manifest, atlas, image);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "production.frame-transparent-edge" }),
        expect.objectContaining({ code: "production.baseline-drift" }),
        expect.objectContaining({ code: "production.frame-scaled-duplicate" }),
      ]),
    );
  });

  test("公开检查入口读取正式图集并接受完整宠物包", async () => {
    const packDirectory = resolve("assets/pets/juanjuan");
    const atlas = JSON.parse(
      await readFile(resolve(packDirectory, "atlas.json"), "utf8"),
    );
    const decoded = decodeRgbaPng(
      await readFile(resolve(packDirectory, "atlas.png")),
    );

    expect(decoded).toMatchObject({
      width: atlas.pixelWidth,
      height: atlas.pixelHeight,
    });
    expect(decoded.data).toHaveLength(
      atlas.pixelWidth * atlas.pixelHeight * 4,
    );
    await expect(validateProductionPetPack(packDirectory)).resolves.toEqual([]);
  });

  test("根命令把正式卷卷机械校验接入最终 verify", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));

    expect(packageJson.scripts["pet:assets:check"]).toBe(
      "node scripts/check-production-pet-assets.mjs",
    );
    expect(packageJson.scripts["verify:core"]).toContain(
      "pnpm pet:assets:check",
    );
  });
});
