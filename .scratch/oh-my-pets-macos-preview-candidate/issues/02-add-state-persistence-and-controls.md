# 建立产品状态、持久化与恢复控制

Type: task
Kind: feature
Status: claimed
Closeout-Contract: v1
Blocked by: 01

## Question

如何建立 Rust 拥有的统一产品状态，使菜单栏、偏好设置和宠物窗口共享同一事实
来源，并严格区分跨启动偏好、会话状态和始终可用的恢复路径？

## Scope

- 建立明确的持久偏好模型：尺寸、活动频率、开机启动和最后有效位置。
- 建立明确的会话状态模型：安静模式、隐藏、鼠标穿透、当前动作、速度和计时器。
- 实现安全默认值：中号、标准活动频率、开机启动关闭、安静关闭、宠物可见、
  鼠标穿透关闭。
- 启动时只恢复允许持久化的字段；隐藏、安静、鼠标穿透和运行时行为必须重置。
- 为偏好版本升级、损坏、缺失和非法值提供原子读取／写入与安全回退；诊断中
  只记录必要状态，不包含用户文件路径。
- 扩展菜单栏为最终控制集合，并让状态文字实时同步：
  - 显示／隐藏宠物
  - 开启／退出安静模式
  - 开启／关闭鼠标穿透
  - 召回宠物
  - 打开偏好设置
  - 退出应用
- 建立偏好设置的功能骨架并绑定尺寸、活动频率、开机启动、重新加载内置卷卷、
  重放新手提示、诊断导出与高级开发预览入口。
- 实现真正的默认关闭开机启动切换；不得仅在界面保存一个无系统效果的布尔值。
- 保证开启整窗鼠标穿透后仍可从菜单栏关闭；重启应用后穿透必定关闭。
- 为菜单／偏好双向同步、持久化矩阵、损坏恢复、并发写入和启动重置补测试。

## Non-goals

- 本票不实现多显示器安全区算法和自主窗口移动；“召回”可先复用现有单显示器
  安全恢复能力，由 `Issue 03` 完成多显示器语义。
- 不实现拖拽抛掷、文件投喂或自主行为调度。
- 不完成首次启动提示的视觉流程；本票只提供可持久化的“已显示”状态和重放命令
  seam，由 `Issue 07` 接入体验。
- 不增加始终置顶开关、音量、逐动作概率、物理参数或排程。
- 不实现用户宠物包导入。

## Completion Criteria

- 状态矩阵与 `spec.md` 完全一致，自动测试证明每个字段应保存或应重置。
- 菜单栏与偏好设置读取同一状态；任一入口修改后，另一个入口和宠物窗口立即
  反映结果，不靠重启同步。
- 应用在偏好文件不存在、截断、版本未知或值越界时仍以安全默认值显示宠物，并
  产生可理解的本地诊断。
- 开机启动默认关闭，开启／关闭会实际更新 macOS 登录项状态，并能读取系统真实
  状态校正界面。
- 鼠标穿透开启后宠物无法接收输入，菜单栏可以恢复；退出并重启后穿透关闭且
  宠物可见。
- 重新加载内置卷卷和诊断导出继续复用 Rust 正式路径；开发预览只存在于高级
  区域。
- `pnpm qa:desktop` 人工验证菜单状态、偏好同步、重启持久化与恢复路径。
- 最后相关改动后 `pnpm verify` 通过，Standards + Spec 双轴 review 无阻塞项。
- 创建主要实施分支对应、指向 `integration/macos-preview-candidate` 的 Ready
  Pull Request，并在最新 integration 上通过 `macOS ARM64 最终验证`；只允许
  merge commit。

## Implementation Notes

- Rust 是持久状态和会话状态的事实来源；前端不得建立会与原生菜单漂移的第二份
  状态机。
- 持久化路径和登录项实现应保持可替换，避免平台 API 进入领域 crate。
- 位置数据先定义版本化模型，实际多显示器归一化和安全恢复由 `Issue 03` 完成。

## Comments

