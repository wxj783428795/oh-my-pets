# 接入 Oxlint 前端静态分析

Type: task
Status: resolved
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
- 2026-07-29：Oxlint 1.76.0 等价首次扫描发现 18 处 Vitest mock 缺失函数签名、1 处 Promise 链末端未显式返回、1 处测试只依赖构造副作用，以及 2 个有意的副作用 import。前 20 项均以最小改动修复；CSS 与 `pixi.js/unsafe-eval` 仅通过 `import/no-unassigned-import` 的 `allow` 精确放行，没有关闭 correctness/suspicious 类别。
- 2026-07-29：Standards 与 Spec 双轴 review 及 Windows CLI 可移植性调整后的增量复核均无阻塞或非阻塞发现。
- 2026-07-29：人工桌面 QA 不适用；本票只改变工程 lint、测试类型标注、Node 工具链下限与文档，不改变 Tauri 窗口、菜单栏、渲染或用户交互。
- 2026-07-29 12:16:59 +0800：实现已由中文提交 `c9db2eecec8a37733025da85fedf8e65a63ada02` 固化，随后回写关闭证据。

## Closeout Evidence

### Verify

- Status: passed
- Command: `pnpm verify`
- Result: macOS / Node v22.14.0 环境通过范围检查、26 项 Rust 测试、73 项 Web/Vitest 测试、Rust fmt/Clippy、Oxlint、`vue-tsc`、Vite 构建、真实 Tauri release 构建与 closeout 扫描。

### Manual QA

- Status: not-applicable
- Command: `not-applicable`
- Result: 未运行桌面人工 QA；自动测试、lint 与真实 Tauri 构建覆盖了本票的工程反馈链路。
- Reason: 本票没有用户可见或桌面交互行为变化，人工点击、视觉与窗口验收不能增加与 Oxlint 接入相关的证据。

### Review

- Standards: passed
- Spec: passed
- Notes: 两轴均无阻塞或非阻塞发现；Windows Oxlint CLI 可移植性调整后完成增量复核，结论不变。

### Commit

- Status: committed
- Hash: c9db2eecec8a37733025da85fedf8e65a63ada02

## Answer

已接入固定版本 Oxlint 1.76.0，并通过稳定 `.oxlintrc.json` 启用 `eslint`、`typescript`、`vue`、`vitest`、`import`、`promise` 与 `oxc` 原生插件。`correctness` 和 `suspicious` 均作为 error，warning 也会阻断；`typeAware` 与 `typeCheck` 显式关闭，未安装 `oxlint-tsgolint`。

`pnpm lint:web` 现在先检查 `src/ui`、`scripts` 和 `vite.config.ts`，再运行 `vue-tsc --noEmit`。配置显式排除 `reference`、`research`、prototype、`.codex`、`output`、coverage、`target`、`dist`、`src-tauri/gen` 与 `node_modules`。集成测试会在临时仓库真实执行 Oxlint，证明辅助/生成范围被忽略，并证明正式 Vitest 源码中的无类型 mock 返回非零状态。

首次扫描的 20 个真实代码/测试问题已修复，两个有意副作用 import 使用规则自带 allow 精确放行；没有全局关闭 correctness/suspicious 规则。Oxlint 1.76.0 的运行时要求同时使根 Node 下限、只读 doctor 与恢复文档统一为 22.12+。

已知限制是 Oxlint 当前只分析 Vue `<script>`，不覆盖 template 专用规则；普通模式也不执行 type-aware 规则，Vue/TypeScript 类型诊断继续由 `vue-tsc` 承担。未引入 ESLint、Oxfmt、覆盖率、视觉/E2E 或 TypeScript 升级。
