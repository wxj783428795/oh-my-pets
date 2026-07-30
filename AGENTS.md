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
- `pnpm ci:bootstrap`：面向干净 checkout 执行 frozen pnpm 安装并把固定 Playwright Chromium 安装到 `target/playwright-browsers/`；调用方必须先使用 `.node-version`、`packageManager` 和 `rust-toolchain.toml` 声明的固定工具链。
- `pnpm ci:verify`：先运行 `ci:bootstrap`，再运行最终 `pnpm verify`；这是 GitHub Actions 的单一根入口，不用于代替日常已有依赖时的快速反馈。
- `pnpm dev`：启动 Vite 子进程并运行真正的 Tauri 主线。
- `pnpm dev:web`：仅启动前端开发服务器，供 Tauri 调用，不等价于桌面应用。
- `pnpm test:e2e:install`：把与固定 Playwright 版本匹配的 Chromium 安装到被忽略的 `target/playwright-browsers/`；升级 Playwright 后需重跑。
- `pnpm test:e2e`：启动固定端口的本地 Vite 服务，在单一真实 Chromium 中比较 PixiJS Canvas 基线并运行有限 Web/UI E2E；普通运行禁止更新基线。
- `pnpm test:e2e:update`：显式更新发生变化的视觉基线；运行后必须人工审阅 PNG 和 Git diff。
- `pnpm test`：运行 Rust workspace 和前端全部测试。
- `pnpm coverage:web`：使用 Vitest 3.2.7 与固定版本的 V8 provider 运行前端/工程脚本测试，输出文本摘要，并把 JSON 范围清单与 HTML 写入 `target/coverage/web/`。
- `pnpm coverage:rust`：使用 `cargo-llvm-cov` 运行 Rust workspace 全 targets 测试，输出文本摘要，并把 JSON 范围清单与 HTML 写入 `target/coverage/rust/`；缺少工具时会给出固定版本的全局或 worktree 本地安装选项。
- `pnpm coverage`：依次运行 Web 与 Rust 覆盖率入口；当前只报告基线，不设置百分比门禁，也不属于 `pnpm verify`。
- `pnpm architecture:check`：对正式源码生成模块物理 LOC、热点分组、前端内部 import 图和 Rust workspace 依赖图，并运行 Oxlint 圈复杂度/循环依赖与 Clippy 认知复杂度；JSON 写入 `target/quality/architecture/report.json`，循环、禁止方向、范围污染或分析器失败会阻断，模块规模分组只作 review 信号。
- `pnpm lint`：运行 Rust 格式检查、Clippy，以及前端 Oxlint 静态分析和类型检查。
- `pnpm lint:web`：先用普通、非 type-aware 的 Oxlint 检查 `src/ui`、`scripts`、`tests/e2e` 和根 Vite/Playwright 配置，再运行 `vue-tsc --noEmit`；Oxlint 负责快速代码规则反馈，`vue-tsc` 继续负责 Vue/TypeScript 类型检查。Oxlint 当前只检查 Vue `<script>`，不覆盖 template 专用规则。
- `pnpm build:web`：执行前端类型检查并构建 WebView 资源。
- `pnpm verify:core`：运行正式范围与架构检查、Rust/Vitest 测试、真实浏览器视觉与有限 E2E、lint 和 WebView 构建，供快速开发反馈使用，不等价于关闭检查。
- `pnpm verify`：在 `verify:core` 后执行真实 Tauri 桌面构建与 resolved ticket 关闭证据扫描，是最终改动后的统一关闭检查。
- `pnpm build` / `pnpm build:desktop`：调用真实 Tauri 构建；正式发布打包仍不在 macOS 预览版当前范围内。
- `pnpm build:desktop:qa`：仅为真实 macOS 人工 QA 构建带品牌图标的本地 `.app`，不等价于正式发布打包。
- `pnpm qa:desktop:auto`：构建并启动真实 Tauri 可执行文件，执行可自动化的最小桌面 smoke。
- `pnpm qa:desktop`：构建并启动带图标的本地 macOS `.app`，先执行自动 smoke，再进入交互式人工 QA；非交互环境不能把它记录为通过。
- `pnpm closeout:check`：扫描 resolved ticket 的结构化关闭证据；传入 `-- --ticket <path>` 可检查单票是否已具备关闭条件。
- `pnpm scope:check`：拒绝把 prototype、research、reference 或本地生成物混入正式主线关闭范围。

