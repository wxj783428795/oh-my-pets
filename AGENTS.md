# Repository Guidelines

## 项目结构与模块组织

正式主线已经开始实现，当前采用以下结构：

- `src/pet-domain/`：Rust 领域层，负责宠物包模型、校验和与平台无关的核心规则。
- `src/ui/`：Vue 3 + TypeScript 工作台和 PixiJS 宠物预览器。
- `src-tauri/`：Tauri 2 桌面壳、macOS 窗口恢复能力、菜单栏入口和诊断导出。
- `assets/pets/`：声明式示例宠物包和图集资源。
- `docs/`：设计说明、架构决策和使用文档。
- `scripts/`：根目录工程门禁的轻量 Node 脚本及其测试。
- `research/`：竞品、技术方案和调研过程记录；属于辅助资产，不进入正式主线关闭范围。
- `reference/`：外部参考源码；属于只读辅助资产，复用前先核对各项目许可证。

Rust 测试按社区惯例放在 crate 内的 `tests/` 或 `#[cfg(test)]` 模块；前端测试靠近对应模块。

## 构建、测试与开发命令

- `pnpm doctor:desktop`：默认只读检查平台、工具链、Tauri 前置条件、开发端口、正式依赖和诊断/构建路径，并指向 `docs/desktop-recovery.md`；使用命名空间以避开 pnpm 10 内置的同名 `doctor`，且不会安装依赖、结束进程、清缓存或修改用户文件。
- `pnpm dev`：启动 Vite 子进程并运行真正的 Tauri 主线。
- `pnpm dev:web`：仅启动前端开发服务器，供 Tauri 调用，不等价于桌面应用。
- `pnpm test`：运行 Rust workspace 和前端全部测试。
- `pnpm lint`：运行 Rust 格式检查、Clippy，以及前端 Oxlint 静态分析和类型检查。
- `pnpm lint:web`：先用普通、非 type-aware 的 Oxlint 检查 `src/ui`、`scripts` 和根 Vite 配置，再运行 `vue-tsc --noEmit`；Oxlint 负责快速代码规则反馈，`vue-tsc` 继续负责 Vue/TypeScript 类型检查。Oxlint 当前只检查 Vue `<script>`，不覆盖 template 专用规则。
- `pnpm build:web`：执行前端类型检查并构建 WebView 资源。
- `pnpm verify:core`：运行正式范围检查、测试、lint 和 WebView 构建，供快速开发反馈使用，不等价于关闭检查。
- `pnpm verify`：在 `verify:core` 后执行真实 Tauri 桌面构建与 resolved ticket 关闭证据扫描，是最终改动后的统一关闭检查。
- `pnpm build` / `pnpm build:desktop`：调用真实 Tauri 构建；正式发布打包仍不在 macOS 预览版当前范围内。
- `pnpm build:desktop:qa`：仅为真实 macOS 人工 QA 构建带品牌图标的本地 `.app`，不等价于正式发布打包。
- `pnpm qa:desktop:auto`：构建并启动真实 Tauri 可执行文件，执行可自动化的最小桌面 smoke。
- `pnpm qa:desktop`：构建并启动带图标的本地 macOS `.app`，先执行自动 smoke，再进入交互式人工 QA；非交互环境不能把它记录为通过。
- `pnpm closeout:check`：扫描 resolved ticket 的结构化关闭证据；传入 `-- --ticket <path>` 可检查单票是否已具备关闭条件。
- `pnpm scope:check`：拒绝把 prototype、research、reference 或本地生成物混入正式主线关闭范围。

当前仅有一个 throwaway 桌宠壳样机位于 `.scratch/oh-my-pets-p0-alpha/prototypes/desktop-shell-smoke/`，使用 Tauri 2 + Rust + pnpm；从仓库根目录可用 `pnpm --dir .scratch/oh-my-pets-p0-alpha/prototypes/desktop-shell-smoke tauri dev` 启动。该样机只用于回答 `03-prototype-cross-platform-shell`，不代表正式主线工具链。

