# 建立宠物／偏好双窗口与菜单栏产品壳

Type: task
Kind: feature
Status: claimed
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
- 创建主要实施分支对应、指向 `integration/macos-preview-candidate` 的 Ready
  Pull Request，并在最新 integration 上通过 `macOS ARM64 最终验证`；只允许
  merge commit。

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
- 2026-07-30：按用户批准的新策略迁移到
  `integration/macos-preview-candidate`；治理迁移 Pull Request 合入后，本票
  从最新 integration 领取并仍属于首批 frontier。
- 2026-07-30：历史迁移例外：planning 资产已在新生命周期规则生效前通过 Pull
  Request #4 进入 `main`，因此不伪造 planning bootstrap。例外仅校正本专题
  交付路由，不改写 `main`；风险是流程资产曾表达错误 target。补救为从
  `main@6f06cc7` 建立受保护 integration、治理 PR 完整门禁、逐票 closeout 和
  最终全规格 review。
- 2026-07-30 11:47 CST：领取本票。实施分支：
  `codex/macos-preview-candidate-01-window-shell`；base：
  `integration/macos-preview-candidate`；base commit：
  `25db4e756335c653d1414882eb742cb0e87de6ee`；Pull Request target：
  `integration/macos-preview-candidate`。
- 2026-07-30：用户已批准本票与 accepted spec；TDD 使用已确认的公共 seams：
  Tauri 窗口配置契约、Rust 窗口／菜单生命周期协调器、WebView 产品路由，以及
  真实桌面 smoke 报告。测试只观察启动可见性、窗口角色、菜单结果和恢复行为，
  不断言私有调用顺序。
- 2026-07-30：首次双轴 review 共发现 4 个阻塞项：开发预览占用设置路由后无法
  恢复、旧工作台错误宣称菜单栏提供点击穿透恢复、人工退出清单与“应用必须存活”
  的 harness 契约冲突、物理点击穿透人工项缺失。现已分别通过固定 allowlist
  路由恢复、文案校正、退出前存活／最终干净退出双状态和恢复人工项修复；Rust
  回归与真实 desktop smoke 覆盖 developer → preferences 闭环，复审两轴均为
  0 个阻塞项。

## Closeout Evidence

领取并完成后，用实际结果替换以下占位内容；`pending` 状态不得用于关闭。

### Verify

- Status: passed
- Command: `pnpm verify`
- Result: 2026-07-30 12:21 CST 通过；Rust workspace、126 个 Web 测试、2 个
  Chromium E2E、scope／architecture、lint、WebView 构建、release Tauri 构建
  与 closeout 扫描均通过。

### Manual QA

- Status: pending
- Command: `pnpm qa:desktop`
- Result: `pnpm qa:desktop:auto` 于 2026-07-30 12:19 CST 通过 8 项真实 Tauri
  自动 smoke，包含启动拓扑、非聚焦窗口属性、菜单隐藏／恢复、
  developer → preferences 路由恢复、设置关闭重建与宠物持续存活。
- Reason: 尚需用户在真实 macOS 交互桌面确认视觉合成、Space／普通全屏、
  真实菜单栏点击、物理点击穿透及最终菜单退出；自动 smoke 不替代这些判断。

### Review

- Standards: passed
- Spec: passed
- Notes: 2026-07-30 双轴复审均为 `Blocking findings: 0`；首次 4 个阻塞项已
  修复并由契约测试、Rust 生命周期测试和真实 desktop smoke 验证。

### Commit

- Status: pending
- Hash: pending

## Answer

产品窗口壳、最小菜单、偏好设置与受控开发预览已实施并通过自动化、真实桌面
smoke 与双轴 review。由于真实用户人工 QA 尚未执行，本票保持 `claimed`，不得
标记为 `resolved`。
