# 修复桌面启动后示例宠物未显示

Type: bug
Status: claimed
Closeout-Contract: v1

## Question

为什么真实 Tauri 应用启动后 Rust 状态已经加载示例宠物包，但 Vue/PixiJS 工作台仍停在“等待宠物包 / 未加载”，以及如何让桌面自动 smoke 捕获该前端失败？

## Reproduction

1. 在真实 macOS 桌面运行 `pnpm qa:desktop`。
2. 自动 smoke 五项通过后，观察正常启动的工作台。
3. 预览区为空，标题为“等待宠物包”，状态为“未加载”，Pet Pack 区域没有摘要。

2026-07-29 人工 QA 稳定复现；主票 `01-fix-p0-delivery-readiness` 被本 bug 阻塞。

## Completion criteria

- 建立无人值守、可判红的反馈回路，覆盖真实 Tauri WebView 完成示例宠物挂载，而非只检查 Rust 状态。
- 定位并修复启动后前端未显示示例宠物的根因。
- 新增回归测试，证明启动路径不会因相同原因停在“未加载”。
- `pnpm qa:desktop:auto` 覆盖前端宠物挂载并通过。
- 最后相关改动后 `pnpm verify` 通过。
- Standards + Spec review、真实 macOS 人工 QA 和中文提交记录按 v1 closeout 契约回写。

## Comments

- 2026-07-29：由 P0 主票的真实 macOS 人工 QA 发现并领取；范围仅限启动加载与自动 smoke 缺口，不扩张 UI 或宠物内容。
- 2026-07-29：真实桌面红环先捕获 PixiJS 严格 CSP 下的动态求值错误；引入官方 `pixi.js/unsafe-eval` 静态替代模块后，又捕获 WKWebView 对 `fetch(data:)` 的 `SecurityError`。最终使用 Pixi 公开 preference 改走 `HTMLImageElement` 解码，并保持 CSP 不含 `'unsafe-eval'`、`connect-src` 不放开 `data:`。
- 2026-07-29：第二轮人工 QA 发现工程包只有单帧占位资源，语义时间线正常但没有逐帧差异；按已有资源说明将 P0 人工项收敛为宠物可见与语义动作切换，不越权制作 Issue 06 的首发动画内容。
- 2026-07-29：人工 QA 启动裸二进制时 Dock 缺少品牌图标；新增仅供 QA 的 macOS `.app` bundle 与 `icon.icns`，不改变 `pnpm verify` 的非发布构建语义。
- 2026-07-29：最终 Standards + Spec 双轴 review 发现交付文档漏列前端挂载自动检查并已修复；复核后无正确性、安全性、测试或范围阻塞项。

## Closeout Evidence

### Verify

- Status: passed
- Command: `pnpm verify`
- Result: 2026-07-29 完整通过；范围检查、Rust/前端 62 项测试、fmt/Clippy、类型检查、WebView 构建、真实 Tauri release 构建与 closeout 扫描均通过

### Manual QA

- Status: passed
- Command: `pnpm qa:desktop`
- Result: 2026-07-29 真实 macOS 人工 QA 4/4；Dock 图标与菜单栏恢复、示例宠物显示与语义时间线、点击穿透、诊断文件全部通过
- Reason: `target/desktop-smoke/manual-qa.json` 已记录本轮完整通过结果

### Review

- Standards: passed
- Spec: passed
- Notes: WebView 回执、错误脱敏、Pixi 严格 CSP 兼容与 QA app bundle 均有回归检查；文档清单遗漏已修复，未扩张到首发动画或发布分发

### Commit

- Status: pending
- Hash: pending

## Answer

启动失败包含两个连续根因：PixiJS 默认渲染器在严格 CSP 下使用动态求值，以及纹理加载器默认通过 `createImageBitmap`/`fetch` 读取 Rust 返回的 `data:` 图集，而 WKWebView 拒绝该操作。渲染器现预加载 Pixi 官方静态 CSP 兼容模块，并通过公开 preference 使用 `HTMLImageElement` 解码内联图集。

桌面 smoke 新增 `frontend_pet_mounted` 跨 WebView 回执，只有 Vue 完成 PixiJS 挂载才通过；失败详情会脱敏内联资源。`pnpm qa:desktop` 另从带品牌图标的本地 `.app` 启动。自动 smoke 和 4/4 真实 macOS 人工 QA 已通过，ticket 等待最终验证、双轴 review 与提交记录。
