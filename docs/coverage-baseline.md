# 覆盖率基线

本页记录 2026-07-29 首次成功运行的 Vitest 与 Rust 覆盖率基线。基线用于观察后续变化和定位盲区，不是质量排名，也不设置百分比门禁；`pnpm coverage` 不属于或替代 `pnpm verify`。

## 环境与工具

- 基线代码：P1-03 工作树，基于 `main` 的 `39b2daf000fb1630666dd852b2a695bb600452aa`
- 系统：macOS 14.4（23E214），Apple Silicon arm64
- Node：22.14.0
- pnpm：10.27.0
- Vitest：3.2.7
- Web provider：`@vitest/coverage-v8` 3.2.7（固定版本）
- Rust/Cargo：1.97.1
- Rust LLVM：22.1.6
- Rust provider：`cargo-llvm-cov` 0.8.7

首次运行时，机器没有全局 `cargo-llvm-cov`，全局 Rust toolchain 也没有 `llvm-tools-preview`。为避免修改全局环境，实际基线把 `cargo-llvm-cov` 安装在 `target/coverage-tools/`，把最小 stable toolchain 与 `llvm-tools-preview` 安装在 `target/coverage-rustup/`；两者均处于 P0 已定义、被 Git 忽略的 `target/` 本地输出边界。

## 命令与报告

正式入口：

```bash
pnpm coverage:web
pnpm coverage:rust
pnpm coverage
```

首次真实聚合运行使用隔离工具：

```bash
RUSTUP_HOME="$PWD/target/coverage-rustup" RUSTUP_TOOLCHAIN=stable PATH="$PWD/target/coverage-tools/bin:$PATH" pnpm coverage
```

Web 入口以文本表格输出摘要，并生成：

- 范围清单：`target/coverage/web/coverage-summary.json`
- 详细报告：`target/coverage/web/index.html`

Rust 入口只运行一次 workspace/all-targets 测试，再复用同一份 profile 输出文本摘要、JSON 范围清单与 HTML：

- 范围清单：`target/coverage/rust/summary.json`
- 详细报告：`target/coverage/rust/html/index.html`
- 原始 profile 与 instrumented build：`target/llvm-cov-target/`

范围检查确认 Web 报告只有 `src/ui/` 与 `scripts/` 的 17 个正式源码文件，Rust 报告只有 `src/pet-domain/src/` 与 `src-tauri/src/` 的 9 个正式源码文件。测试、声明文件、生成代码、prototype、research、reference 与构建产物不进入指标；范围为空或发现越界文件时命令会失败。

## 首次指标

### Vitest / V8

| 维度       | 已覆盖 / 总计 | 覆盖率 |
| ---------- | ------------- | ------ |
| Statements | 1462 / 2045   | 71.49% |
| Branches   | 310 / 386     | 80.31% |
| Functions  | 81 / 94       | 86.17% |
| Lines      | 1462 / 2045   | 71.49% |

### Rust / cargo-llvm-cov

| 维度      | 已覆盖 / 总计 | 覆盖率 |
| --------- | ------------- | ------ |
| Regions   | 990 / 2163    | 45.77% |
| Functions | 65 / 159      | 40.88% |
| Lines     | 740 / 1584    | 46.72% |
| Branches  | 不适用        | 不适用 |

Rust 稳定命令默认提供 regions、functions 与 lines。`cargo-llvm-cov` 的 branch 模式仍标记为 unstable，本基线没有启用，因此终端报告中的 Branches 为 `-`，不能解读为 0% 或 100%。

## 已知盲区

- Web 指标覆盖 Vitest 触达的 Vue/TypeScript 和工程脚本，不证明 Canvas 像素、真实 WebView、菜单栏、点击穿透或其他桌面体验；这些仍由后续视觉/E2E 和既有桌面 QA 负责。
- `src/ui/main.ts` 与根 CLI 入口在单元测试进程中不启动，因此当前显示为 0%；这揭示启动集成盲区，不授权本票为追求数字重写测试。
- Rust 单元与集成测试不启动真实 Tauri GUI 生命周期，`src-tauri/src/lib.rs` 和 `main.rs` 的大量应用装配代码因此未覆盖；真实桌面 smoke 与人工 QA 仍不可替代。
- 当前环境只测 macOS arm64；Windows 条件分支、目标工具链和图形会话不在本次指标内。
- Rust build script、第三方依赖和生成代码不属于正式源码指标；不稳定 branch/MCDC、变异测试、复杂度和依赖图也未启用。
- 本基线只报告现状。任何未来阈值、changed-lines 门禁或覆盖率政策都需要独立决策，不能从这些首次数值自动推导。
