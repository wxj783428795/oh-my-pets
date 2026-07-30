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
- 2026-07-30 12:31 CST：首次人工 QA 发现正常 `.app` 启动会抢走 Codex
  输入焦点，且人工命令在待观察实例前先可见运行自动 smoke，造成宠物／偏好设置
  闪动。最小复现确认普通 `NSApplicationActivationPolicyRegular` 会在 100 ms
  内成为前台应用；补充真实前台 PID 门禁后旧实现按预期失败。修复采用
  `LSUIElement` bundle 身份与运行时 `Accessory` 激活策略，并将自动 smoke 与
  单次人工启动拆分，避免把自动窗口活动混入人工启动观察。
- 2026-07-30 12:47 CST：第二轮人工 QA 发现旧
  `CanJoinAllSpaces + FullScreenAuxiliary` 只能跨 Space，无法覆盖其他应用普通
  全屏。依据 macOS 13+ 的原生窗口集合语义补充
  `CanJoinAllApplications`，并清除互斥的 `Primary`／`Auxiliary` 角色位；原生
  行为测试先红后绿。
- 2026-07-30 13:18 CST：Standards 复审发现旧焦点门禁只排除宠物 PID，无法
  证明原前台应用始终未变，且人工 QA 可复用过期自动报告。修复后门禁要求全部
  采样严格等于启动前 PID；自动报告同时绑定桌面源码 SHA-256 指纹，覆盖
  `src`、`src-tauri`、`assets`、`scripts`、根 `index.html` 与工具链／构建
  配置。缺失、失败或指纹不匹配的报告会拒绝进入人工 QA。
- 2026-07-30 13:24 CST：严格冷启动门禁进一步发现仅在 Tauri `setup` 中切换
  `Accessory` 仍可能晚于系统激活；将激活策略提前到 event loop 启动之前后，
  bundle 冷启动两次前台 PID 采样均保持为原应用。最终退出验收还暴露了子进程
  退出事件与状态检查之间的竞态，按先订阅、再复查、最后超时兜底的顺序修复并
  添加回归测试。
- 2026-07-30 13:29 CST：用户在最终源码指纹对应的真实 `.app` 中逐项确认单次
  启动与焦点、透明合成、Space／其他应用普通全屏、菜单栏隐藏／恢复、偏好设置
  重建、受控开发入口、物理点击穿透与菜单退出全部通过；应用持续运行到退出项
  并以退出码 0 干净结束。
- 2026-07-30 13:38 CST：最终 Standards 复审发现退出竞态测试只覆盖“监听后
  退出”，没有覆盖“调用 helper 前已经退出且事件已错过”的关键分支；补充
  预退出状态回归测试后 desktop QA 单测为 16/16。同期修正本票在 `App.vue`
  引入的一处多余缩进。
- 2026-07-30 13:41 CST：上述测试／格式修正改变桌面源码指纹，因此旧验证证据
  按规范失效。已在最终源码上重新运行 `pnpm verify`、自动 smoke 与单次人工
  QA；用户再次从真实菜单栏执行退出并确认通过。

## Closeout Evidence

领取并完成后，用实际结果替换以下占位内容；`pending` 状态不得用于关闭。

### Verify

- Status: passed
- Command: `pnpm verify`
- Result: 2026-07-30 13:39 CST 通过；scope／architecture、34 个 Rust
  测试、134 个 Web 测试、2 个 Chromium E2E、lint、WebView 构建、release
  Tauri 构建与 closeout 扫描均通过。

### Manual QA

- Status: passed
- Command: `pnpm qa:desktop`
- Result: `pnpm qa:desktop:auto` 于 2026-07-30 13:39 CST 通过 8 项真实 Tauri
  smoke，且前台 PID 两次采样均保持为原应用；用户于 13:41 CST 在单次启动的
  真实 `.app` 中确认 6 项人工清单全部通过。自动与人工报告的源码指纹均为
  `a9c39b89225f71c011862e660f949569d1543e6a236db9f5352f7382dc69795f`，
  人工报告记录
  `appStayedRunningUntilExitCheck=true`、`appExitedCleanly=true`、
  `passed=true`。

### Review

- Standards: passed
- Spec: passed
- Notes: 最终双轴复审均为 `Blocking findings: 0`。Standards 首轮发现
  退出竞态的预退出分支缺少回归测试，修复后确认该项与格式观察均已关闭；因修复
  使验证证据失效，已重跑完整验证和桌面 QA，并在相同最终源码指纹上完成复核。

### Commit

- Status: committed
- Hash: `ea1dc6f7ef7d547ecae6f583c5edf026a6efb3b9`

## Answer

产品窗口壳、最小菜单、偏好设置与受控开发预览已实施，真实用户人工 QA 已通过。
最终 verify、双轴复审与实现提交已完成；远端 required check 尚未通过，本票
保持 `claimed`，不得标记为 `resolved`。
