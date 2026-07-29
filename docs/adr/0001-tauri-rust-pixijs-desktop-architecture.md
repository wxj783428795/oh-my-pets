---
status: accepted
date: 2026-07-28
---

# 使用 Tauri、Rust 与 PixiJS 构建双平台桌宠

P0 采用 Tauri 2 桌面壳、Rust 共享核心和双平台原生窗口适配器；设置与引导使用 Vue 3，独立的最小 PixiJS 8 入口渲染 PNG/WebP 精灵图集。Rust 负责行为、物理、宠物包校验、本地状态和窗口控制，前端只接收语义事件，不进行逐帧 IPC。该组合比双原生客户端更易共享产品逻辑，比 Electron 更轻，并保留了 BongoCat 已验证的 WebView 渲染与原生窗口协作模式。

## Considered Options

- 双原生客户端会重复实现渲染、设置和内容管线。
- Electron 会额外捆绑 Chromium，不符合常驻桌宠的资源目标。
- Qt 的跨平台窗口行为依赖较多平台 hack，参考项目已有维护失败案例。
- Unity 更适合 3D/VRM，不符合 P0 的原创 2D 精灵范围。
- 原生 `wgpu` 性能上限更高，但会增加 P0 的界面与渲染开发成本。

## Consequences

macOS 通过 `tauri-nspanel` 和必要 AppKit 调用实现窗口能力，Windows 通过 `windows-rs` 调用 Win32/DWM。WebView/PixiJS 必须通过既定启动、CPU、内存、帧耗时和稳定性门槛；优化后仍不达标时，保留 Rust 核心、事件协议与平台适配器，仅将宠物渲染器替换为 `wgpu`。P0 只发布 macOS 14+ Apple Silicon 与 Windows 11 x86_64 安装包。

Rust workspace 的依赖方向固定为桌面壳可以依赖 `oh-my-pets-domain`，领域 crate 不得反向依赖 `oh-my-pets`。前端与工程模块不得形成内部 import 循环。`pnpm architecture:check` 机械检查这些边界，并以 Oxlint/Clippy 提供函数复杂度回退信号；模块 LOC 只用于发现 review 热点，不作为本 ADR 的架构正确性判据。