当前仅有一个 throwaway 桌宠壳样机位于 `.scratch/oh-my-pets-p0-alpha/prototypes/desktop-shell-smoke/`，使用 Tauri 2 + Rust + pnpm；从仓库根目录可用 `pnpm --dir .scratch/oh-my-pets-p0-alpha/prototypes/desktop-shell-smoke tauri dev` 启动。该样机只用于回答 `03-prototype-cross-platform-shell`，不代表正式主线工具链。

根目录 `pnpm` scripts 是正式主线的唯一统一入口。

`.github/workflows/verify.yml` 在 pull request、`main` push 和手动触发时使用标准 GitHub-hosted macOS ARM64 runner 执行 `pnpm ci:verify`。workflow 只授予仓库内容读取权限、取消同一 PR 的旧运行，不运行 coverage、发布或多平台矩阵，仅在失败时保留 3 天诊断产物。真实远端运行和 `main` required check 的边界见 `docs/agents/delivery-readiness.md`。

`.codex/`、`output/` 和 `.scratch/**/prototypes/` 是本地生成或辅助范围，通过 `.gitignore` 隔离；`.scratch/**/spec.md`、`.scratch/**/map.md` 和 `.scratch/**/issues/*.md` 仍是正式流程资产。`research/` 与 `reference/` 保持可见但由 `pnpm scope:check` 从正式关闭范围中拒绝，不得为了清洁状态删除、移动或覆盖用户资产。完整边界见 `docs/agents/delivery-readiness.md`。

## 工程实施流程

所有工程工作必须遵循 `docs/agents/engineering-flow.md`。以下规则是开工和关闭 ticket 的硬门槛：

- 常规功能先经 `grill-with-docs` 澄清；`wayfinder`、研究、grilling 和 prototype 阶段只形成决策与证据，不直接实施正式产品功能。
- 多会话或范围较大的工作在实施前必须依次形成 spec 和可领取 tickets；明确的小型单会话改动可在澄清并确定验收标准后直接实施。
- 每次新开发、bugfix、hotfix、流程或正式文档工作都必须先按 `docs/agents/branch-management.md` 检查工作树、分类工作、确定 base/PR target，并创建独立分支；工作树不干净或存在并行任务时使用独立 worktree。禁止直接在 `main` 或 `integration/*` 上实施。
- 对已经 ticket 化的工作，修改产品代码前必须将当前 ticket 设为 `claimed`，并在新的实施上下文中读取 ticket、spec、`CONTEXT.md` 和相关 ADR。
- 实施默认按 TDD 小切片推进；自动化检查不能替代 ticket 要求的人工验收。
- 最后一次相关改动后必须运行 `pnpm verify`；后续再次修改相关文件会使该结果失效，提交前必须重跑。
- 提交前必须完成 Standards + Spec 双轴 code review，并处理所有阻塞性发现。
- 人工验收、review 或提交记录缺失时，ticket 必须保持 `claimed`，不得标记为 `resolved`。
- 新实施 ticket 必须声明 `Closeout-Contract: v1` 并维护结构化 `## Closeout Evidence`；resolved 前运行 `pnpm closeout:check -- --ticket <ticket-path>`。
- 任何流程例外都需要用户明确批准；有 ticket 时记录在 `## Comments`，用户同时明确要求不建 ticket/PR 时记录在最终交接和下一份适用的正式流程记录中。

