# 增加模块规模、复杂度与依赖边界反馈

Type: task
Status: resolved
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
- 2026-07-29 16:02:49 CST：在独立 worktree 的
  `codex/p2-02-architecture` 分支领取；实施基线为
  `a3e28076b7593f3766914e3f332cc3cc654d9a32`。
- 2026-07-29 16:22:29 CST：先以缺少分析模块建立红灯，再为范围污染、空范围、
  前端循环、Rust 禁止方向、仓库外 workspace、分析器失败及真实
  Oxlint/Clippy 复杂度违规补测试。首次命令还被分析器自身的
  `preserve-caught-error` 规则阻断，已保留 cause 后转绿。
- 2026-07-29 16:22:29 CST：Standards review 收紧 Cargo stdout/stderr
  解析、与 cwd/locale 无关的发现和排序、仓库外成员拒绝，以及失败前清除旧报告
  和原子写入；Spec review 将 Oxlint override 与 Clippy lib/bin 严格限制在正式
  源码，测试与 browser seam 不进入复杂度门禁。复审均 0 阻塞。
- 2026-07-29 16:22:29 CST：当前确定性基线为 35 个模块、5626 物理 LOC、
  Web 内部边 20、Rust 允许边 1、循环 0、禁止方向 0；模块分组只报告不设
  百分比或行数关闭条件。
- 2026-07-29 16:24:00 CST：实现提交为
  `5bcf2b063888f62c7b3288a7f37e3dad0499114a`。

## Closeout Evidence

### Verify

- Status: passed
- Command: `pnpm verify`
- Result: 最后相关改动后通过；架构报告 35 个模块/5626 LOC、Rust 26 项、
  Vitest 111 项、Chromium 2 项、Oxlint/vue-tsc、Web 构建、真实 Tauri release
  build 与 closeout 均通过。

### Manual QA

- Status: not-applicable
- Command: `not-applicable`
- Result: 本票未改变任何用户界面或原生桌面行为。
- Reason: 仅增加工程分析器、静态规则、机器报告和文档；不涉及窗口、托盘、
  点击穿透、诊断交互或视觉输出。

### Review

- Standards: passed
- Spec: passed
- Notes: Standards 初审发现 cwd/locale、Cargo stderr、仓库外 workspace 和旧报告
  原子性问题，Spec 初审发现 Oxlint/Clippy 超出正式源码范围，均已修复；最终
  Standards 0、Spec 0。

### Commit

- Status: committed
- Hash: `5bcf2b063888f62c7b3288a7f37e3dad0499114a`

## Answer

已增加确定性架构反馈：模块规模和热点分组只作 review 信号；前端循环、Rust
workspace 循环、`domain -> desktop shell` 禁止方向、范围污染和分析器失败均为
硬门禁，稳定检查已进入 `verify:core`。
