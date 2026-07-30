# 完成首次引导与偏好设置体验

Type: task
Kind: feature
Status: open
Closeout-Contract: v1
Blocked by: 02, 04, 05, 06

## Question

如何在不打断用户、不暴露工程工作台的前提下，用正式“卷卷”完成一次性首次
引导，并把已经实现的菜单、状态和诊断能力整理成封板级偏好设置体验？

## Scope

- 首次启动只显示宠物，播放 `intro`，并在 15 秒内完成整个引导。
- 在 `intro` 后最多显示两条自动消失、非模态、不抢焦点的提示：
  - 可以点击、拖动或投喂文件
  - 更多控制在菜单栏
- 引导不得要求用户完成操作，不得阻断宠物输入，也不得自动打开偏好设置。
- 成功显示后保存“一次性引导已完成”；正常重启不再显示。
- 偏好设置“重新显示新手提示”会显式重放引导；引导状态损坏时安全地重放一次。
- 完成偏好设置最终信息结构和文案：
  - 小／中／大尺寸
  - 低／标准／高活动频率
  - 开机启动
  - 重新加载内置“卷卷”
  - 重新显示新手提示
  - 导出本地诊断摘要
  - 折叠的“高级”开发预览入口
- 所有控件使用 Rust 状态事实来源，提供忙碌、成功和可理解的本地失败反馈；
  重复点击、窗口关闭和异步乱序不得造成界面漂移。
- 偏好设置不抢夺宠物状态；关闭／重开后读取当前真实值。
- 为首次／非首次启动、重放、损坏恢复、异步失败、菜单打开和控件可访问名称补
  前端与 Rust 测试。
- 更新真实浏览器视觉基线和桌面 QA 清单，人工审阅正式“卷卷”、引导提示与
  偏好设置。

## Non-goals

- 不增加模态向导、账号、登录、许可弹窗、系统通知或强制教学步骤。
- 不加入声音、逐动作设置、概率、物理参数、复杂排程或始终置顶开关。
- 不把开发预览放到普通设置首屏，不提供用户宠物包导入。
- 不在本票重写窗口、行为或美术底层；独立缺陷按 blocker 或 bug ticket 处理。
- 不增加正式安装、签名、公证或外部分发流程。

## Completion Criteria

- 全新状态下，真实 `.app` 启动只显示正式卷卷，`intro` 与不超过两条提示在
  15 秒内完成，全程不抢焦点。
- 正常重启不重复引导；用户主动重放可以再次看到完整流程；损坏状态不会阻塞
  启动。
- 菜单栏和偏好设置控制项、默认值、当前状态与 `spec.md` 完全一致。
- 设置窗口关闭／重开、命令失败和并发操作后都显示 Rust 当前事实，不出现假成功
  或永久 loading。
- 高级开发预览可用但默认折叠；普通用户路径没有旧工作台文案或工程状态摘要。
- 控件可通过键盘操作并具备可理解的辅助技术名称；提示不会遮挡宠物关键命中区。
- `pnpm qa:desktop` 人工验证首次启动、第二次启动、重放、全部设置、菜单同步和
  关闭恢复。
- 最后相关改动后 `pnpm verify` 通过，Standards + Spec 双轴 review 无阻塞项。
- 创建主要实施分支对应、指向 `integration/macos-preview-candidate` 的 Ready
  Pull Request，并在最新 integration 上通过 `macOS ARM64 最终验证`；只允许
  merge commit。

## Implementation Notes

- 引导提示是产品壳 UI，不属于宠物包行为脚本；宠物包只提供 `intro` 动画与
  `bubbleAnchor`。
- 浏览器视觉测试只覆盖 Web/UI 渲染，真实透明合成、菜单栏和焦点必须由桌面
  QA 证明。
- 文案保持短而具体，不把“文件投喂”描述成上传、导入或消费文件。

## Comments

- 2026-07-30：用户确认一次性非阻塞引导、最多两条提示和可重放规则，并确认
  菜单栏／偏好设置最终最小集合。
- 2026-07-30：按用户批准的新策略迁移到
  `integration/macos-preview-candidate`；本票等待 `Issue 02`、`04`、`05`、
  `06` 的 Pull Request 全部合入 integration 并完成 closeout 后再领取。
- 2026-07-30：历史迁移例外：planning 资产已在新生命周期规则生效前通过 Pull
  Request #4 进入 `main`，因此不伪造 planning bootstrap。例外仅校正本专题
  交付路由，不改写 `main`；风险是流程资产曾表达错误 target。补救为从
  `main@6f06cc7` 建立受保护 integration、治理 PR 完整门禁、逐票 closeout 和
  最终全规格 review。

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
