# 增加 PixiJS 视觉验证与有限核心 E2E

Type: task
Status: resolved
Closeout-Contract: v1
Blocked by: none

## Question

如何使用真实浏览器 Canvas 为 PixiJS 示例宠物建立确定性的视觉回归，并覆盖少量 WebView/UI 核心旅程，同时保持与 P0 原生 desktop smoke 的职责边界？

## Scope

- 选择并接入能驱动真实浏览器、捕获 Canvas 输出的轻量测试方案。
- 建立固定 viewport、DPR、宠物包、时间与动画状态的视觉场景。
- 提供显式基线更新、常规比较和失败 diff 路由。
- 增加少量 WebView/UI 到 PixiJS 的核心 E2E，覆盖首次加载、可见渲染和至少一条失败恢复或重载旅程。
- 必要时建立受控的平台适配 seam，使浏览器测试能够提供确定的 Tauri 输入，但不伪装成原生 GUI 测试。
- 将稳定无人值守检查接入根目录正式验证命令，并同步测试资产与本地输出边界。

## Non-goals

- 重复 P0 已覆盖的 Tauri 启动、托盘隐藏/恢复、点击穿透或诊断导出原生 smoke。
- 自动断言 macOS 菜单栏图标、透明窗口合成或物理点击体验。
- 引入云端视觉 SaaS、完整跨浏览器矩阵或 Windows 图形会话。
- 通过降低像素阈值、忽略整个画布或自动接受基线来获得绿色结果。
- 制作 Issue 06 的首发动画内容或重构整个渲染架构。

## Completion criteria

- 至少一个 PixiJS 视觉场景由真实浏览器 Canvas 生成并与受控基线比较。
- viewport、DPR、资源、时间/动画和字体等影响像素的输入均被固定或明确说明。
- 基线更新只能通过显式命令执行；失败时保留可定位的 expected、actual 或 diff 证据。
- E2E 数量保持有限，至少证明示例宠物首次加载后在真实浏览器渲染器中可见，并覆盖一条有价值的恢复或重载结果。
- ticket 明确列出与 `pnpm qa:desktop:auto`、`pnpm qa:desktop` 的不重叠边界。
- 稳定检查接入 `pnpm verify:core` 或 `pnpm verify`；任何未接入的自动检查必须有经 review 接受的客观原因和不可遗漏的关闭命令。
- 新增测试在重复运行中稳定，不依赖网络、用户主目录或未跟踪的 reference/research 资产。
- 最后相关改动后 `pnpm verify` 通过，完成适用的视觉人工复核和 Standards + Spec 双轴 review。

## Comments

- 2026-07-29：用户确认增加确定性 Pixi 视觉验证和有限核心 E2E，并要求不重复 P0 desktop smoke；当前保持 `open`，等待独立实施上下文领取。
- 2026-07-29 12:47:07 CST：已在分支 `codex/p1-04-visual-e2e` 领取；实施基线为 `9d0ae28328710303667024bc3b69b93af554b6a5`，依赖状态为 `none`。
- 2026-07-29 13:13:31 CST：实现提交为 `616a3295edbe5f52803d0bfed5e9f5f71363f911`；最终验证、视觉基线人工复核与双轴 review 均已完成，关闭 P1-04。

## Closeout Evidence

### Verify

- Status: passed
- Command: `pnpm verify`
- Result: 最后测试改动后通过；Rust 26 个测试、Vitest 97 个测试、Chromium 2 个测试、Oxlint、vue-tsc、Clippy、Web 资产构建、真实 Tauri release build 与 closeout 扫描全部成功。

### Manual QA

- Status: not-applicable
- Command: `pnpm qa:desktop`
- Result: 未执行原生桌面 QA；已人工查看 `tests/e2e/pet-workbench.spec.ts-snapshots/juanjuan-canvas-chromium-darwin.png`，确认 expected 为仓库卷卷宠物包的完整可见 Canvas，且普通比较连续运行稳定。
- Reason: 本票只增加 Web/UI renderer 验证、测试专用 Tauri 输入 seam 和工程门禁，不修改托盘、窗口、点击穿透、诊断或其他原生桌面行为；按非目标不重复 P0 desktop smoke。

### Review

- Standards: passed
- Spec: passed
- Notes: Standards 初审的测试命名约定、ticker/首帧文档归因、端口重复与精确 origin 守卫发现均已修复；修复后两轴复核均为 0 项剩余或新增发现。

### Commit

- Status: committed
- Hash: 616a3295edbe5f52803d0bfed5e9f5f71363f911

## Answer

已固定 `@playwright/test` 1.62.0，并提供把匹配 Chromium 安装到 `target/playwright-browsers/` 的根命令。Playwright 以 900×760 viewport、DPR 1、固定 locale/timezone/color scheme/reduced-motion 和页面时间运行；Pixi renderer 固定 WebGL、停止 ticker、使用受控卷卷资源首帧并显式 render。当前 Canvas expected 只包含图像，不包含字体；页面文字不进入截图且不能改变固定 Canvas 尺寸。

普通 `pnpm test:e2e` 使用 `updateSnapshots: "none"` 做零容差比较，只有 `pnpm test:e2e:update` 能显式更新变化的 expected。actual/diff、trace、HTML report 和浏览器缓存均进入被忽略的 `target/playwright/`，范围与配置测试会拒绝测试 seam、research/reference 或生成物污染覆盖率和关闭范围。

两条有限旅程分别证明真实 Chromium 中首次加载后的 320×320 Pixi WebGL Canvas 可见，以及受控初始宠物包失败后能通过“重新加载示例宠物包”恢复。浏览器 seam 不进入正式 Web 构建，只提供固定 Tauri command 输入，不冒充 Rust backend、WKWebView 或原生 GUI；`pnpm test:e2e` 已接入 `verify:core`。

已知盲区：expected 是 Playwright Chromium 的 macOS/Darwin 平台基线；本票不建立跨浏览器、Windows 图形会话或云视觉矩阵，也不覆盖任何 P0 原生桌面交互。Playwright 升级或更换受控渲染环境时需显式重装 Chromium 并人工审阅基线变化。
