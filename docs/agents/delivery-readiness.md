# Delivery Readiness Gates

本页定义正式主线关闭检查、桌面 QA 与仓库资产边界。根目录 `pnpm` scripts 是唯一正式入口。

## 验证层级

| 命令                         | 用途                                                            | 能否作为最终关闭证据 |
| ---------------------------- | --------------------------------------------------------------- | -------------------- |
| `pnpm lint:web`              | 非 type-aware Oxlint 静态分析与 `vue-tsc` 类型检查              | 否                   |
| `pnpm test:e2e`              | 真实 Chromium 中的 Canvas 视觉比较与有限 Web/UI E2E             | 否                   |
| `pnpm coverage`              | 生成 Vitest 与 Rust 文本摘要、范围清单和本地 HTML，不设阈值     | 否                   |
| `pnpm architecture:check`    | 模块规模、复杂度、前端循环和 Rust crate 方向                    | 是，结构硬门禁       |
| `pnpm ci:bootstrap`          | 干净 checkout 的 frozen install 与固定 Chromium 安装            | 否                   |
| `pnpm ci:verify:lightweight` | 纯文档/流程 PR 的范围与 closeout 远端门禁                       | 否                   |
| `pnpm ci:verify`             | `ci:bootstrap` 后执行最终 `pnpm verify`                         | 是，供干净环境与 CI  |
| `pnpm verify:core`           | 范围/架构、Rust/Vitest、视觉/E2E、lint、WebView 构建            | 否                   |
| `pnpm verify`                | `verify:core`、真实 `tauri build`、resolved ticket 关闭证据扫描 | 是                   |
| `pnpm qa:desktop:auto`       | 构建真实 Tauri 应用并执行自动 smoke                             | 仅桌面自动化部分     |
| `pnpm qa:desktop`            | 构建带图标的本地 `.app`，自动 smoke 后启动 macOS 人工清单       | 是，需验收人逐项确认 |
| `pnpm closeout:check`        | 扫描所有 resolved ticket                                        | 是                   |

`pnpm lint:web` 中 Oxlint 只检查 `src/ui`、`scripts`、`tests/e2e` 和根 Vite/Playwright 配置，并显式排除辅助资产与生成物；它能够分析 Vue `<script>`，但不补齐 template 专用规则。`vue-tsc --noEmit` 继续承担 Vue/TypeScript 类型检查，二者任一失败都会阻断该命令。

`pnpm test:e2e` 使用固定 Playwright 与单一 Chromium，在 900×760 viewport、DPR 1、固定 locale/timezone/color scheme/reduced-motion 和固定时间下加载仓库内卷卷宠物包。它比较真实 PixiJS WebGL Canvas 的平台专属 expected 基线，并验证一次受控加载失败后的重新加载恢复。常规配置使用 `updateSnapshots: "none"`；只有 `pnpm test:e2e:update` 能显式更新变化的基线。expected 基线位于 `tests/e2e/**-snapshots/`，actual/diff、trace、HTML report 和浏览器缓存位于被忽略的 `target/playwright/`。详细边界见 `docs/visual-testing.md`。

该套件是 Web/UI 与 renderer E2E：浏览器测试 seam 只提供固定 Tauri command 输入，不运行 Rust backend、WKWebView、菜单栏、透明窗口合成或操作系统交互。因此它不重复也不替代 `pnpm qa:desktop:auto` 和 `pnpm qa:desktop`。

`pnpm coverage:web` 使用 Vitest/V8 报告 `src/ui/` 与 `scripts/` 中的正式源码，并显式排除只在浏览器测试模式加载的 `src/ui/browser-test-platform.ts`；`pnpm coverage:rust` 使用 `cargo-llvm-cov` 报告两个 workspace crate 的 `src/`。两条命令都会机械检查范围清单，拒绝测试、测试 seam、生成代码、prototype、research、reference 或构建产物混入。聚合入口 `pnpm coverage` 只生成可解释基线，不设置阈值，也不替代或进入 `pnpm verify`。文本摘要直接输出到终端；JSON 与 HTML 位于 `target/coverage/web/` 和 `target/coverage/rust/`，首次基线与盲区见 `docs/coverage-baseline.md`。

`.node-version`、`packageManager` 和 `rust-toolchain.toml` 分别固定 Node 22.14.0、pnpm 10.27.0 与 Rust/Cargo 1.97.1。`pnpm ci:verify:lightweight` 只编排现有 `scope:check` 与 `closeout:check`，不恢复 Node 依赖、不安装浏览器、不启用 Rust，也不能替代正式工作提交前的本地 `pnpm verify`。完整路径先由 `pnpm ci:bootstrap` 从锁文件恢复 Node 依赖并安装与固定 Playwright 版本匹配的 Chromium，再由 `pnpm ci:verify` 执行完整 `pnpm verify`；不得缩短为 `verify:core` 或更新视觉基线。

