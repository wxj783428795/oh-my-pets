# 架构反馈基线

本页记录 2026-07-29 首次运行 `pnpm architecture:check` 的结果。该命令运行
Oxlint、Clippy 与 `cargo metadata --format-version=1 --no-deps`，在终端输出摘要，
并把不含时间戳和绝对路径的确定性 JSON 写入
`target/quality/architecture/report.json`。

## 分析范围

正式源码范围为：

- `src/ui/` 下的 TypeScript 与 Vue 源码；
- `scripts/` 下的非测试 `.mjs` 工程源码；
- `src/pet-domain/src/` 与 `src-tauri/src/` 下的 Rust 源码；
- `src-tauri/build.rs`、`vite.config.ts` 和 `playwright.config.ts`。

测试、`.d.ts`、`src/ui/browser-test-platform.ts`、`src-tauri/tests/`、
`research/`、`reference/`、`.scratch/**/prototypes/` 和生成目录不进入报告。
范围为空或分析器收到越界文件时检查失败。LOC 是文件物理行数，不删除空行或注释，
因此只适合观察模块规模变化，不代表逻辑量或设计质量。

热点分组只用于阅读报告：

- `large`：500 LOC 及以上；
- `medium`：200–499 LOC；
- `small`：低于 200 LOC。

这些分组不设置通过率，也不会仅因文件跨过分组边界阻断 `pnpm verify`。是否拆分应
结合职责数量、变更频率、依赖耦合、测试困难和 review 成本形成独立 ticket。

## 首次结果

正式范围共 35 个模块、5626 LOC：`large=3`、`medium=3`、`small=29`。

| 路径                               |  LOC | 分组   |
| ---------------------------------- | ---: | ------ |
| `src/pet-domain/src/validation.rs` | 1070 | large  |
| `src-tauri/src/lib.rs`             |  727 | large  |
| `src/ui/App.vue`                   |  631 | large  |
| `scripts/lib/doctor.mjs`           |  410 | medium |
| `scripts/lib/architecture.mjs`     |  401 | medium |
| `src/ui/pet-renderer.ts`           |  257 | medium |
| `src/pet-domain/src/model.rs`      |  189 | small  |
| `scripts/check-architecture.mjs`   |  187 | small  |
| `scripts/desktop-qa.mjs`           |  173 | small  |
| `scripts/lib/closeout.mjs`         |  139 | small  |

前端/工程源码有 20 条可解析的内部 import 边和 0 个循环。Rust workspace 有
1 条允许边 `oh-my-pets -> oh-my-pets-domain`；反向
`oh-my-pets-domain -> oh-my-pets` 被硬门禁禁止，当前禁止边和 workspace 循环
均为 0。

复杂度信号使用 Oxlint 1.76.0 的 `complexity`（单函数圈复杂度上限 20）和
`import/no-cycle`，以及随 Rust 1.97.1 提供的 Clippy 0.1.97
`clippy::cognitive_complexity`（当前默认阈值 25）。Oxlint override 排除测试、
声明和 browser-test seam；Clippy 只检查 workspace 的 lib/bin 产品 target。
规则或分析器失败都会阻断命令；项目没有全局 disable，确有意图的例外必须在
最窄范围内写明原因，并由 unused-disable 检查约束。

## 已知盲区

- Web 依赖图只解析字符串字面量形式的静态、动态相对 import；运行时拼接路径不会
  进入图。CSS 等非代码资源和 browser-test seam 按范围契约排除。
- Oxlint 对 Vue 只分析 `<script>`，不提供 template 专用复杂度或依赖语义。
- Rust 模块 LOC 是源码文件级信号；宏展开后的代码、函数调用图和跨函数复杂度不在
  本报告内。
- Cargo 图只检查当前 workspace package 的直接依赖和禁止方向，不是漏洞、
  许可证、传递依赖重复或供应链审计。
- 当前复杂度报告只记录分析器、规则、版本和通过状态，不输出每个未超阈值函数的
  数字；需要趋势 ratchet 时应先证明该数据能改善决策。
