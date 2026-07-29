# 增加干净环境复现与 GitHub CI

Type: task
Status: open
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

## Closeout Evidence

### Verify

- Status: pending
- Command: `pnpm verify`
- Result: pending

### Manual QA

- Status: pending
- Command: `not-applicable`
- Result: pending
- Reason: pending

### Review

- Standards: pending
- Spec: pending
- Notes: pending

### Commit

- Status: pending
- Hash: pending

## Answer

待实施。
