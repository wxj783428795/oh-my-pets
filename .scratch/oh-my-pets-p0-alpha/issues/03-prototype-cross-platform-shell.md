# 用最小样机验证双平台桌宠壳

Type: prototype
Status: resolved
Blocked by: 02

## Question

选定架构能否在 macOS 与 Windows 上稳定实现透明置顶、宠物拖拽、文件拖放、点击穿透、跨桌面或多显示器、DPI 缩放和系统托盘等关键行为？请重点验证点击穿透与文件拖放能否共存，并记录平台差异、权限要求、性能数据和不可接受的失败模式。

## Comments

- 2026-07-28 已创建 throwaway Tauri 2 / Rust 样机：`.scratch/oh-my-pets-p0-alpha/prototypes/desktop-shell-smoke/`。入口命令见同目录 `README.md`。
- 当前环境为 macOS 14+ Apple Silicon、Xcode 15.4、Node.js 22.14.0、pnpm 10.27.0、Rust 1.97.1。`cargo check` 与 `pnpm build` 已通过，`pnpm tauri dev` 可启动窗口。
- 样机已落地这些验证控件：透明无边框窗口、托盘菜单、置顶切换、全空间切换、点击穿透切换、拖动窗口、回到底角、文件拖放日志。
- macOS 侧已确认一个真实平台约束：透明窗口必须启用 `src-tauri/tauri.conf.json > app.macOSPrivateApi = true`；未开启时，Tauri 运行时会明确提示透明窗不可用。
- 已截图确认窗口外观和半透明叠加效果，截图保存在 Codex 会话目录：`/Users/xiaojie.wu/.codex/visualizations/2026/07/28/019fa792-db17-7d60-a477-8824c0ab6d50/desktop-shell-smoke.png`。
- 2026-07-28 15:56 CST 在 macOS 上完成一次可复现的真实拖放实验：Finder 测试窗固定在 `{80,120,620,620}`，文件图标相对 Finder 窗口固定在 `{120,120}`，样机窗口固定在 `{1100,360}`。默认可交互态下，用 Swift 合成鼠标拖放把 `sample-drop.txt` 从 Finder 拖入样机窗口，`tauri dev` 终端打印了 `检测到 1 个文件进入投喂区域` 和 `收到文件投喂：sample-drop.txt`。
- 2026-07-28 15:57 CST 在相同窗口布局与相同拖放轨迹下，使用环境变量 `OH_MY_PETS_SHELL_SMOKE_CLICK_THROUGH=1` 让样机启动即进入穿透态；终端只打印 `startup click-through enabled`，随后 5 秒内没有任何新的拖放日志。当前结论是：在 macOS + Tauri 2 + 透明 WebView 窗口这条路线上，整窗点击穿透与系统级文件拖放不能共存。
- 辅助截图：默认态布局与穿透态布局分别保存在 `drag-setup.png`、`click-through-layout.png`；源点校准与窗口重定位截图保存在同一 Codex 会话目录。
- 尚未完成的实测项：Spaces/Stage Manager、多显示器与混合 DPI、Windows 11 侧运行与托盘/穿透差异。“点击穿透与文件拖放是否共存”这个核心问题在 macOS 侧已经得到否定结论；其余缺口不再阻止本 ticket 形成规划阶段结论，但会继续作为后续实施与发布阻塞项存在。
- 2026-07-28 当前手头没有 Windows 电脑，也没有可立即使用的 Windows 11 云桌面或 CI 图形会话，因此本 ticket 无法在本轮继续补完 Windows 侧实测。这个缺口不是“暂时没跑”，而是当前仓库上下文中的真实验证阻塞：在拿到 Windows 实机、远程桌面或外部测试者之前，不能声称双平台桌宠壳已经过验收。
- 2026-07-28 结合 `Issue 05` 和 `Issue 07` 的阶段化策略，本 ticket 在当前阶段不再追求“宣告双平台都已验证完成”，而是把已经获得的 macOS 结论沉淀成实现边界，并把 Windows 11 图形壳验证显式移交为后续 `外部 Alpha` 前的实施阻塞项。

## Answer

当前能确认的结论分成两层：对“是否足以进入实现阶段”的回答是 `是`，对“是否已经完成双平台桌宠壳验收”的回答是 `否`。

- macOS 14+ Apple Silicon 上，Tauri 2 + Rust 这条路线已经通过低成本样机验证了这些关键能力：
  - 透明无边框置顶窗口
  - 托盘菜单恢复
  - 拖动窗口
  - 文件拖放进入 WebView
  - 全空间显示
- macOS 上还确认了两个必须写死进实现约束的事实：
  - 透明窗口需要启用 `app.macOSPrivateApi = true`
  - 整窗点击穿透与系统级文件拖放不能共存，因此 P0 不能把“全窗长期穿透”和“文件投喂”设计成必须同时成立的默认能力
- Windows 11 侧目前没有实机、远程桌面或可复现图形会话，所以本 ticket 不能给出任何“已经稳定支持 Windows 壳行为”的结论。这个空缺不是待补充细节，而是双平台 `外部 Alpha` 之前的明确阻塞项。

因此，本 ticket 在规划阶段已经完成它的职责：它证明了主线可以先进入 `macOS 预览版` 的正式实现，同时把 Windows 11 图形壳验证保留为后续实施与发布门槛，而不是继续假装当前仓库已经具备双平台壳验收条件。
