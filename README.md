# Oh My Pets

Oh My Pets 是一个使用 Tauri 2、Rust、Vue 3 与 PixiJS 构建的桌面宠物项目。当前正式主线只面向 macOS 14+ Apple Silicon 预览版。

## 本地开发

环境要求：

- Rust stable
- Node.js 22+
- pnpm 10+
- macOS 14+ Apple Silicon

从仓库根目录启动真正的 Tauri 主线：

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会启动 Vite 子进程、编译 Rust，并运行 Tauri 应用。`pnpm dev:web` 只启动前端开发服务器，供 Tauri 内部调用，不代表桌面主线已经启动。

常用检查：

```bash
pnpm verify
```

`pnpm verify` 会依次运行完整测试、lint 和 WebView 构建，用于关闭最终改动。

## 当前范围

当前预览工作台支持：

- 由 Rust 加载和校验 `assets/pets/juanjuan/` 示例宠物包
- 由 Rust 选择语义动作、由 PixiJS 在 WebView 内切换帧
- 菜单栏召回窗口、重置位置和关闭点击穿透
- 重新加载示例宠物包
- 导出本地 Markdown 诊断摘要

示例图集是单帧工程占位资源，不代表首发宠物的完整动画内容已经完成。

## 已知约束

在 macOS 的 Tauri 2 透明 WebView 路线上，整窗点击穿透与系统级文件拖放不能同时工作。点击穿透默认关闭；开启后可通过菜单栏的“关闭点击穿透”恢复交互。
