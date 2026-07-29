# 增加模块规模、复杂度与依赖边界反馈

Type: task
Status: open
Closeout-Contract: v1
Blocked by: none

## Question

如何在不以任意行数或复杂度数字替代设计 review 的前提下，持续暴露正式源码的
模块热点、复杂函数、循环依赖和错误的层间方向？

## Scope

- 增加确定性的架构检查与报告根命令。
- 报告正式源码模块规模、热点分组和依赖关系。
- 复用 Oxlint 检查前端循环依赖与函数圈复杂度信号。
- 复用 Clippy 与 `cargo metadata --format-version=1` 检查 Rust 复杂度和 crate
  依赖方向。
- 为范围污染、循环依赖、禁止方向、空报告和分析器失败增加红灯测试。
- 将稳定硬门禁接入 `verify:core`，并记录首次基线和已知盲区。
- 同步 `AGENTS.md`、交付就绪文档和相关架构说明。

## Non-goals

- 因为文件较大而重写 `validation.rs`、`src-tauri/src/lib.rs`、`App.vue` 或
  `doctor.mjs`。
- 设置“超过 500 行即失败”等全局模块大小阈值。
- 引入 Sonar、CodeClimate、数据库或云端分析服务。
- 顺带执行 mutation、coverage threshold、依赖漏洞审计或自动升级。
- 为减少 Tauri 传递依赖重复而覆盖上游版本。

## Completion Criteria

- 根命令输出人类可读摘要，并在 `target/quality/architecture/` 生成机器可读
  报告。
- 报告只包含正式主线源码；测试、声明文件、浏览器测试 seam、prototype、
  research、reference 和生成物被机械拒绝。
- 首次基线文档记录命令、工具版本、模块热点、依赖方向和已知盲区。
- 前端循环依赖、Rust `domain -> tauri` 禁止方向和分析器失败会阻断检查。
- 复杂度检查有高信号规则和测试，现有有意模式只能局部、带原因抑制。
- 模块规模只作为 review/拆分信号，不使用任意全局行数阈值阻断验证。
- 稳定架构检查进入 `pnpm verify:core` 和最终 `pnpm verify`。
- 最后相关改动后 `pnpm verify` 通过，完成 Standards + Spec 双轴 review。

## Comments

- 2026-07-29：用户确认实施 P2-02。当前观测热点为
  `src/pet-domain/src/validation.rs` 约 1070 行、`src-tauri/src/lib.rs` 约
  727 行、`src/ui/App.vue` 约 631 行和 `scripts/lib/doctor.mjs` 约 419 行；
  这些数字只用于规划首次基线，不是预设失败阈值。

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