`pnpm architecture:check` 只分析正式 Rust、Vue/TypeScript 和非测试工程脚本，生成 `target/quality/architecture/report.json`。前端内部 import 循环、Rust workspace 循环、`oh-my-pets-domain -> oh-my-pets` 反向依赖、范围污染和 Oxlint/Clippy/Cargo metadata 失败属于硬门禁；物理 LOC 与 large/medium/small 热点分组只提供 review 信号，不因跨过任意行数直接失败。Oxlint 同时执行单函数 `complexity` 与 `import/no-cycle`，Clippy 执行 `cognitive_complexity`；首次结果、范围和盲区见 `docs/architecture-baseline.md`。

`.github/workflows/verify.yml` 只响应目标为 `main`、`integration/**` 或 `release/**` 的 pull request 以及手动触发，运行于标准 GitHub-hosted `macos-latest` ARM64 runner；受保护分支合并后的 push 不重复运行相同验证。workflow 使用只读仓库权限、30 分钟 timeout 和按 PR/分支取消旧运行的 concurrency；checkout 获取完整 Git 历史，供路径分类与 closeout 验证已记录的实现提交；不包含矩阵、coverage、发布、签名或部署，只在失败时上传 `target/playwright/` 与桌面 smoke 诊断并保留 3 天。Actions 均固定到已审阅提交 SHA。GitHub 首次真实运行通过前，本机验证只能证明本地契约，不能冒充远端通过；required check 也只能在真实 job 名稳定后配置，并应要求分支为最新提交。

同一个 `macOS ARM64 最终验证` job 在安装浏览器和启用 Rust 前读取 Pull Request 的完整变更路径。路径差异关闭 rename detection，使重命名前后的旧、新路径都参与分类。只有所有路径都属于 `docs/**`、`AGENTS.md`、`CONTEXT.md`、`README.md`、`.scratch/<feature>/spec.md`、`.scratch/<feature>/map.md` 或 `.scratch/<feature>/issues/*.md` 时才执行轻量门禁。任意产品、测试、资源、依赖、workflow、配置、脚本、辅助或未知路径，混合变更，空路径，Git diff 失败，以及 `workflow_dispatch` 都保守进入完整 `pnpm ci:verify`；workflow 对缺失或未知 tier 同样默认完整验证。required job 名和 ruleset 合约不因分层改变。

`pull_request` 的 base 限于正式受保护分支模式，因此 ticket PR 指向临时
`integration/<spec>`、最终 integration PR 指向 `main`，以及未来维护 PR 指向
`release/*` 时都会运行相同 job；指向其他临时分支的 PR 不占用最终验证资源。
只有目标分支 ruleset 把 `macOS ARM64 最终验证` 设为 required check，CI 才成为
服务端合并门禁。分支职责、bugfix 路由、merge commit 和 ruleset 生命周期见
`branch-management.md`。

`pnpm qa:desktop:auto` 的报告写入被 Git 忽略的 `target/desktop-smoke/report.json`，覆盖：

- 真实 Tauri 主窗口启动并可见
- Rust 示例宠物包加载且包含动作与图集帧
- Vue WebView 完成 PixiJS 示例宠物挂载
- 复用托盘菜单处理器隐藏并恢复窗口
- 真实窗口开启并关闭点击穿透
- 导出并重新读取本地诊断 Markdown

这些检查不模拟 WebView 或窗口状态，但仍不能替代人在真实桌面的判断。`pnpm qa:desktop` 会额外构建仅供本地 QA 的 macOS `.app`，确保 Dock 使用仓库品牌图标；这不代表正式发布签名、安装包或分发流程已经完成。验收人需要确认 Dock 与菜单栏入口真实可见、菜单栏可恢复窗口、示例宠物可见且语义动作状态持续切换、点击穿透体验正确、诊断文件可定位阅读。当前工程示例包只有一张占位帧，P0 不把首发逐帧动画资源列为通过条件。命令只允许在 macOS（Darwin）交互式终端接受逐项结果，且 Tauri 应用必须成功启动并在问答期间保持运行；记录写入 `target/desktop-smoke/manual-qa.json`，非 macOS、非交互环境或应用提前退出都会失败。

## 仓库边界

| 类别      | 典型路径                                                               | 正式主线关闭范围          |
| --------- | ---------------------------------------------------------------------- | ------------------------- |
| mainline  | `src/`、`src-tauri/`、`assets/`、根配置和文档                          | 包含                      |
| process   | `.scratch/**/spec.md`、`.scratch/**/map.md`、`.scratch/**/issues/*.md` | 包含                      |
| prototype | `.scratch/**/prototypes/`                                              | 排除                      |
| research  | `research/`                                                            | 排除，但保持 Git 可见     |
| reference | `reference/`                                                           | 排除，只读且保持 Git 可见 |
| generated | `.codex/`、`output/`、`target/`（含 `target/coverage/`）               | 排除                      |

`.gitignore` 只直接隔离本地报告、输出和 prototype 子树，不整体忽略 `.scratch/`，也不隐藏 `research/` 或 `reference/`。`pnpm scope:check` 优先对当前 staged、unstaged 和未跟踪路径分类；工作树干净时改为检查 HEAD 提交，避免空门禁。发现辅助范围就失败，但不会删除、移动或覆盖任何文件。审查某个 Git 基线后的正式变更时可运行：

```bash
pnpm scope:check -- --base <git-revision>
```

仅查看分类、不阻断时运行 `pnpm scope:report`。
