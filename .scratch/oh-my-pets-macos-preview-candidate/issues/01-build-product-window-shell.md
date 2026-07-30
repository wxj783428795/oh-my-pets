# 建立宠物／偏好双窗口与菜单栏产品壳

Type: task
Kind: feature
Status: open
Closeout-Contract: v1
Blocked by: none

## Question

如何把当前以预览工作台为默认入口的 Tauri 主线转换为真实桌宠产品壳，使应用
启动后只显示宠物，同时保留独立偏好设置、菜单栏恢复和高级开发预览？

## Scope

- 建立职责明确的 `pet` 与 `preferences` 窗口角色及生命周期。
- 让 `pet` 成为默认可见窗口：透明、无边框、无阴影、始终置顶、跟随所有
  Space、支持普通全屏辅助显示且不抢焦点。
- 让 `preferences` 默认隐藏，只能按需打开；关闭设置窗口不退出应用。
- 把当前预览工作台从正常启动路径移出，保留为高级开发入口所需的独立路由或
  窗口内容。
- 建立菜单栏最小产品入口：显示／隐藏宠物、打开偏好设置、退出应用。
- 统一窗口创建、显示、隐藏和退出路径，避免 WebView 与原生菜单产生两套不一致
  的生命周期。
- 为窗口配置、启动可见性、菜单命令和错误恢复补 Rust／前端自动化测试。
- 更新桌面自动 smoke 与人工 QA，使其验证“只启动宠物”的新产品形态。

## Non-goals

- 本票不实现完整偏好状态、开机启动、安静模式或活动频率。
- 不实现自主运动、拖拽物理、文件投喂或多显示器恢复。
- 不制作正式逐帧“卷卷”，暂时允许使用现有工程资源验证窗口形态。
- 不删除预览工作台，不把开发入口暴露为普通启动界面。
- 不加入 Windows、签名、公证、DMG、自动更新或外部分发。

## Completion Criteria

- 正常 `pnpm dev` 与真实 QA `.app` 启动后只显示 `pet`；偏好设置和开发预览
  不自动出现。
- 宠物窗口透明、无系统边框、始终置顶、不抢焦点，并能在 Space 和普通全屏
  场景保持可见。
- 菜单栏可以隐藏和恢复宠物、打开偏好设置、显式退出；设置窗口关闭后宠物与
  菜单栏继续运行。
- 开发预览仍可通过受控入口打开，且其关闭／异常不影响宠物窗口。
- 自动测试覆盖重复创建、重复显示、窗口已关闭、菜单命令失败和应用退出清理。
- 桌面自动 smoke 与 `pnpm qa:desktop` 已更新并验证实际窗口拓扑、焦点行为和
  菜单栏恢复。
- 最后相关改动后 `pnpm verify` 通过，Standards + Spec 双轴 review 无阻塞项。
- 创建主要实施分支对应、指向 `main` 的 Ready Pull Request，并在最新
  `main` 上通过 `macOS ARM64 最终验证`；只允许 merge commit。

## Implementation Notes

- 开工前在新的实施上下文中读取本票、`../spec.md`、`CONTEXT.md`、
  `docs/adr/0001-tauri-rust-pixijs-desktop-architecture.md` 和当前 Tauri
  配置。
- 优先把窗口角色和原生命令拆出清晰模块，避免继续扩大
  `src-tauri/src/lib.rs` 与 `src/ui/App.vue` 的职责热点。
- 本票是窗口生命周期 tracer bullet；不得用静态截图或 Web 浏览器测试代替真实
  Tauri 窗口验收。

## Comments

- 2026-07-30：用户最终确认预览候选版共享理解。规划 Pull Request 合入
  `main` 后，本票与 `Issue 06` 构成首批可领取 frontier。

## Closeout Evidence

领取并完成后，用实际结果替换以下占位内容；`pending` 状态不得用于关闭。

### Verify

- Status: pending
- Command: `pnpm verify`
- Result: pending

### Manual QA

- Status: pending
- Command: `pnpm qa:desktop`
- Result: pending
- Reason:

### Review

- Standards: pending
- Spec: pending
- Notes: pending

### Commit

- Status: pending
- Hash: pending

## Answer

待实施。
