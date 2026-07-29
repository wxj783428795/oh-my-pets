# 增加 PixiJS 视觉验证与有限核心 E2E

Type: task
Status: open
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
