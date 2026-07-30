# macOS 桌宠预览候选版实施地图

## Destination

把当前以预览工作台为中心的 macOS 主线推进为可在真实 Apple Silicon macOS
日常常驻的桌宠预览候选版：正式“卷卷”、完整陪伴循环、可靠恢复、低干扰控制
和性能稳定性均通过自动验证与真实 `.app` 人工 QA。

## Source of truth

- 规格：[`spec.md`](./spec.md)
- 领域词汇：[`CONTEXT.md`](../../CONTEXT.md)
- 架构：[`ADR 0001`](../../docs/adr/0001-tauri-rust-pixijs-desktop-architecture.md)
- 既有行为决策：
  [`Issue 01`](../oh-my-pets-p0-alpha/issues/01-define-p0-companion-loop.md)
- 宠物包边界：
  [`Issue 04`](../oh-my-pets-p0-alpha/issues/04-define-pet-pack-boundary.md)
- 首发内容：
  [`Issue 06`](../oh-my-pets-p0-alpha/issues/06-define-first-pet-content.md)
- 分支与 Pull Request：
  [`Branch Management`](../../docs/agents/branch-management.md)

## Branch and Pull Request strategy

- 本专题选择独立小票模式，不创建 `integration/*`。八张票各自形成可验证、
  可人工验收且合入后保持 `main` 可集成的 tracer bullet。
- 当前规划资产使用
  `codex/docs-macos-preview-candidate -> main` 的正式文档 Pull Request。
  规划 PR 合并前，所有实施票保持 `open` 且不得领取。
- 规划 PR 合并后，每张实施票从当时最新 `main` 创建下表中的独立分支，主要
  Pull Request target 均为 `main`。
- 前置票必须先通过 Pull Request 进入 `main`；后续票不得从前置 topic 分支
  派生，也不得直接合并兄弟 ticket 分支。
- 实现 SHA 写入 closeout 后禁止 rebase／强推；base 前进时只使用保留提交的
  merge update，并重新运行门禁。

## Dependency graph

```text
01 产品窗口壳
└── 02 状态、持久化与恢复
    └── 03 原生运动与多显示器
        └── 04 直接互动与文件投喂
            └── 05 自主陪伴与环境降频

06 正式卷卷美术 ─────────────────┐
02 ───────────────┐              │
04 ───────────────┼── 07 引导与设置体验
05 ───────────────┤              │
06 ───────────────┘              │
                                  ├── 08 性能、稳定性与整体验收
04 ───────────────────────────────┤
05 ───────────────────────────────┤
07 ───────────────────────────────┘
```

## Tickets

| 编号 | Ticket                                                                              | Blocked by     | 实施分支                                                  | PR target | 端到端结果                                    |
| ---- | ----------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------- | --------- | --------------------------------------------- |
| 01   | [建立双窗口与菜单栏产品壳](./issues/01-build-product-window-shell.md)               | none           | `codex/macos-preview-candidate-01-window-shell`           | `main`    | 启动只见宠物，菜单可打开设置、隐藏恢复和退出  |
| 02   | [建立状态持久化与恢复控制](./issues/02-add-state-persistence-and-controls.md)       | 01             | `codex/macos-preview-candidate-02-state-controls`         | `main`    | 设置和会话状态遵循持久化矩阵，菜单始终可恢复  |
| 03   | [实现原生运动与多显示器安全区](./issues/03-add-native-motion-and-display-safety.md) | 02             | `codex/macos-preview-candidate-03-display-motion`         | `main`    | 小窗随宠物移动、召回并在显示器变化后保持可见  |
| 04   | [实现直接互动与文件投喂](./issues/04-add-direct-interactions-and-feeding.md)        | 03             | `codex/macos-preview-candidate-04-direct-interactions`    | `main`    | 点击、拖拽、抛掷、落地与无副作用投喂形成闭环  |
| 05   | [实现自主陪伴与环境降频](./issues/05-add-autonomous-companion-loop.md)              | 04             | `codex/macos-preview-candidate-05-companion-loop`         | `main`    | 15 个动作可达，频率、安静、全屏和休眠状态正确 |
| 06   | [制作并集成正式卷卷](./issues/06-produce-production-juanjuan.md)                    | none           | `codex/macos-preview-candidate-06-production-juanjuan`    | `main`    | 原创 80–96 帧正式宠物包替换占位资源           |
| 07   | [完成首次引导与设置体验](./issues/07-finish-onboarding-and-preferences.md)          | 02, 04, 05, 06 | `codex/macos-preview-candidate-07-onboarding-preferences` | `main`    | 一次性引导和最终偏好设置在正式内容上闭环      |
| 08   | [达成候选版关闭门槛](./issues/08-harden-preview-candidate.md)                       | 04, 05, 06, 07 | `codex/macos-preview-candidate-08-candidate-hardening`    | `main`    | 性能、四小时稳定性、自动 smoke 与整体验收通过 |

## Current frontier

- 当前没有可领取实施票：必须先让本规划 Pull Request 合入 `main`。
- 规划 PR 合并后，`Issue 01` 与 `Issue 06` 成为首批可领取 frontier。
- 其他票必须等待 `Blocked by` 中的票全部 `resolved`，且对应 Pull Request
  已经合入 `main`。
- 领取前把 `Status: open` 改为 `Status: claimed`，在新的实施上下文中读取当前
  ticket、`spec.md`、`CONTEXT.md`、适用 ADR 与分支规范，并在
  `## Comments` 记录领取时间、分支名、base 分支、base commit 和 PR target。
- 每张票按 TDD 小切片推进；最后相关改动后必须通过 `pnpm verify`、该票需要的
  桌面人工 QA、双轴 review、中文提交、单票 closeout 和指向 `main` 的
  Pull Request required check。

## Boundary notes

- `Issue 08` 拥有性能测量、四小时 soak、最终 QA 清单和跨票整合，不替代
  `Issue 01`–`07` 各自的人工验收。
- `Issue 06` 可以与窗口／行为主线并行，但正式整合只在 `Issue 07` 和
  `Issue 08` 发生。
- 本地图没有授权创建 `integration/*`；需要改变 PR target 时必须先更新 accepted
  spec、地图、ticket 和远端门禁。
- 任一票不得顺带加入签名、公证、DMG、外部测试、Windows、用户宠物包导入或
  第二只宠物。
- 调研与 `reference/` 仅作只读证据，不得混入正式主线关闭范围。
