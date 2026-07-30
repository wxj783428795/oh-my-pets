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

function extractFrame(image, frame) {
  return rgbaImage(frame.w, frame.h, (data) => {
    for (let y = 0; y < frame.h; y += 1) {
      const sourceStart = ((frame.y + y) * image.width + frame.x) * 4;
      data.set(
        image.data.subarray(sourceStart, sourceStart + frame.w * 4),
        y * frame.w * 4,
      );
    }
  });
}

function bilinearResize(image, width, height) {
  return rgbaImage(width, height, (data) => {
    for (let y = 0; y < height; y += 1) {
      const sourceY = Math.max(
        0,
        Math.min(image.height - 1, ((y + 0.5) * image.height) / height - 0.5),
      );
      const y0 = Math.floor(sourceY);
      const y1 = Math.min(image.height - 1, y0 + 1);
      const yWeight = sourceY - y0;
      for (let x = 0; x < width; x += 1) {
        const sourceX = Math.max(
          0,
          Math.min(image.width - 1, ((x + 0.5) * image.width) / width - 0.5),
        );
        const x0 = Math.floor(sourceX);
        const x1 = Math.min(image.width - 1, x0 + 1);
        const xWeight = sourceX - x0;
        const target = (y * width + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          const topLeft = image.data[(y0 * image.width + x0) * 4 + channel];
          const topRight = image.data[(y0 * image.width + x1) * 4 + channel];
          const bottomLeft = image.data[(y1 * image.width + x0) * 4 + channel];
          const bottomRight = image.data[(y1 * image.width + x1) * 4 + channel];
          const top = topLeft + (topRight - topLeft) * xWeight;
          const bottom = bottomLeft + (bottomRight - bottomLeft) * xWeight;
          data[target + channel] = Math.round(top + (bottom - top) * yWeight);
        }
      }
    }
  });
}

function blit(source, target, offsetX) {
  for (let y = 0; y < source.height; y += 1) {
    const sourceStart = y * source.width * 4;
    const targetStart = (y * target.width + offsetX) * 4;
    target.data.set(
      source.data.subarray(sourceStart, sourceStart + source.width * 4),
      targetStart,
    );
  }
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

  test("拒绝真实卷卷帧经双线性缩小后伪装成新帧", async () => {
    const packDirectory = resolve("assets/pets/juanjuan");
    const productionAtlas = JSON.parse(
      await readFile(resolve(packDirectory, "atlas.json"), "utf8"),
    );
    const productionImage = decodeRgbaPng(
      await readFile(resolve(packDirectory, "atlas.png")),
    );
    const original = extractFrame(
      productionImage,
      productionAtlas.frames.idle_00,
    );
    const scaled = bilinearResize(
      original,
      Math.round(original.width * 0.8),
      Math.round(original.height * 0.8),
    );
    const image = rgbaImage(
      original.width + scaled.width,
      Math.max(original.height, scaled.height),
      () => undefined,
    );
    blit(original, image, 0);
    blit(scaled, image, original.width);
    const baseline = image.height;
    const manifest = {
      layout: { baseline: { y: baseline } },
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
        idle_00: {
          x: 0,
          y: 0,
          w: original.width,
          h: original.height,
          offsetX: 0,
          offsetY: baseline - original.height,
        },
        idle_01: {
          x: original.width,
          y: 0,
          w: scaled.width,
          h: scaled.height,
          offsetX: 0,
          offsetY: baseline - scaled.height,
        },
      },
    };

    expect(validateProductionPetPixels(manifest, atlas, image)).toContainEqual(
      expect.objectContaining({ code: "production.frame-scaled-duplicate" }),
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
    expect(decoded.data).toHaveLength(atlas.pixelWidth * atlas.pixelHeight * 4);
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
