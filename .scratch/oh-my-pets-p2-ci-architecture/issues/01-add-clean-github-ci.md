# 增加干净环境复现与 GitHub CI

Type: task
Status: resolved
Closeout-Contract: v1
Blocked by: none

## Question

如何保持本机与 worktree 为主要开发方式，同时让 GitHub 在干净、受控且成本有限
的 macOS ARM64 runner 上复验最终关闭门禁，并在真实运行稳定后保护 `main`？

## Scope

- 声明并校验 Node、pnpm 与 Rust 工具版本。
- 增加 clean bootstrap 与 CI 最终验证根命令。
- 增加最小权限、有限触发和有限产物的 GitHub Actions workflow。
- 为 workflow、版本、命令、权限和成本控制增加自动化契约测试。
- 在用户确认 GitHub owner/private remote 后完成首次真实 Actions 运行。
- 首跑稳定后把最终验证 job 配置为 `main` required check。
- 同步 `AGENTS.md`、README 和交付就绪文档。

## Non-goals

- 发布、签名、公证、部署或安装包上传。
- Windows/Linux 构建矩阵、跨浏览器矩阵或 coverage 定时任务。
- self-hosted runner、larger runner 或第三方 CI 平台。
- 在未确认 owner/可见性时创建远端、推送用户代码或修改 GitHub 设置。
- 用 `verify:core`、缓存命中或本机结果冒充真实 GitHub `pnpm verify`。

## Completion Criteria

- clean checkout 可通过根命令执行 frozen pnpm install、固定 Chromium 安装和
  最终 `pnpm verify`。
- 工具版本声明与 `packageManager`、engines、doctor 和 workflow 一致。
- workflow 使用标准 macOS ARM64 runner，具备只读权限、timeout、PR 并发取消、
  无矩阵和失败时短期上传诊断产物等约束。
- 自动化测试能阻断 workflow 改用 `verify:core`、隐式更新快照、宽权限、可变
  工具版本或无界运行。
- 用户确认 GitHub owner/private remote 后，真实 Actions 对当前提交通过。
- `main` required check 指向真实通过的最终验证 job，并要求最新提交 SHA。
- 最后相关改动后 `pnpm verify` 通过，完成 Standards + Spec 双轴 review。

## Comments

- 2026-07-29：用户确认实施 P2-01；当前仓库无 remote、本机无 `gh` CLI。
  owner 与 remote 创建仍需用户确认，不能把未运行 workflow 记录为通过。
- 2026-07-29 15:35:08 CST：在独立 worktree 的
  `codex/p2-01-github-ci` 分支领取；实施基线为
  `65da6b3ba76f33eae231aabccb89243ce739aba6`。
- 2026-07-29 15:54:35 CST：仓库侧实现完成。契约测试先以缺少工具链声明、
  根命令和 workflow 的 4 个失败建立红灯，再补固定版本、clean bootstrap、
  最终 verify workflow 与 doctor 校验。`pnpm ci:bootstrap` 和首次本地
  `pnpm verify` 通过；Standards 初审发现需额外阻断 `pull_request_target`、
  写权限、coverage/schedule 夹带并固定 required check job 名，已补测试。
  Spec 仓库侧无阻塞发现；真实 GitHub 首跑与 branch protection 仍待用户确认
  owner/private remote，因此本票保持 `claimed`。
- 2026-07-29 16:59:11 CST：用户确认 owner 为 `wxj783428795`，并在私有仓库
  首跑受 Billing 阻断后明确批准改为公开仓库。已创建并启用
  `wxj783428795/oh-my-pets`，PR #1 的真实 Actions 首次执行暴露 checkout
  默认浅历史导致 closeout 无法定位历史提交，已用 `fetch-depth: 0` 修复。
- 2026-07-29 16:59:11 CST：Standards review 进一步发现 GitHub PR merge
  commit 会让默认 `scope:check` 得到空范围；已改为
  `diff-tree -m --first-parent`，并用真实分叉/merge Git 仓库回归测试阻断。
  最终 Standards 与 Spec 复审均 0 findings。
- 2026-07-29 16:59:11 CST：提交
  `66acd23fec3953c3c8f469ba6bfa4f65528254cc` 的真实 GitHub Actions run
  `30437064362` 通过。`main` required check 已精确绑定 GitHub Actions app
  的 `macOS ARM64 最终验证`，启用 `strict: true` 与管理员强制，关闭强推和
  分支删除。

## Closeout Evidence

### Verify

- Status: passed
- Command: `pnpm verify`
- Result: 最后相关代码改动后通过；Rust 26 项、Vitest 103 项、Chromium 2 项、
  Oxlint/vue-tsc、Web 构建、真实 Tauri release build 与 closeout 均通过。
  GitHub Actions run `30437064362` 在 `macos-26-arm64` 干净 runner 上对最新
  提交完成 `pnpm ci:verify` 并通过。

### Manual QA

- Status: not-applicable
- Command: `not-applicable`
- Result: 本票未改变用户界面、视觉输出或原生桌面行为。
- Reason: 仅增加工具链声明、干净安装、CI workflow、范围门禁、契约测试和工程
  文档；不涉及窗口、托盘、点击穿透、诊断交互或桌面体验。

### Review

- Standards: passed
- Spec: passed
- Notes: Standards 初审发现 workflow 安全/成本约束、浅历史 closeout 和 PR
  merge commit 空范围问题，均已修复并补回归测试；最终 Standards 0、
  Spec 0。

### Commit

- Status: committed
- Hash: `66acd23fec3953c3c8f469ba6bfa4f65528254cc`

## Answer

已增加固定工具链、clean bootstrap 和最小权限 GitHub Actions 最终验证入口；
公开仓库的真实 macOS ARM64 run 已通过，`main` required check 已要求 GitHub
Actions 的最新成功提交。workflow 无矩阵、无 coverage/发布，仅在失败时短期
保留诊断产物。
