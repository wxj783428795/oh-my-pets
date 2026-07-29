# 修复 P0 交付就绪门禁缺口

Type: task
Status: claimed
Closeout-Contract: v1

## Question

如何在不扩张产品功能范围的前提下，补齐 oh-my-pets 正式主线的桌面关闭检查、closeout 证据守卫与正式主线边界隔离，使仓库能对 P0 预览版交付给出更可信的本地门禁？

## Completion criteria

- `pnpm verify` 覆盖最终自动化关闭检查，并包含真实 `tauri build`。
- 提供根目录桌面 QA 路由，至少覆盖启动、示例宠物加载、窗口隐藏/托盘恢复、点击穿透开关和诊断导出。
- 提供结构化 ticket 关闭证据格式和可执行校验，缺失 verify、人工 QA/不适用理由、Standards review、Spec review 或提交记录时会失败。
- 正式主线边界规则能区分 `.scratch` 流程资产与 prototype/研究/参考/本地生成物。
- 新增脚本与守卫具备自动化测试。
- 文档、ticket 记录、双轴 review、最终验证与中文提交全部完成。

## Comments

- 2026-07-29：根据用户在独立 worktree 中的明确授权创建并领取本票，范围限定为 Better Harness 报告中的三个 P0 交付就绪缺口，不扩张到 Windows 实机验收、视觉回归、覆盖率或模块重构。
- 2026-07-29：`pnpm qa:desktop:auto` 已使用 release Tauri 可执行文件通过启动、示例宠物加载、托盘处理器隐藏/恢复、点击穿透开关与诊断导出；真实菜单栏点击、视觉显示和点击穿透体验仍待验收人运行 `pnpm qa:desktop`。
- 2026-07-29：Standards + Spec 双轴 review 共发现 5 个阻塞问题：`verify:core` 可冒充最终 verify、Manual QA Command 未校验、`target/` 分类错误、干净工作树范围门禁为空、人工 QA 未限制 macOS/应用存活。以上均已修复并补测试；跨语言清单重复的判断性 smell 已用共享 JSON 合同消除。
- 2026-07-29：实现提交为 `1bda7706141e59cbd781136f8a6e7b26ad0a661b`（`补齐 P0 交付就绪门禁`）；本票因真实 macOS 人工 QA 未完成而继续保持 `claimed`。

## Closeout Evidence

### Verify

- Status: passed
- Command: `pnpm verify`
- Result: 2026-07-29 完整通过；包含范围检查、Rust/前端测试、fmt/Clippy、类型检查、WebView 构建、真实 Tauri release 构建与 closeout 扫描

### Manual QA

- Status: pending
- Command: `pnpm qa:desktop`
- Result: 自动部分已通过，报告为 `target/desktop-smoke/report.json`；真实 macOS 交互项待执行
- Reason: 菜单栏物理点击、宠物视觉显示与点击穿透体验必须由验收人在真实桌面确认，自动 smoke 不替代该结果

### Review

- Standards: passed
- Spec: passed
- Notes: 双轴 review 的 5 个阻塞发现均已修复；最终增量复核无未处理阻塞项，范围未扩张到 P1/P2

### Commit

- Status: committed
- Hash: 1bda7706141e59cbd781136f8a6e7b26ad0a661b

## Answer

已补齐真实 Tauri 构建关闭门禁、release 应用自动桌面 smoke、交互式 macOS 人工 QA 路由、结构化 ticket closeout 守卫及正式主线范围检查。`.codex/`、`output/` 与 prototype 子树通过忽略规则隔离，research/reference 保持可见并由范围检查拒绝混入正式关闭变更，现有用户资产未被删除、移动或覆盖。

自动化桌面检查已经通过；真实菜单栏点击、视觉显示和点击穿透体验仍待人工 QA，因此 ticket 保持 `claimed`。实现提交记录已回写。
