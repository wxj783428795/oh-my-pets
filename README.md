# Oh My Pets

Oh My Pets 是一个使用 Tauri 2、Rust、Vue 3 与 PixiJS 构建的桌面宠物项目。当前正式主线只面向 macOS 14+ Apple Silicon 预览版。

## 本地开发

环境要求：

- Rust/Cargo 1.97.1（由 `rust-toolchain.toml` 固定）
- Node.js 22.14.0（由 `.node-version` 固定，项目最低引擎约束为 22.12）
- pnpm 10.27.0（由 `packageManager` 固定）
- macOS 14+ Apple Silicon

从仓库根目录启动真正的 Tauri 主线：

```bash
corepack enable
corepack prepare pnpm@10.27.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 会启动 Vite 子进程、编译 Rust，并运行 Tauri 应用。`pnpm dev:web` 只启动前端开发服务器，供 Tauri 内部调用，不代表桌面主线已经启动。

常用检查：

```bash
pnpm verify
```

`pnpm verify` 会依次运行正式范围检查、Rust/Vitest 测试、真实 Chromium 中的 Canvas 视觉与有限 Web E2E、lint、WebView 构建、真实 Tauri 桌面构建和 resolved ticket 关闭证据扫描，用于关闭最终改动。日常快速反馈可运行 `pnpm verify:core`，但它不能替代最终关闭检查。首次运行浏览器检查或升级 Playwright 后，先执行：

```bash
pnpm test:e2e:install
```

浏览器下载物进入被 Git 忽略的 `target/playwright-browsers/`。日常比较使用 `pnpm test:e2e`；只有确需更新且准备人工审阅基线时才运行 `pnpm test:e2e:update`。确定性输入、失败产物和原生桌面 QA 边界见 [PixiJS 视觉验证与有限 Web E2E](docs/visual-testing.md)。

干净 checkout 或 CI 使用：

```bash
pnpm ci:verify
```

该命令先执行 frozen install 和固定 Chromium 安装，再运行完整 `pnpm verify`。GitHub workflow 在 pull request、`main` push 和手动触发时使用标准 macOS ARM64 runner 复验该入口；不运行 coverage、发布或平台矩阵，仅在失败时保留 3 天诊断产物。远端首次启用和 `main` required check 必须以真实 GitHub 运行结果为准，不能用本机结果替代。

只检查前端静态分析与类型时运行：

```bash
pnpm lint:web
```

该命令先用非 type-aware Oxlint 检查正式前端、工程脚本、Web E2E 和根 Vite/Playwright 配置，再运行 `vue-tsc --noEmit`。Oxlint 提供快速代码规则反馈，`vue-tsc` 保留 Vue/TypeScript 类型检查职责；Vue template 专用规则暂不在 Oxlint 覆盖范围内。

查看模块规模、内部依赖和复杂度反馈时运行：

```bash
pnpm architecture:check
```

确定性 JSON 位于 `target/quality/architecture/report.json`。循环依赖、Rust 领域层反向依赖桌面壳、范围污染或分析器失败会阻断；LOC 热点分组只用于 review，不以任意行数阈值强制重构。首次结果和盲区见 [架构反馈基线](docs/architecture-baseline.md)。

桌面验收分层执行：

```bash
pnpm qa:desktop:auto
pnpm qa:desktop
```

`qa:desktop:auto` 使用构建后的真实 Tauri 可执行文件检查启动焦点、会话状态重置、系统登录项事实、示例宠物加载、菜单与产品状态同步、点击穿透和诊断导出，并把当前桌面源码指纹写入报告。随后运行的 `qa:desktop` 只会复用指纹与当前工作树一致的已通过报告，在隔离的 `target/desktop-smoke/preferences.json` 上启动 `.app`；持久化与损坏恢复步骤由脚本控制重启和恢复测试数据，不修改真实用户偏好。报告缺失、报告无效、源码不匹配或非交互执行都不能算作人工 QA 通过。

## 当前范围

当前 macOS 产品壳支持：

- 正常启动只显示透明、无边框、不抢焦点的宠物窗口
- Rust 拥有的版本化偏好与会话状态；尺寸、活动频率、真实 macOS 登录项和最后
  有效位置跨启动保存，安静、隐藏、鼠标穿透和运行时行为在启动时重置
- 菜单栏动态显示／隐藏宠物、进入／退出安静模式、开启／关闭鼠标穿透、召回
  宠物、打开偏好设置和退出应用
- 偏好设置绑定尺寸、活动频率、登录项、内置卷卷重载、新手提示重放和诊断导出
- 从偏好设置的受控入口打开高级开发预览
- 由 Rust 加载、校验示例宠物包并选择语义动作，由 PixiJS 在 WebView 内切换帧
- 在高级开发预览中重新加载示例宠物包、重置位置、切换点击穿透并导出本地
  Markdown 诊断摘要

示例图集是单帧工程占位资源，不代表首发宠物的完整动画内容已经完成。

## 已知约束

在 macOS 的 Tauri 2 透明 WebView 路线上，整窗点击穿透与系统级文件拖放不能同时工作。点击穿透默认关闭且不跨启动保存；开启后始终可直接从菜单栏关闭或召回宠物。
