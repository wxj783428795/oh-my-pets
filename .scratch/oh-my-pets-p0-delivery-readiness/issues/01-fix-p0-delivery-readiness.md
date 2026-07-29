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
- 2026-07-29：真实 macOS 人工 QA 结果为 3/4；菜单栏恢复、点击穿透和诊断文件通过，但示例宠物视觉加载失败，界面停在“等待宠物包 / 未加载”。已建立并领取阻塞 bug `02-fix-frontend-pet-startup`，本票不得关闭。
- 2026-07-29：阻塞 bug 修复后重新执行完整人工 QA，Dock 品牌图标与菜单栏恢复、单帧示例宠物显示与语义时间线、点击穿透、诊断文件均通过。工程示例包明确只有一张占位帧，首发逐帧动画资源不属于本 P0 修复范围。
- 2026-07-29：最终 Standards review 检查正确性、可靠性、安全性、可维护性与测试质量；Spec review 逐项核对 P0 三项范围、桌面验收边界和 P1/P2 非目标。发现并修正文档漏列前端挂载自动检查，复核后无阻塞项。

## Closeout Evidence

### Verify

- Status: passed
- Command: `pnpm verify`
- Result: 2026-07-29 完整通过；范围检查、Rust/前端 62 项测试、fmt/Clippy、类型检查、WebView 构建、真实 Tauri release 构建与 closeout 扫描均通过

### Manual QA

- Status: passed
- Command: `pnpm qa:desktop`
- Result: 2026-07-29 真实 macOS 人工 QA 4/4；Dock 图标与菜单栏恢复、示例宠物显示与语义时间线、点击穿透、诊断文件全部通过
- Reason: `target/desktop-smoke/manual-qa.json` 已记录本轮完整通过结果

### Review

- Standards: passed
- Spec: passed
- Notes: 最终双轴 review 发现交付文档漏列前端 PixiJS 挂载检查并已修复；复核后无阻塞项，未扩张到首发动画资源、视觉回归或发布分发

### Commit

- Status: committed
- Hash: 1bda7706141e59cbd781136f8a6e7b26ad0a661b

## Answer

已补齐真实 Tauri 构建关闭门禁、release 应用自动桌面 smoke、交互式 macOS 人工 QA 路由、结构化 ticket closeout 守卫及正式主线范围检查。`.codex/`、`output/` 与 prototype 子树通过忽略规则隔离，research/reference 保持可见并由范围检查拒绝混入正式关闭变更，现有用户资产未被删除、移动或覆盖。

阻塞 bug 已修复，自动化桌面检查与真实 macOS 人工 QA 均已通过；ticket 保持 `claimed`，等待最后完整验证、双轴 review 与提交记录。
