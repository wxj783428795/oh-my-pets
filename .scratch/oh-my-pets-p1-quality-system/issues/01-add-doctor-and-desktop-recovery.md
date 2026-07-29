# 增加 doctor 与桌面故障恢复路由

Type: task
Status: open
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