- 2026-07-30：用户确认持久化矩阵、菜单栏和偏好设置的最终最小控制集合。
- 2026-07-30：按用户批准的新策略迁移到
  `integration/macos-preview-candidate`；本票等待 `Issue 01` 的 Pull Request
  合入 integration 并完成 closeout 后再领取。
- 2026-07-30：历史迁移例外：planning 资产已在新生命周期规则生效前通过 Pull
  Request #4 进入 `main`，因此不伪造 planning bootstrap。例外仅校正本专题
  交付路由，不改写 `main`；风险是流程资产曾表达错误 target。补救为从
  `main@6f06cc7` 建立受保护 integration、治理 PR 完整门禁、逐票 closeout 和
  最终全规格 review。
- 2026-07-30 14:09 CST：领取本票。实施分支：
  `codex/macos-preview-candidate-02-state-controls`；base：
  `integration/macos-preview-candidate`；base commit：
  `7970aedc97adaeb8a25c3fe50286446aa02eb93d`；Pull Request target：
  `integration/macos-preview-candidate`。
- 2026-07-30：TDD 使用已获用户批准的 ticket/spec 公共 seams：Rust 产品状态
  命令与事件、版本化偏好存储边界、登录项平台边界、菜单与偏好设置共享状态，
  以及真实 desktop smoke／人工 QA 报告。测试只观察这些公共边界的输入输出与
  用户可见恢复结果，不断言内部调用顺序。
- 2026-07-30 15:19 CST：人工 QA 发现完整应用启动会中断原 Codex 输入框的键盘
  first responder，但前台应用 PID 没有切换。用持续输入探针复现后逐项排除默认
  菜单、可见窗口、登录项插件和全部产品 setup；最小 Tauri 事件循环仍稳定失败。
  当前 TAO 启动链会在 `applicationDidFinishLaunching` 中调用
  `activateIgnoringOtherApps(true)`。进入事件循环前使用 Prohibited、setup
  完成后切回 Accessory 后，最小探针连续三轮通过，恢复完整窗口与 Issue 02
  setup 后用户确认 Codex 输入框不再丢焦点。长期机制、排查顺序和升级复验条件
  固化在 `docs/adr/0002-macos-background-launch-activation-handshake.md` 与
  `docs/desktop-recovery.md`；本票整体人工 QA 尚未完成，仍保持 `claimed`。
- 2026-07-30 15:48 CST：首轮完整人工 QA 中，用户确认启动焦点和跨
  Space／其他应用普通全屏可见性通过。期间观察到从全屏返回桌面后自动跳转，
  但关闭 Oh My Pets 后仍可复现，关闭独立的 Codex 宠物后消失，因此判定为外部
  应用干扰，不修改本产品窗口集合策略。用户同时指出“重新显示新手提示”只有状态
  文案，容易误解为本票已实现提示界面；依据本票 Non-goals 先添加失败测试，再把
  按钮和成功反馈改为“重置新手提示状态，提示界面将在后续体验流程接入”。首轮
  QA 已主动中止，未生成伪通过报告；源码变化后需重跑 verify、自动 smoke 和完整
  人工 QA。召回在宠物已经位于当前单显示器安全位置时为幂等成功，鼠标所在显示器
  语义仍按 ticket 留给 Issue 03。
- 2026-07-30：最终人工 QA 复核时，用户确认尺寸能即时同步，但指出当前没有自主
  活动，无法从宠物外观验证活动频率。该行为属于后续活动调度 ticket；Issue 02
  只交付频率状态、持久化和共享事件。因此人工契约经失败测试保护后改为验证尺寸
  即时生效、活动频率在重开偏好设置后保持选择、登录项与系统设置一致，不再要求
  观察未接入的自主活动或菜单项。
