# 增加 doctor 与桌面故障恢复路由

Type: task
Status: resolved
Closeout-Contract: v1
Blocked by: none

## Question

如何让开发者和 Agent 在 Tauri 桌面链路失败后，通过一条默认只读的根命令判断环境、依赖、端口和可恢复状态，并获得安全、明确的下一步，而不是依赖隐含经验或反复试错？

## Scope

- 增加根目录 doctor 命令及其轻量实现。
- 检查当前平台、Node、pnpm、Rust/Cargo、Tauri 前置条件、关键端口、正式依赖和诊断/构建路径。
- 为开发端口占用、依赖缺失、构建失败、窗口不可见、菜单栏入口受限、日志与诊断定位提供恢复文档。
- 复用 P0 已有的 desktop QA、诊断导出和范围边界，不重复实现第二套桌面 smoke。
- 使用 fixture 或依赖注入覆盖通过、警告、失败和工具缺失路径。

## Non-goals

- 自动安装系统依赖、结束占用端口的进程或执行破坏性缓存清理。
- 增加产品内设置页、遥测后端或远程诊断上传。
- 扩张 Windows 实机验收或发布打包范围。
- 顺带实施 Oxlint、覆盖率、视觉验证或 E2E。

## Completion criteria

- 根目录存在明确的 `pnpm doctor` 或经 spec review 接受的等价命令。
- doctor 默认只读，输出稳定的 pass/warn/fail 摘要，并在失败时给出仓库内下一步。
- 对 Node、pnpm、Rust/Cargo、平台、端口和关键路径的检查均有自动化测试。
- 恢复文档能从 doctor 输出和 `AGENTS.md` 被直接发现。
- 文档明确安全清理边界，不能建议删除整个 workspace、用户资产、research 或 reference。
- 最后相关改动后 `pnpm verify` 通过，完成 Standards + Spec 双轴 review。

## Comments

- 2026-07-29：由用户确认进入 P1，当前保持 `open`，等待独立实施上下文领取。
- 2026-07-29 11:30:14 +0800：已从当前 `main` 基线领取 P1-01，开始独立实施。
- 2026-07-29：pnpm 10.27 的内置 `pnpm doctor` 会遮蔽同名 package script；按 completion criteria 的等价命令条款选用根命令 `pnpm doctor:desktop`。
- 2026-07-29 11:55:13 +0800：实现、最终验证和双轴 review 已完成；实现提交为 `de2217f87eb38f6508ddb9449cf8069e7e034e28`。

## Closeout Evidence

### Verify

- Status: passed
- Command: `pnpm verify`
- Result: Rust workspace 测试、Vitest 69 项、fmt/Clippy、Vue 类型检查、Vite 构建、真实 Tauri release 构建和 closeout 扫描全部通过。

### Manual QA

- Status: not-applicable
- Command: not-applicable
- Result: 未执行交互式桌面人工 QA；真实 Tauri release 构建已由 `pnpm verify` 通过。
- Reason: 本票只新增默认只读的工程 doctor、fixture 测试和恢复文档，未修改 `src/ui`、`src-tauri`、窗口、菜单栏或其他桌面产品行为，没有可由人工桌面操作新增验证的体验面。

### Review

- Standards: passed
- Spec: passed
- Notes: Standards review 发现 manifest 缺失时仍可能泄漏安装建议，已拆分依赖状态并为 Tauri CLI/Node 依赖增加统一门控和组合 fixture；最终双轴复核均无阻塞发现。

### Commit

- Status: committed
- Hash: de2217f87eb38f6508ddb9449cf8069e7e034e28

## Answer

已增加根命令 `pnpm doctor:desktop`；该命名避开 pnpm 10 内置 `doctor` 对同名 package script 的遮蔽。命令默认只读，按稳定顺序检查平台、Node、pnpm、Rust/Cargo、Tauri CLI 与原生前置条件、`127.0.0.1:1420`、受控依赖清单、pnpm 安装状态、恢复入口、桌面构建产物和诊断索引，并输出 `pass`/`warn`/`fail` 摘要、仓库内下一步和失败退出码。

新增 `docs/desktop-recovery.md`，覆盖端口、依赖、构建、窗口、菜单栏、日志/诊断和安全清理边界；`AGENTS.md` 可直接发现入口。fixture 驱动测试覆盖健康、工具缺失、版本过旧、非正式平台、端口占用、路径缺失、组合依赖失败、稳定格式与根配置契约。真实环境最终结果为 `pass=12 warn=1 fail=0`；未生成 desktop smoke 诊断索引按设计为 warning。

残余风险：Windows 的 MSVC Build Tools/WebView2 仍按本票非目标保持人工确认并输出 warning；依赖检查证明受控清单和 pnpm 安装标记可定位，不逐包校验 Cargo 缓存或 lockfile 内容完整性。
