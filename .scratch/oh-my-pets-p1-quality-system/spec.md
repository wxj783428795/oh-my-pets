# P1 质量反馈与恢复体系规格

Status: accepted

## Context

2026-07-29 的 Better Harness 复核与后续 P0 修复已经补齐真实 Tauri 构建、桌面 smoke、结构化关闭证据和正式主线范围隔离。仓库现在能够证明一次改动是否完成基本交付，但持续开发仍缺少四类中期反馈能力：

- 环境或桌面链路失败后，没有统一、只读、可执行的 doctor 与恢复导航。
- 前端只有 `vue-tsc` 类型检查，没有独立的高信号 lint 层。
- Rust 与 Vitest 测试没有覆盖率基线，无法观察关键分支和后续回退。
- P0 desktop smoke 证明应用能够启动和执行原生操作，但不证明 PixiJS 输出在真实浏览器渲染器中保持视觉稳定，也没有覆盖有限的 WebView 端到端旅程。

用户已经确认按四张独立 ticket 推进 P1。本规格只增强工程反馈、恢复和回归验证，不改变产品范围。

## Goals

- 提供默认只读的 `doctor` 命令和桌面故障恢复导航，让常见环境、端口、构建、窗口与诊断问题具备明确的下一步。
- 使用 Oxlint 增加快速前端静态分析，同时保留 `vue-tsc` 作为 Vue/TypeScript 类型检查。
- 为 Vitest 与 Rust 建立可重复生成的覆盖率报告和首个基线，不设置任意百分比门槛。
- 为 PixiJS 建立确定性的视觉基线，并增加少量浏览器/WebView 层核心 E2E，且不重复 P0 原生 desktop smoke。
- 所有新增能力继续通过根目录 `pnpm` scripts 暴露，并遵守 P0 已建立的主线范围和 closeout 契约。

## Non-goals

- 在 P1 中升级 TypeScript 6 或 TypeScript 7、启用 Oxlint type-aware，或替换 `vue-tsc`。
- 同时引入 ESLint、Oxfmt，或迁移现有 Prettier 配置。
- 设置全局覆盖率百分比、changed-lines 门禁或覆盖率排行榜。
- 引入全量原生 GUI 自动化、Windows 图形会话、云端视觉服务或跨平台发布流水线。
- 重复验证 P0 已覆盖的 Tauri 启动、托盘隐藏/恢复、点击穿透和诊断导出原生 smoke。
- 借工具接入大规模重构 `App.vue`、`src-tauri/src/lib.rs` 或领域校验模块。

## Behavior requirements

### Doctor and recovery

- 根目录提供统一 doctor 命令，默认不修改文件、不清理缓存、不安装依赖、不结束进程。
- doctor 至少检查当前平台、Node、pnpm、Rust/Cargo、Tauri 前置条件、关键端口、正式主线依赖和可定位的诊断/构建路径。
- 每项检查输出稳定的通过、警告或失败状态，并为可恢复问题提供仓库内下一步命令或文档链接。
- 桌面恢复文档覆盖开发端口占用、依赖缺失、构建失败、窗口不可见、菜单栏入口受限、日志与诊断定位，以及安全的手动清理边界。
- 检查逻辑具备可注入或 fixture 驱动的自动化测试，不能依赖开发机当前状态才能验证。

### Oxlint

- Oxlint 作为前端快速 lint 层接入 `pnpm lint:web`，`vue-tsc --noEmit` 继续保留。
- 本阶段使用非类型感知模式，不引入 `oxlint-tsgolint`，不改变当前 TypeScript 主版本。
- 配置优先使用稳定的 `.oxlintrc.json`，启用与当前代码相关的 TypeScript、Vue script、Vitest、import、promise 和 Oxc 原生规则。
- lint 路径只覆盖正式主线前端与工程脚本，显式排除 `reference`、`research`、prototype、本地输出和构建产物。
- 首次接入应处理真实高信号发现；对于有意模式使用局部、带原因的抑制，不通过大范围关闭规则获得绿色结果。
- Vue template 专用规则若仍有缺口，应记录为后续评估，不在本 ticket 中顺带引入 ESLint。