根目录 `pnpm` scripts 是正式主线的唯一统一入口。

`.codex/`、`output/` 和 `.scratch/**/prototypes/` 是本地生成或辅助范围，通过 `.gitignore` 隔离；`.scratch/**/spec.md`、`.scratch/**/map.md` 和 `.scratch/**/issues/*.md` 仍是正式流程资产。`research/` 与 `reference/` 保持可见但由 `pnpm scope:check` 从正式关闭范围中拒绝，不得为了清洁状态删除、移动或覆盖用户资产。完整边界见 `docs/agents/delivery-readiness.md`。

## 工程实施流程

所有工程工作必须遵循 `docs/agents/engineering-flow.md`。以下规则是开工和关闭 ticket 的硬门槛：

- 常规功能先经 `grill-with-docs` 澄清；`wayfinder`、研究、grilling 和 prototype 阶段只形成决策与证据，不直接实施正式产品功能。
- 多会话或范围较大的工作在实施前必须依次形成 spec 和可领取 tickets；明确的小型单会话改动可在澄清并确定验收标准后直接实施。
- 对已经 ticket 化的工作，修改产品代码前必须将当前 ticket 设为 `claimed`，并在新的实施上下文中读取 ticket、spec、`CONTEXT.md` 和相关 ADR。
- 实施默认按 TDD 小切片推进；自动化检查不能替代 ticket 要求的人工验收。
- 最后一次相关改动后必须运行 `pnpm verify`；后续再次修改相关文件会使该结果失效，提交前必须重跑。
- 提交前必须完成 Standards + Spec 双轴 code review，并处理所有阻塞性发现。
- 人工验收、review 或提交记录缺失时，ticket 必须保持 `claimed`，不得标记为 `resolved`。
- 新实施 ticket 必须声明 `Closeout-Contract: v1` 并维护结构化 `## Closeout Evidence`；resolved 前运行 `pnpm closeout:check -- --ticket <ticket-path>`。
- 任何流程例外都需要用户明确批准，并记录在 ticket 的 `## Comments` 中。

## 编码风格与命名约定

默认使用 UTF-8。Rust 使用 `cargo fmt` 默认格式；TypeScript、Vue、JSON 和 Markdown 使用 2 空格缩进。目录名使用小写短横线，源文件遵循语言社区惯例。模块应小而聚焦，避免在根目录堆放脚本。

## 测试约定

新增功能应同时补充测试。Rust 集成测试放在对应 crate 的 `tests/`，单元测试可使用 `#[cfg(test)]`；前端测试使用 `*.test.ts` 并靠近被测模块。如果暂时无法覆盖，请在 PR 描述中说明风险和后续计划。

## 提交与合并请求

当前仓库已初始化 Git，但尚无历史提交可供总结。使用简洁、祈使句式的中文提交信息，例如：`新增宠物列表基础模型`、`补充宠物包校验测试`。

PR 应包含：变更目的、主要改动、测试结果，以及任何配置影响。涉及界面或资源变更时，请附截图、录屏或示例文件路径。

## 维护要求

每当仓库引入新工具链、目录约定或 CI 流程时，请同步更新 `AGENTS.md`，避免文档落后于实际代码。

## Agent skills

### Issue tracker

本仓库使用本地 Markdown 作为 issue tracker，spec 与 issue 文件存放在 `.scratch/<feature>/`。见 `docs/agents/issue-tracker.md`。完整工程阶段和开工门槛见 `docs/agents/engineering-flow.md`。

### Triage labels

本仓库使用默认 triage labels：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。见 `docs/agents/triage-labels.md`。

### Domain docs

本仓库采用单上下文文档布局：根目录 `CONTEXT.md`，架构决策记录在 `docs/adr/`。见 `docs/agents/domain.md`。
