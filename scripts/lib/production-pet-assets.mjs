import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";

export const PRODUCTION_ACTIONS = Object.freeze({
  intro: { frameCount: 8, loop: false },
  idle: { frameCount: 6, loop: true },
  walk_left: { frameCount: 6, loop: true },
  walk_right: { frameCount: 6, loop: true },
  sleep: { frameCount: 5, loop: true },
  drag_hold: { frameCount: 2, loop: true },
  fall: { frameCount: 3, loop: true },
  land: { frameCount: 4, loop: false },
  tap_react: { frameCount: 5, loop: false },
  feed_react: { frameCount: 7, loop: false },
  curious: { frameCount: 5, loop: true },
  edge_play: { frameCount: 5, loop: true },
  quiet_idle: { frameCount: 4, loop: true },
  rare_1: { frameCount: 10, loop: false },
  rare_2: { frameCount: 10, loop: false },
});

const GROUNDED_ACTIONS = new Set([
  "idle",
  "walk_left",
  "walk_right",
  "sleep",
  "land",
  "tap_react",
  "feed_react",
  "curious",
  "edge_play",
  "quiet_idle",
  "rare_1",
]);
const MIN_MEDIAN_FRAME_HEIGHT = Object.freeze({
  intro: 200,
  idle: 220,
  walk_left: 210,
  walk_right: 210,
  sleep: 120,
  drag_hold: 200,
  fall: 180,
  land: 190,
  tap_react: 220,
  feed_react: 220,
  curious: 220,
  edge_play: 220,
  quiet_idle: 190,
  rare_1: 220,
  rare_2: 205,
});
const NORMALIZED_SIGNATURE_EDGE = 48;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function issue(code, path, message) {
  return { code, path, message };
}

function pointInsideCanvas(point, canvas) {
  return (
    Number.isInteger(point?.x) &&
    Number.isInteger(point?.y) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= canvas.width &&
    point.y <= canvas.height
  );
}

function rectInsideCanvas(rect, canvas) {
  return (
    Number.isInteger(rect?.x) &&
    Number.isInteger(rect?.y) &&
    Number.isInteger(rect?.width) &&
    Number.isInteger(rect?.height) &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= canvas.width &&
    rect.y + rect.height <= canvas.height
  );
}

function validateIdentityAndFormat(manifest) {
  const issues = [];
  if (manifest.id !== "juanjuan-cat" || manifest.version !== "1.0.0") {
    issues.push(
      issue(
        "production.identity",
        "pet.json",
        "正式卷卷必须使用 juanjuan-cat@1.0.0 身份",
      ),
    );
  }
  if (
    manifest.canvas?.width !== 320 ||
    manifest.canvas?.height !== 320 ||
    manifest.renderer !== "sprite-atlas-v1" ||
    manifest.atlasPath !== "atlas.json"
  ) {
    issues.push(
      issue(
        "production.format",
        "pet.json",
        "正式卷卷必须使用 320×320 的 sprite-atlas-v1 单图集格式",
      ),
    );
  }
  return issues;
}

function validateActionNames(manifest) {
  const expectedActionNames = Object.keys(PRODUCTION_ACTIONS);
  const actualActionNames = Object.keys(manifest.actions ?? {});
  if (
    actualActionNames.length === expectedActionNames.length &&
    expectedActionNames.every((name) => actualActionNames.includes(name))
  ) {
    return [];
  }
  return [
    issue(
      "production.actions",
      "pet.json.actions",
      "正式卷卷必须且只能实现约定的 15 个语义动作",
    ),
  ];
}

function recordFrameReference(usedFrameRefs, actionName, frame, index) {
  const firstUse = usedFrameRefs.get(frame.ref);
  if (!firstUse) {
    usedFrameRefs.set(frame.ref, `${actionName}[${index}]`);
    return [];
  }
  return [
    issue(
      "production.frame-ref-reused",
      `pet.json.actions.${actionName}.frames[${index}].ref`,
      `正式逐帧动画不能复用 ${frame.ref}（首次用于 ${firstUse}）`,
    ),
  ];
}

function validateActionContract(actionName, contract, action, usedFrameRefs) {
  if (!action) {
    return [];
  }
  const issues = [];
  if (action.frames?.length !== contract.frameCount) {
    issues.push(
      issue(
        "production.action-frame-count",
        `pet.json.actions.${actionName}.frames`,
        `${actionName} 必须包含 ${contract.frameCount} 个逐帧姿态`,
      ),
    );
  }
  if (action.loop !== contract.loop) {
    issues.push(
      issue(
        "production.action-loop",
        `pet.json.actions.${actionName}.loop`,
        `${actionName} 的循环语义与正式动作契约不一致`,
      ),
    );
  }
  for (const [index, frame] of (action.frames ?? []).entries()) {
    issues.push(
      ...recordFrameReference(usedFrameRefs, actionName, frame, index),
    );
  }
  return issues;
}

