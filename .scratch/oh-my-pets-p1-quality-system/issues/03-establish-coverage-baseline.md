# 建立 Vitest 与 Rust 覆盖率基线

Type: task
Status: open
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

## Closeout Evidence

### Verify

- Status: pending
- Command: `pnpm verify`
- Result: pending

### Manual QA

- Status: pending
- Command: pending
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