## 分支管理

分支、Pull Request、bugfix/hotfix 路由和 GitHub 门禁以 `docs/agents/branch-management.md` 为唯一详细规范：

- `main` 是唯一永久主线，禁止正常直接提交或 push；所有正式变更通过 Pull Request 和 `macOS ARM64 最终验证` 进入。
- 独立可交付小票从最新 `main` 创建短分支并 PR 回 `main`；跨多票且中间状态不可交付的 accepted spec 使用受保护、完成即删除的 `integration/<spec>`。
- 一张 ticket 对应一个主要实施分支和主要 PR。agent 分支使用 `codex/` 前缀；前置依赖必须先进入目标分支，禁止用 ticket 分支互相合并隐藏依赖。
- 普通 bugfix 从缺陷实际存在的目标分支创建 `codex/fix-*`；integration 独有缺陷只修到 integration；`main` 修复随后通过同步 PR 前向合入仍受影响的 integration。存在已维护 release 时，从最早受影响维护线修复并逐线前向移植。
- hotfix 也必须走分支、PR、CI 和 review；应急 bypass 需要用户明确批准并补跑远端验证。
- 当前只允许 merge commit，关闭 squash、rebase 和 linear history，以保留 Closeout Evidence 记录的实现提交 SHA。
- `main` 使用永久 ruleset；每个 integration 使用精确匹配的临时 ruleset。两者都必须要求 PR、Strict required check、对话解决，并禁止强推和删除。

## 编码风格与命名约定

默认使用 UTF-8。Rust 使用 `cargo fmt` 默认格式；TypeScript、Vue、JSON 和 Markdown 使用 2 空格缩进。目录名使用小写短横线，源文件遵循语言社区惯例。模块应小而聚焦，避免在根目录堆放脚本。

## 测试约定

新增功能应同时补充测试。Rust 集成测试放在对应 crate 的 `tests/`，单元测试可使用 `#[cfg(test)]`；Vitest 前端单元测试使用 `*.test.ts` 并靠近被测模块，Playwright 浏览器 E2E 使用 `tests/e2e/*.spec.ts` 并把稳定 expected 基线放在同名 `*-snapshots/`。如果暂时无法覆盖，请在 PR 描述中说明风险和后续计划。

架构反馈的正式范围、首次热点、阈值语义与盲区见 `docs/architecture-baseline.md`。禁止为了降低 LOC 或复杂度数字进行无关拆分，也禁止用全局规则关闭换取绿色；模块拆分必须能说明职责、依赖或变更成本上的收益。

## 提交与合并请求

使用简洁、祈使句式的中文提交信息，例如：`新增宠物列表基础模型`、`补充宠物包校验测试`。

PR 应包含：目标分支、ticket 或 spec 路径、变更目的、主要改动、测试结果，以及任何配置影响。涉及界面或资源变更时，请附截图、录屏或示例文件路径。合并方式、required check 和分支清理由 `docs/agents/branch-management.md` 约束。

## 维护要求

每当仓库引入新工具链、目录约定或 CI 流程时，请同步更新 `AGENTS.md`，避免文档落后于实际代码。

## Agent skills

### Issue tracker

本仓库使用本地 Markdown 作为 issue tracker，spec 与 issue 文件存放在 `.scratch/<feature>/`。见 `docs/agents/issue-tracker.md`。完整工程阶段和开工门槛见 `docs/agents/engineering-flow.md`。

### Branch management

每次进入新的开发或缺陷修复前，必须按 `docs/agents/branch-management.md` 选择 base、目标分支、topic 分支与 worktree；不得从当前打开的分支状态猜测实施路径。

### Triage labels

本仓库使用默认 triage labels：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。见 `docs/agents/triage-labels.md`。

### Domain docs

本仓库采用单上下文文档布局：根目录 `CONTEXT.md`，架构决策记录在 `docs/adr/`。见 `docs/agents/domain.md`。