### Coverage baseline

- 根目录提供分别生成 Vitest、Rust 和聚合覆盖率报告的命令。
- 报告至少包含行、函数和分支维度；Rust 工具不具备完全相同维度时，应如实记录工具可提供的指标。
- 报告只分析正式主线源码，排除测试、生成代码、prototype、research、reference 和构建产物。
- 首次成功运行的工具版本、命令、环境和数值写入仓库内基线文档；生成的 HTML、原始 profile 和临时文件保持为本地输出。
- P1 只要求报告成功生成和结果可解释，不以任意百分比阻断 `pnpm verify`。
- doctor 若已存在，应能提示缺失的 Rust coverage 工具；若尚未实施，coverage ticket 自身必须提供明确安装与失败提示。

### Visual validation and focused E2E

- 使用真实浏览器渲染器运行 PixiJS 视觉验证，不用 DOM 快照冒充 Canvas 视觉结果。
- 视觉场景固定 viewport、device pixel ratio、宠物包、时间/动画状态和其他影响像素的输入；基线更新必须由显式命令触发。
- 基线文件属于正式测试资产；diff、截图结果和浏览器临时文件属于本地输出。
- E2E 聚焦 WebView/UI 到 PixiJS 的少量核心旅程，例如首次加载并显示示例宠物、受控失败后恢复、动作或重载结果反映到界面与画布。
- 不重新自动化 P0 已验证的原生托盘、点击穿透和诊断导出；需要原生能力时使用受控适配边界，而不是伪造完整 Tauri E2E。
- 稳定、无人值守的视觉与 E2E 检查应接入正式根命令；若平台能力使某项无法稳定进入 `verify:core`，ticket 必须用证据说明并提供不可遗漏的独立关闭命令。

## Acceptance criteria

- 四张 P1 ticket 均可在独立实施上下文中领取，范围、非目标和验收标准完整。
- `pnpm doctor` 或最终选定的根命令能只读检查环境并指向桌面恢复路径。
- `pnpm lint:web` 同时运行 Oxlint 与 `vue-tsc`，不升级 TypeScript，也不引入 ESLint/Oxfmt。
- Vitest 与 Rust coverage 命令能够生成报告，首个基线有版本和环境说明，且没有百分比门禁。
- PixiJS 视觉基线使用真实浏览器 Canvas 输出，有限 E2E 与 P0 desktop smoke 职责清晰、无重复。
- 新增脚本和关键失败路径具备自动化测试。
- `AGENTS.md`、工程流程或质量文档在引入新命令和目录约定后同步更新。
- 每张实施 ticket 独立完成最终 `pnpm verify`、适用的人工 QA、Standards + Spec review、中文提交和 v1 closeout 记录。

## Ticket map

推荐实施顺序如下，但四张 ticket 没有产品代码层面的硬依赖，可独立领取：

- `P1-01`：增加 doctor 与桌面故障恢复路由。
- `P1-02`：接入 Oxlint，并保留 `vue-tsc`。
- `P1-03`：建立 Vitest 与 Rust 覆盖率基线。
- `P1-04`：增加确定性 PixiJS 视觉验证和有限核心 E2E。

## Decision notes

- 2026-07-29：用户接受四票拆分和推荐实施顺序。
- 2026-07-29：Oxlint 当前阶段只使用非类型感知模式。TypeScript 7 已正式发布，但 Vue/Volar 工具链仍依赖旧的 TypeScript 编程 API；编译器升级必须作为后续独立决策，不能夹带在 lint 接入中。
- 2026-07-29：Oxfmt 保留为后续候选；P1 继续使用现有 Prettier，避免同时迁移 lint 与 formatter。