function validateActions(manifest) {
  const issues = [...validateActionNames(manifest)];
  const usedFrameRefs = new Map();
  for (const [actionName, contract] of Object.entries(PRODUCTION_ACTIONS)) {
    issues.push(
      ...validateActionContract(
        actionName,
        contract,
        manifest.actions?.[actionName],
        usedFrameRefs,
      ),
    );
  }
  return { issues, usedFrameRefs };
}

function validateAtlasMetadata(atlas, usedFrameRefs) {
  const issues = [];
  const expectedFrameCount = Object.values(PRODUCTION_ACTIONS).reduce(
    (total, action) => total + action.frameCount,
    0,
  );
  const atlasFrameNames = Object.keys(atlas.frames ?? {});
  if (
    usedFrameRefs.size !== expectedFrameCount ||
    atlasFrameNames.length !== expectedFrameCount
  ) {
    issues.push(
      issue(
        "production.total-frame-count",
        "atlas.json.frames",
        `正式卷卷必须包含并使用 ${expectedFrameCount} 个独立帧`,
      ),
    );
  }
  for (const frameName of atlasFrameNames) {
    if (!usedFrameRefs.has(frameName)) {
      issues.push(
        issue(
          "production.frame-unused",
          `atlas.json.frames.${frameName}`,
          "正式图集不允许未使用帧",
        ),
      );
    }
  }
  if (atlas.imagePath !== "atlas.png") {
    issues.push(
      issue(
        "production.atlas-path",
        "atlas.json.imagePath",
        "正式卷卷图集文件必须为 atlas.png",
      ),
    );
  }
  return issues;
}

function validateLayout(manifest) {
  const canvas = manifest.canvas ?? {};
  const layout = manifest.layout ?? {};
  const invalid =
    layout.baseline?.x !== 160 ||
    layout.baseline?.y !== 288 ||
    !pointInsideCanvas(layout.bubbleAnchor, canvas) ||
    !rectInsideCanvas(layout.hitbox, canvas) ||
    !rectInsideCanvas(layout.dropZone, canvas);
  if (!invalid) {
    return [];
  }
  return [
    issue(
      "production.layout",
      "pet.json.layout",
      "正式卷卷的基线、气泡锚点、命中区和投喂区必须落在标准画布内",
    ),
  ];
}

function framePlacementInsideCanvas(frame, canvas) {
  return rectInsideCanvas(
    {
      x: frame?.offsetX,
      y: frame?.offsetY,
      width: frame?.w,
      height: frame?.h,
    },
    canvas,
  );
}

