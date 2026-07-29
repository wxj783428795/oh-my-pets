# P0 交付就绪门禁补强规格

Status: accepted

## Context

2026-07-29 的 Better Harness 复核指出，当前仓库已经有可运行的正式主线与关闭规则，但仍存在三个 P0 级交付缺口：

- 根目录 `pnpm verify` 没有覆盖真实 Tauri 桌面构建，也没有提供可重复执行的桌面 smoke/QA 路由。
- ticket 关闭所需的 verify、人工 QA、Standards + Spec review 与提交记录主要依赖人工自觉，没有最小本地守卫。
- 主线 closeout、review 与验证边界会被 `.codex/`、`output/`、`.scratch/**/prototypes/`、`research/`、`reference/` 等非正式主线资产污染。

本规格只解决上述交付与流程门禁问题，不扩张到新的产品功能、Windows 实机验收、视觉回归或大规模模块重构。

## Goals

- 让根目录 `pnpm verify` 覆盖正式主线的最终自动化关闭检查，包括真实 Tauri 桌面构建。
- 提供一条可重复执行的最小桌面验收路由，明确哪些项可自动化、哪些项必须在真实 macOS 桌面人工完成。
- 为 resolved ticket 提供结构化、可执行检查的关闭证据格式，并提供最小本地校验命令。
- 明确正式主线、流程资产、辅助资产和本地生成物的边界，降低噪声文件对 closeout 与 review 的污染。

## Non-goals

- 补做 Windows 11 图形壳自动化或人工验收。
- 引入外部 CI、云端工作流、重量级 GUI 自动化框架或数据库。
- 重写现有 issue tracker 或大规模重构 `src/ui`、`src-tauri`。
- 删除、移动或覆盖已有 prototype、research、reference 或用户本地生成内容。

## Behavior requirements

### Final verification

- `pnpm verify` 必须保留根目录唯一正式主线关闭命令的语义。
- `pnpm verify` 必须在现有测试、lint、WebView 构建之后继续执行真实桌面构建。
- 桌面构建失败时，关闭检查必须失败，不能因为前序 Web 构建通过而放行。

### Desktop smoke and manual QA

- 仓库必须提供一条明确的桌面 QA 路由，由根目录 `pnpm` script 统一暴露。
- 路由至少覆盖：启动、示例宠物加载、窗口隐藏/托盘恢复、点击穿透开关、诊断导出。
- 自动化部分要留下可读输出；必须人工完成的部分要以结构化清单记录，不得伪造通过。
- 若自动化 smoke 依赖本机 macOS/Tauri 运行态，应明确失败信号与人工补救边界。

### Closeout evidence and guard

- 实施 ticket 必须使用统一的结构化关闭证据段落记录：
  - 最终 `pnpm verify`
  - 桌面人工 QA 或不适用理由
  - Standards review
  - Spec review
  - 提交记录
- 仓库必须提供最小可执行校验，能在 resolved ticket 缺失上述关键证据时失败，并指出缺失项。
- 关闭守卫应作为根目录正式命令或清晰的关闭命令暴露，而不是只写文档。

### Mainline scope boundary

- 仓库必须明确区分：
  - 正式主线产品代码与配置
  - 正式流程资产（如 `.scratch/**/spec.md`、`.scratch/**/issues/*.md`）
  - 原型/研究/外部参考等辅助资产
  - 本地生成物（如 `.codex/`、`output/`）
- `.scratch` 不能被整体排除；只有 prototype 子树和其构建产物可按辅助资产对待。
- 边界规则必须由仓库自带配置、文档或检查器表达，不能只靠口头约定。

## Acceptance criteria

- `pnpm verify` 通过并包含真实 `tauri build`。
- 新增桌面 smoke/QA 路由可执行，且对自动化与人工项有明确划分。
- 新增关闭证据校验能阻断缺失关键证据的 resolved ticket，并在证据补齐后放行。
- 主线范围检查能把 `.scratch` 流程资产与 prototype/研究/参考/本地生成物区分开。
- 新增脚本或守卫具备自动化测试。
- `AGENTS.md`、相关 docs 与 ticket 模板/说明已同步更新。
