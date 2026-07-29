# 接入 Oxlint 前端静态分析

Type: task
Status: claimed
Closeout-Contract: v1
Blocked by: none

## Question

如何在不升级 TypeScript、不替换 `vue-tsc`、不同时引入 ESLint/Oxfmt 的前提下，为 Vue 3、TypeScript、Vitest 和工程脚本增加快速、高信号的静态分析，并统一进入现有 `pnpm lint:web`？

## Scope

- 将 Oxlint 作为开发依赖接入正式主线。
- 使用稳定的 `.oxlintrc.json`，启用与当前仓库相关的原生规则和插件。
- 让 `pnpm lint:web` 顺序运行 Oxlint 与 `vue-tsc --noEmit`。
- 覆盖 `src/ui`、正式根配置和 `scripts`，排除辅助资产、prototype、本地输出与构建产物。
- 处理首次运行发现的真实问题，并为有意模式使用最小、带理由的抑制。
- 为 lint 范围和至少一个关键失败信号提供可重复验证。

## Non-goals

- 升级 TypeScript 6/7，安装 `oxlint-tsgolint` 或启用 type-aware。
- 引入 ESLint 补 Vue template 规则。
- 迁移到 Oxfmt、删除 Prettier或重排全仓格式。
- 借 lint 接入大规模拆分 `App.vue` 或其他热点模块。
- 把 style/nursery 全量规则一次性设为阻塞。

## Completion criteria

- `pnpm lint:web` 同时执行 Oxlint 和 `vue-tsc --noEmit`，任一失败都会返回非零状态。
- Oxlint 配置明确启用 TypeScript、Vue script、Vitest、import、promise 和 Oxc 所需规则，并控制告警噪声。
- lint 不扫描 `reference`、`research`、`.scratch/**/prototypes`、`output`、`target` 或其他生成物。
- 当前正式主线全部通过；首次发现的问题和规则取舍记录在 ticket 中。
- `AGENTS.md` 和相关工程文档同步说明 Oxlint 与 `vue-tsc` 的职责边界。
- 最后相关改动后 `pnpm verify` 通过，完成 Standards + Spec 双轴 review。

## Comments

- 2026-07-29：用户确认采用“普通 Oxlint + 保留 vue-tsc”的路线；TypeScript 编译器升级另行决策，本票不得夹带。
- 2026-07-29：当前保持 `open`，等待独立实施上下文领取。
- 2026-07-29 11:59:59 +0800：已在独立 worktree 从 `main@f7aad27` 领取；确认 `Blocked by: none`，开始按 P1-02 范围实施。

## Closeout Evidence

### Verify

- Status: pending
- Command: `pnpm verify`
- Result: pending

### Manual QA

- Status: pending
- Command: pending
- Result: pending
- Reason: pending

### Review

- Standards: pending
- Spec: pending
- Notes: pending

### Commit

- Status: pending
- Hash: pending

## Answer

待实施。
