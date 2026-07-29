# P2 持续集成与架构回退控制规格

Status: accepted

## Context

截至 2026-07-29，P0 与 P1 已补齐本地真实 Tauri 构建、桌面 smoke、结构化
closeout、只读 doctor、Oxlint、覆盖率基线以及真实 Chromium Canvas 视觉/E2E。
当前 `pnpm verify` 能在本机证明一次改动满足关闭条件，但还存在两类持续交付
风险：

- 仓库尚未配置 GitHub remote 或 CI；门禁是否执行仍依赖开发者或 agent 主动
  运行，且没有干净 runner 的独立复验证据。
- 正式源码已出现若干职责密集模块：`src/pet-domain/src/validation.rs` 约
  1070 行、`src-tauri/src/lib.rs` 约 727 行、`src/ui/App.vue` 约 631 行；
  当前没有稳定的模块规模报告、复杂度信号或跨模块依赖回退检查。

用户已确认实施 P2-01 与 P2-02。本规格增强持续执行和架构反馈，不扩张产品功能
或发布范围。

## Goals

- 让全新 checkout 能用仓库声明的工具版本和根命令安装依赖、安装固定 Chromium
  并运行最终 `pnpm verify`。
- 在 GitHub 标准 macOS ARM64 runner 上复验完整门禁，限制权限、并发和失败
  产物，避免无界消耗 Actions 配额。
- 真实 CI 首跑稳定后，把唯一最终验证 job 配置为 `main` required check。
- 为正式源码生成确定性的模块规模、复杂度和依赖关系报告。
- 对循环依赖、禁止的层间方向和分析失败设置硬门禁；模块规模与复杂度先建立
  可解释基线和 review 信号，不使用任意全局数字强制重构。

## Non-goals

- 自动发布、签名、公证、安装包上传或部署。
- Windows 图形 CI、跨浏览器矩阵、云视觉服务或 self-hosted runner 运维。
- 把 coverage、mutation、完整依赖审计或发布流水线夹带进 P2-01/P2-02。
- 因为文件较大而一次性重写 `validation.rs`、`src-tauri/src/lib.rs`、
  `App.vue` 或 `doctor.mjs`。
- 为追求统一依赖树而覆盖 Tauri 的传递依赖版本。
- 以单一行数或复杂度阈值判定代码质量。

## Behavior Requirements

### P2-01：干净环境复现与 GitHub CI

- 仓库应声明已验证的 Node、pnpm 与 Rust 工具版本；本机开发仍是主工作模式，
  GitHub 只承担远端、PR 和干净 runner 复验。
- 根目录提供可重复的 CI bootstrap/verify 入口。bootstrap 只能安装受 lockfile
  约束的依赖和固定 Playwright Chromium，不修改产品资产或用户目录。
- GitHub workflow 至少响应 `pull_request`、`main` push 和手动触发，运行于
  标准 macOS ARM64 runner，使用最小只读权限和明确 timeout。
- workflow 必须从干净 checkout 执行 frozen install、固定浏览器安装和
  `pnpm verify`，不能用 `verify:core` 冒充最终检查。
- 同一 PR 的旧运行应自动取消；不建立平台/Node 矩阵，不在每次 PR 运行 coverage，
  只在失败时保留短期 Playwright/诊断证据。
- workflow 配置、根命令、工具版本和关键安全/成本约束必须有仓库内契约测试。
- 真实 GitHub 首跑必须成功后才能把 job 设为 required check；required check
  必须验证最新提交 SHA。仓库 owner、private remote 创建和 branch protection
  属于外部激活步骤，执行前需要用户确认，不得猜测账号。

### P2-02：模块规模、复杂度与依赖边界

- 根目录提供一个确定性架构检查/报告入口，输出人类可读摘要和
  `target/quality/architecture/` 下的机器可读结果。
- 报告只分析正式主线源码，排除测试、声明文件、浏览器测试 seam、prototype、
  research、reference 和生成物；范围为空或越界时失败。
- 模块规模至少记录路径、代码行数和热点分组，并在基线文档中记录首次结果。
  现有热点只触发 review 信号，不因任意行数阈值直接阻断 `pnpm verify`。
- TypeScript/Vue 至少检查循环 import 和单函数圈复杂度回退；Rust 至少检查
  workspace crate 方向与可维护的复杂度信号。优先复用 Oxlint、Clippy 和
  `cargo metadata --format-version=1`，没有证据时不增加重量级分析平台。
- `oh-my-pets-domain` 不得依赖桌面壳；桌面壳可以依赖领域 crate。分析器自身
  失败、循环依赖或禁止方向必须失败，不能降级为 warning。
- 稳定的依赖/复杂度检查接入 `pnpm verify:core`；规模报告的解释、非目标和
  后续拆分触发条件同步到工程文档。

## Acceptance Criteria

- P2-01 与 P2-02 各有一张独立、可领取的 v1 closeout ticket。
- clean bootstrap 能在没有既有 `node_modules` 或 Playwright 用户缓存的
  checkout 中完成，并由测试证明命令不会隐式更新视觉基线。
- GitHub workflow 配置满足权限、触发、并发、timeout、标准 ARM64 macOS、
  frozen install、浏览器安装、最终 verify 和失败产物约束。
- P2-01 在真实 GitHub runner 上通过，并将对应 job 配置为 `main` required
  check；若远端尚未由用户授权，ticket 必须保持 `claimed`。
- 架构命令能报告正式源码模块规模和依赖关系，并机械拒绝测试/辅助资产污染。
- 前端循环依赖、Rust 禁止方向和分析失败具备红灯测试；复杂度信号不通过大范围
  抑制获得绿色结果。
- P2-02 首次基线记录实际热点、工具版本、命令、已知盲区和“不以行数替代设计
  review”的边界。
- 两票最后相关改动后分别通过 `pnpm verify`、Standards + Spec 双轴 review、
  中文提交和单票 closeout。

## Ticket Map

- `P2-01`：增加干净环境复现与 GitHub CI required check。
- `P2-02`：增加模块规模、复杂度与依赖边界反馈。

## Decision Notes

- 2026-07-29：用户确认实施 P2-01 与 P2-02。
- 2026-07-29：优先使用 GitHub 标准 `macos-latest` ARM64 runner；私有仓库
  通过 concurrency、无矩阵和失败时才上传产物控制免费额度消耗。
- 2026-07-29：当前本机没有 `gh` CLI，仓库也没有 remote。仓库内实现可以先
  完成，但 remote owner、可见性、首次运行和 branch protection 不得伪造。
- 2026-07-29：P2-02 先对依赖方向设置硬门禁，对模块规模与复杂度建立基线；
  只有后续任务证明确有回退趋势时才评估 ratchet 或定向拆分 ticket。
