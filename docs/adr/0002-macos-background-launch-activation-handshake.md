---
status: accepted
date: 2026-07-30
---

# macOS 后台启动与宠物交互采用分层激活策略

macOS 菜单栏桌宠正常启动时不得打断用户正在其他应用中的键盘输入。仅配置
`LSUIElement`、`focus: false`、`focusable: false` 和
`NSApplicationActivationPolicyAccessory` 不足以保证这一点：在当前 Tauri/TAO
启动链中，TAO 会在 `applicationDidFinishLaunching` 阶段调用
`activateIgnoringOtherApps(true)`。应用可能始终没有成为前台进程，却仍让原前台
窗口的 first responder 丢失，因此只采样前台 PID 会产生假阴性。

macOS 主线在进入 Tauri 事件循环前使用
`NSApplicationActivationPolicyProhibited`，使 TAO 的启动激活请求不能影响其他
应用；完成产品状态、宠物窗口和菜单栏 setup 后，再切换为
`NSApplicationActivationPolicyAccessory`。切换本身不主动激活应用。偏好设置
等由用户明确发起的交互仍可按正常 Accessory 应用行为获取焦点。

Accessory 只解决启动握手，不能让可点击的普通 `NSWindow` 在物理点击时保持其他
应用的 first responder。宠物窗口在 setup 中转换为 `NSPanel`，使用
`NSWindowStyleMaskNonactivatingPanel`，并同时禁止成为 key/main window；偏好设置
继续使用普通 `NSWindow`。因此宠物可接收点击和拖拽，而其物理点击不激活应用；
启动、显示、召回和移动路径也不得调用显式激活或聚焦 API。

## Considered Options

- 只依赖 `LSUIElement` 和窗口 `focus: false` 无法保护其他应用已有的 first
  responder。
- 启动前直接使用 Accessory 策略仍会经过 TAO 的强制激活路径，实机连续输入探针
  可以稳定复现输入中断。
- 永久使用 Prohibited 策略会削弱偏好设置等显式交互，不符合产品窗口拓扑。
- setup 后在宠物独处期间切回 Prohibited 虽能保护其他应用的 first responder，
  但用户先操作其他应用后，普通宠物窗口无法再收到首次点击或拖拽。
- 给普通 `NSWindow` 直接添加 `NSWindowStyleMaskNonactivatingPanel` 会被 AppKit
  拒绝；非激活样式必须用于 `NSPanel` 或其子类。
- 禁用 Tauri 默认 macOS 菜单、延迟显示窗口或跳过产品 setup 都不能消除问题，
  说明根因不在菜单、WebView 或 Issue 02 状态初始化。
- vendoring 或修改 TAO 可以关闭强制激活，但会引入不必要的上游分叉；若未来
  Tauri 暴露 `set_activate_ignoring_other_apps(false)` 等正式能力，可重新评估
  本决策。

## Consequences

启动激活策略的先后顺序和宠物原生窗口类型都是平台生命周期契约，不是可随意
合并的重复设置。`tauri-nspanel` 固定到受审阅的不可变提交；升级该依赖、Tauri、
TAO 或 macOS 最低版本时，必须重新运行能够持续向独立输入控件发送按键的真实
启动探针，并完成人工物理点击后的连续输入与拖拽验证；只确认宠物没有成为前台
进程不够。

排查同类问题时先区分“前台应用切换”和“first responder 丢失”，再按
[`docs/desktop-recovery.md`](../desktop-recovery.md) 的启动焦点章节逐层缩小到
Launch Services、Tauri/TAO 事件循环、窗口创建或产品 setup。Issue ticket 保留
当次时间线和验收证据，本 ADR 保存长期原因、约束与升级触发条件。
