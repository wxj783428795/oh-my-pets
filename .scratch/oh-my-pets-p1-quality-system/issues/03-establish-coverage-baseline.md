# 建立 Vitest 与 Rust 覆盖率基线

Type: task
Status: resolved
Closeout-Contract: v1
Blocked by: none

## Question

如何为现有 Vitest 与 Rust 测试建立可重复、可解释的覆盖率基线，使后续能够观察关键分支和质量回退，同时避免用任意百分比或测试数量制造虚假的质量门禁？

## Scope

- 增加 Vitest、Rust 和聚合覆盖率根命令。
- 选择与当前 Vitest/Cargo 工具链兼容且维护成本可控的 coverage provider。
- 将正式主线源码、测试资产、辅助资产和生成物正确分类。
- 生成可读摘要及适合本地查看的详细报告。
- 记录首次基线的工具版本、执行环境、命令和实际指标。
- 为工具缺失、命令失败、范围误包含和报告输出路径增加明确反馈或自动化测试。

## Non-goals

- 设置全局 80% 等覆盖率阈值、changed-lines 门禁或质量排名。
- 用行覆盖率替代分支覆盖、人工 QA、视觉验证或 E2E。
- 将 HTML、原始 profile 或浏览器临时文件提交为正式流程资产。
- 顺带运行变异测试、圈复杂度或依赖图分析。
- 重写已有测试来追求数字提升。

## Completion criteria

- 根目录提供 `coverage:web`、`coverage:rust` 和聚合命令，或经 spec review 接受的等价命名。
- Vitest 与 Rust 报告均可在当前支持平台生成，并输出明确的正式源码范围。
- 仓库内存在首个基线文档，记录工具版本、环境、命令、指标和已知盲区。
- 生成报告进入 P0 已定义的本地输出边界，不污染正式主线变更范围。
- coverage 命令当前不设置百分比门禁，也不冒充 `pnpm verify` 的替代品。
- 缺失 Rust coverage 工具时有可执行安装说明和清晰失败信息；若 doctor 已存在，应纳入其检查。
- 最后相关改动后 `pnpm verify` 通过，完成 Standards + Spec 双轴 review。

## Comments

- 2026-07-29：用户确认先建立报告基线、不设硬百分比；当前保持 `open`，等待独立实施上下文领取。
- 2026-07-29 12:21:21 +0800：在独立 worktree 的 `codex/p1-03-coverage-baseline` 分支领取；基线为 `main` 的 `39b2daf000fb1630666dd852b2a695bb600452aa`。
- 2026-07-29 12:41:39 +0800：实现、真实 Web/Rust/聚合覆盖率运行、最终 verify、双轴 review 和中文实现提交均已完成；交互式桌面 QA 因无产品界面或桌面行为变更而不适用。

## Closeout Evidence

### Verify

- Status: passed
- Command: `pnpm verify`
- Result: 最后相关改动后通过正式范围检查、Rust workspace 测试、86 项 Web 测试、Rust fmt/Clippy、Oxlint、`vue-tsc`、Web 构建、真实 Tauri release 构建和 closeout 扫描。

### Manual QA

- Status: not-applicable
- Command: `pnpm qa:desktop`
- Result: 未执行交互式桌面 QA；真实 Tauri release 构建已由最终 `pnpm verify` 通过。
- Reason: 本票只增加工程覆盖率命令、范围/失败反馈测试和质量文档，不改变产品 UI、资源、窗口、托盘、点击穿透或诊断行为，没有可供桌面人工体验验收的新行为。

### Review

- Standards: passed
- Spec: passed
- Notes: Standards review 无发现；Spec review 初次发现 doctor 未检查 `llvm-tools-preview` 的阻塞项，已用红灯 fixture 修复并由原 reviewer 复核关闭，无剩余阻塞或 scope creep。

### Commit

- Status: committed
- Hash: b40327d7d731efc82834c0d8e5c37dc9388cd353

## Answer

已增加 `pnpm coverage:web`、`pnpm coverage:rust` 与聚合 `pnpm coverage`。Web 使用 Vitest 3.2.7 和固定的 `@vitest/coverage-v8` 3.2.7；Rust 使用 `cargo-llvm-cov` 0.8.7，并在缺少它或 `llvm-tools-preview` 时于测试前清晰失败。只读 doctor 会检查两项可选 Rust coverage 前置条件，缺失时只 warning。

两类报告都会输出终端摘要并机械校验正式源码范围。Web JSON/HTML 位于 `target/coverage/web/`，Rust JSON/HTML 位于 `target/coverage/rust/`，原始 profile 位于 `target/llvm-cov-target/`；首次运行所需的本地 coverage 工具也隔离在 `target/`，所有生成物均处于 P0 本地输出边界。

2026-07-29 的首次真实聚合基线为：

- Vitest/V8：Statements 与 Lines 71.49%（1462/2045），Branches 80.31%（310/386），Functions 86.17%（81/94）。
- Rust：Regions 45.77%（990/2163），Lines 46.72%（740/1584），Functions 40.88%（65/159）；稳定 branch 模式未启用，记为不适用。

完整环境、版本、命令与盲区记录在 `docs/coverage-baseline.md`。当前没有覆盖率阈值，命令未接入 `pnpm verify`；macOS arm64 单机基线、真实 GUI 生命周期和 Rust 稳定 branch 指标仍是明确盲区。
