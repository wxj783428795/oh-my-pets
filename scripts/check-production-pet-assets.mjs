#!/usr/bin/env node

import { resolve } from "node:path";

import { validateProductionPetPack } from "./lib/production-pet-assets.mjs";

const packDirectory = resolve(
  import.meta.dirname,
  "..",
  "assets",
  "pets",
  "juanjuan",
);

try {
  const issues = await validateProductionPetPack(packDirectory);
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`[${issue.code}] ${issue.path}: ${issue.message}`);
    }
    console.error(`正式卷卷机械校验失败：${issues.length} 项`);
    process.exitCode = 1;
  } else {
    console.log(
      "正式卷卷机械校验通过：15 个动作，86 个独立帧，透明边界与基线稳定。",
    );
  }
} catch (error) {
  console.error(`正式卷卷机械校验无法完成：${error.message}`);
  process.exitCode = 1;
}