function validateActionFrameOccupancy(actionName, heights) {
  const minimum = MIN_MEDIAN_FRAME_HEIGHT[actionName];
  if (!minimum || heights.length === 0) {
    return [];
  }
  const sorted = heights.toSorted((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median >= minimum) {
    return [];
  }
  return [
    issue(
      "production.frame-occupancy",
      `atlas.json.frames (${actionName})`,
      `${actionName} 的中位主体高度 ${median}px 小于正式视觉下限 ${minimum}px`,
    ),
  ];
}

function validateCanvasFramePlacements(manifest, atlas) {
  const issues = [];
  for (const [actionName, action] of Object.entries(manifest.actions ?? {})) {
    const heights = [];
    for (const frameRef of action.frames ?? []) {
      const frame = atlas.frames?.[frameRef.ref];
      if (!frame) {
        continue;
      }
      heights.push(frame.h);
      if (!framePlacementInsideCanvas(frame, manifest.canvas ?? {})) {
        issues.push(
          issue(
            "production.frame-canvas-bounds",
            `atlas.json.frames.${frameRef.ref}`,
            "帧在标准 320×320 画布中的放置必须完整可见",
          ),
        );
      }
    }
    issues.push(...validateActionFrameOccupancy(actionName, heights));
  }
  return issues;
}

export function validateProductionPetMetadata(manifest, atlas) {
  const actions = validateActions(manifest);
  return [
    ...validateIdentityAndFormat(manifest),
    ...actions.issues,
    ...validateAtlasMetadata(atlas, actions.usedFrameRefs),
    ...validateLayout(manifest),
    ...validateCanvasFramePlacements(manifest, atlas),
  ];
}

function pixelOffset(image, x, y) {
  return (y * image.width + x) * 4;
}

function alphaBounds(image, frame) {
  let minX = frame.w;
  let minY = frame.h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < frame.h; y += 1) {
    for (let x = 0; x < frame.w; x += 1) {
      const alpha =
        image.data[pixelOffset(image, frame.x + x, frame.y + y) + 3];
      if (alpha === 0) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX === -1 ? null : { minX, minY, maxX, maxY };
}

function frameBytes(image, frame) {
  const bytes = new Uint8Array(frame.w * frame.h * 4);
  for (let y = 0; y < frame.h; y += 1) {
    const sourceStart = pixelOffset(image, frame.x, frame.y + y);
    const targetStart = y * frame.w * 4;
    bytes.set(
      image.data.subarray(sourceStart, sourceStart + frame.w * 4),
      targetStart,
    );
  }
  return bytes;
}

function normalizedFrameSignature(image, frame, bounds) {
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const normalized = new Uint8Array(
    NORMALIZED_SIGNATURE_EDGE * NORMALIZED_SIGNATURE_EDGE * 4,
  );
  for (let y = 0; y < NORMALIZED_SIGNATURE_EDGE; y += 1) {
    const sourceY =
      frame.y +
      bounds.minY +
      Math.min(
        height - 1,
        Math.floor(((y + 0.5) * height) / NORMALIZED_SIGNATURE_EDGE),
      );
    for (let x = 0; x < NORMALIZED_SIGNATURE_EDGE; x += 1) {
      const sourceX =
        frame.x +
        bounds.minX +
        Math.min(
          width - 1,
          Math.floor(((x + 0.5) * width) / NORMALIZED_SIGNATURE_EDGE),
        );
      const source = pixelOffset(image, sourceX, sourceY);
      const target = (y * NORMALIZED_SIGNATURE_EDGE + x) * 4;
      normalized.set(image.data.subarray(source, source + 4), target);
    }
  }
  return createHash("sha256").update(normalized).digest("hex");
}

function frameInsideImage(frame, image) {
  return (
    frame.x >= 0 &&
    frame.y >= 0 &&
    frame.w > 0 &&
    frame.h > 0 &&
    frame.x + frame.w <= image.width &&
    frame.y + frame.h <= image.height
  );
}

function validateAlphaCrop(frameName, frame, bounds) {
  if (
    bounds.minX === 0 &&
    bounds.minY === 0 &&
    bounds.maxX === frame.w - 1 &&
    bounds.maxY === frame.h - 1
  ) {
    return [];
  }
  return [
    issue(
      "production.frame-transparent-edge",
      `atlas.json.frames.${frameName}`,
      "帧裁剪边界必须紧贴可见像素，不能保留整帧透明留白",
    ),
  ];
}

function validateFrameBaseline(
  manifest,
  frameActions,
  frameName,
  frame,
  bounds,
) {
  if (!GROUNDED_ACTIONS.has(frameActions.get(frameName))) {
    return [];
  }
  const visibleBottom = frame.offsetY + bounds.maxY + 1;
  if (Math.abs(visibleBottom - manifest.layout.baseline.y) <= 2) {
    return [];
  }
  return [
    issue(
      "production.baseline-drift",
      `atlas.json.frames.${frameName}.offsetY`,
      `落地动作可见底边 ${visibleBottom} 偏离统一脚底基线 ${manifest.layout.baseline.y}`,
    ),
  ];
}

function validateUniqueSignature(
  signatures,
  signature,
  frameName,
  code,
  comparison,
  imitation,
) {
  const match = signatures.get(signature);
  if (!match) {
    signatures.set(signature, frameName);
    return [];
  }
  return [
    issue(
      code,
      `atlas.json.frames.${frameName}`,
      `帧${comparison}与 ${match} 相同，不能用${imitation}冒充逐帧动画`,
    ),
  ];
}

function validateFramePixels({
  manifest,
  image,
  frameActions,
  rawSignatures,
  normalizedSignatures,
  frameName,
  frame,
}) {
  const issues = [];
  if (!frameInsideImage(frame, image)) {
    return [
      issue(
        "production.frame-bounds",
        `atlas.json.frames.${frameName}`,
        "帧超出实际图集像素范围",
      ),
    ];
  }
  const bounds = alphaBounds(image, frame);
  if (!bounds) {
    return [
      issue(
        "production.frame-empty",
        `atlas.json.frames.${frameName}`,
        "正式帧不能完全透明",
      ),
    ];
  }
  issues.push(
    ...validateAlphaCrop(frameName, frame, bounds),
    ...validateFrameBaseline(manifest, frameActions, frameName, frame, bounds),
  );

  const rawSignature = createHash("sha256")
    .update(frameBytes(image, frame))
    .digest("hex");
  issues.push(
    ...validateUniqueSignature(
      rawSignatures,
      rawSignature,
      frameName,
      "production.frame-pixel-duplicate",
      "像素",
      "整体平移",
    ),
  );

  const normalizedSignature = normalizedFrameSignature(image, frame, bounds);
  issues.push(
    ...validateUniqueSignature(
      normalizedSignatures,
      normalizedSignature,
      frameName,
      "production.frame-scaled-duplicate",
      "归一化后",
      "简单缩放",
    ),
  );
  return issues;
}

export function validateProductionPetPixels(manifest, atlas, image) {
  const frameActions = new Map();
  for (const [actionName, action] of Object.entries(manifest.actions ?? {})) {
    for (const frame of action.frames ?? []) {
      frameActions.set(frame.ref, actionName);
    }
  }
  const rawSignatures = new Map();
  const normalizedSignatures = new Map();
  return Object.entries(atlas.frames ?? {}).flatMap(([frameName, frame]) =>
    validateFramePixels({
      manifest,
      image,
      frameActions,
      rawSignatures,
      normalizedSignatures,
      frameName,
      frame,
    }),
  );
}

function paethPredictor(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function unfilterScanline(filter, source, previous, bytesPerPixel) {
  const result = new Uint8Array(source.length);
  for (let index = 0; index < source.length; index += 1) {
    const left = index >= bytesPerPixel ? result[index - bytesPerPixel] : 0;
    const above = previous?.[index] ?? 0;
    const upperLeft =
      previous && index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
    switch (filter) {
      case 0:
        result[index] = source[index];
        break;
      case 1:
        result[index] = (source[index] + left) & 0xff;
        break;
      case 2:
        result[index] = (source[index] + above) & 0xff;
        break;
      case 3:
        result[index] = (source[index] + Math.floor((left + above) / 2)) & 0xff;
        break;
      case 4:
        result[index] =
          (source[index] + paethPredictor(left, above, upperLeft)) & 0xff;
        break;
      default:
        throw new Error(`不支持的 PNG 扫描线过滤器：${filter}`);
    }
  }
  return result;
}

export function decodeRgbaPng(bytes) {
  const png = Buffer.from(bytes);
  if (
    png.length < PNG_SIGNATURE.length ||
    !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    throw new Error("图集不是有效 PNG");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const compressedParts = [];
  for (let offset = PNG_SIGNATURE.length; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) {
      throw new Error(`PNG ${type} 数据越界`);
    }
    const data = png.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      compressedParts.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  if (
    width <= 0 ||
    height <= 0 ||
    bitDepth !== 8 ||
    colorType !== 6 ||
    interlace !== 0 ||
    compressedParts.length === 0
  ) {
    throw new Error("正式图集必须是 8-bit、非交错、RGBA（color type 6）PNG");
  }

  const bytesPerPixel = 4;
  const rowLength = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(compressedParts));
  if (inflated.length !== height * (rowLength + 1)) {
    throw new Error("PNG 解压后的扫描线长度与 IHDR 不一致");
  }
  const data = new Uint8Array(width * height * bytesPerPixel);
  let previous = null;
  for (let row = 0; row < height; row += 1) {
    const sourceOffset = row * (rowLength + 1);
    const scanline = unfilterScanline(
      inflated[sourceOffset],
      inflated.subarray(sourceOffset + 1, sourceOffset + 1 + rowLength),
      previous,
      bytesPerPixel,
    );
    data.set(scanline, row * rowLength);
    previous = scanline;
  }
  return { width, height, data };
}

export async function validateProductionPetPack(packDirectory) {
  const [manifestRaw, atlasRaw] = await Promise.all([
    readFile(resolve(packDirectory, "pet.json"), "utf8"),
    readFile(resolve(packDirectory, "atlas.json"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestRaw);
  const atlas = JSON.parse(atlasRaw);
  const image = decodeRgbaPng(
    await readFile(resolve(packDirectory, atlas.imagePath)),
  );
  const issues = [
    ...validateProductionPetMetadata(manifest, atlas),
    ...validateProductionPetPixels(manifest, atlas, image),
  ];
  if (image.width !== atlas.pixelWidth || image.height !== atlas.pixelHeight) {
    issues.push(
      issue(
        "production.atlas-size",
        atlas.imagePath,
        `实际图集 ${image.width}×${image.height} 与 atlas.json 声明不一致`,
      ),
    );
  }
  return issues;
}