- 2026-07-30 18:10 CST：最终双轴 review 首轮发现 6 个阻塞项：偏好升级写回
  失败会中止启动、目录同步后的已提交状态会被错误回滚、登录项回滚错误被吞、
  菜单刷新错误被吞、焦点探针失败会残留进程，以及提前实现了 Issue 03 的多显示器
  安全区算法；另发现人工 QA 要求尚不可执行的“移动宠物”。逐项以失败测试复现后，
  分别改为安全内存启动、区分 durable／committed-with-warning、显式回滚与系统
  真值校正、菜单优先发布与穿透回滚、失败进程收拢，并移除多显示器算法；位置 QA
  改为使用本票已有的“召回宠物”。Standards 与 Spec 复审均确认
  `Blocking findings: 0`。
- 2026-07-30 20:23 CST：最终源码上 `pnpm verify` 通过；自动 smoke 11/11，
  连续输入焦点探针 175/100，系统登录项真值为关闭。用户在同一源码指纹
  `79d71141a13fb8742727cd95688a106e23d4d177c130561ece2531cbad74c51f`
  的真实 `.app` 中确认 10 项人工清单全部通过。未知版本恢复诊断
  `oh-my-pets-diagnostics-1785413806.md` 经只读检查，说明可理解且不包含偏好
  文件或 worktree 路径；应用持续运行到退出项并干净结束。

## Closeout Evidence

领取并完成后，用实际结果替换以下占位内容；`pending` 状态不得用于关闭。

### Verify

- Status: passed
- Command: `pnpm verify`
- Result: 2026-07-30 18:13 CST 在最终产品源码上通过；scope／architecture、
  49 个 Rust 测试、145 个 Web／工程测试、2 个 Chromium E2E、lint、WebView
  构建、release Tauri 构建与 closeout 扫描均通过。

### Manual QA

- Status: passed
- Command: `pnpm qa:desktop`
- Result: 最终 `pnpm qa:desktop:auto` 通过 11 项真实 Tauri smoke；启动焦点
  连续输入探针收到 175 次按键，高于 100 次门槛，前台 PID 始终未变，系统登录
  项真值为关闭。用户于 2026-07-30 20:23 CST 在同一最终源码指纹
  `79d71141a13fb8742727cd95688a106e23d4d177c130561ece2531cbad74c51f`
  的 `.app` 中确认 10 项人工清单全部通过；报告记录
  `appStayedRunningUntilExitCheck=true`、`appExitedCleanly=true`、
  `passed=true`。用户另导出的未知版本恢复诊断经只读检查，未包含偏好文件或
  worktree 路径。
- Reason:

### Review

- Standards: passed
- Spec: passed
- Notes: 最终双轴复审均为 `Blocking findings: 0`。首轮 6 个阻塞项与 1 个
  不可执行人工步骤已逐项以 TDD 修复；Standards 复审确认原子提交语义、登录项
  回滚、菜单优先发布、鼠标穿透回滚、焦点失败进程清理与可执行人工 QA 均关闭；
  Spec 复审确认写回失败不再阻断安全启动，且 Issue 03 的多显示器安全区算法已
  从本票移除。

### Commit

- Status: committed
- Hash: `60c4680485958513f53c2042259c10c39860ec74`

## Answer

Rust 统一产品状态、版本化原子偏好存储、真实 macOS 登录项、最终菜单集合与偏好
设置骨架已经实施；持久字段和会话字段按矩阵恢复，损坏、未知版本、非法值和写回
失败均能以可理解诊断安全运行。菜单与偏好设置共享 Rust 状态，鼠标穿透始终保留
菜单恢复路径，启动焦点握手及连续输入回归探针已固化。

本票按 Non-goals 只保存活动频率和新手提示状态；自主活动由 Issue 05 接入，
新手提示视觉流程由 Issue 07 接入，多显示器安全区和鼠标所在显示器召回由
Issue 03 接入。本轮未通过重启整个 Mac 验证登录后自动启动，但自动 smoke 已读取
macOS 登录项真实状态，人工 QA 已确认界面与系统设置一致。实现、最终 verify、
人工 QA 和双轴复审已完成；ticket 保持 `claimed`，等待 Ready Pull Request 在
最新 `integration/macos-preview-candidate` 上通过远端 required check。
