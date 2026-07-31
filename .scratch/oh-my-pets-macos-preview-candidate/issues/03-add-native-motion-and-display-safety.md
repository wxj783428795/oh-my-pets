# 实现原生窗口运动与多显示器安全区

Type: task
Kind: feature
Status: claimed
Closeout-Contract: v1
Blocked by: 02

## Question

如何让一个紧凑的原生宠物窗口随逻辑宠物位置平滑移动，并在多显示器、Space、
分辨率和排列变化中始终保持可见，而不使用全屏透明覆盖层？

## Scope

- 在 Rust 中建立平台无关的宠物位置、速度、碰撞、安全区域和当前显示器模型。
- 在 macOS 平台适配层读取显示器可用区域、缩放、鼠标所在显示器和布局变化。
- 用稳定的小型 `pet` 窗口承载全部动作外廓；逻辑位置变化时更新原生窗口位置，
  PixiJS 只渲染窗口内部精灵。
- 实现当前显示器规则：自主移动不跨屏；用户或系统明确把宠物移动到另一显示器
  后更新当前显示器。
- 完成“召回宠物”：把宠物移到鼠标所在显示器的安全角落并显示。
- 在显示器断开、分辨率／缩放／排列变化后，把宠物恢复到最近可用安全区域。
- 持久化最后有效位置；启动时只有位置仍有效才恢复，否则使用安全角落。
- 为负坐标、不同缩放、上下排列、显示器断开、可用区变化和越界位置补确定性
  Rust 测试。
- 增加可控的位置更新 seam 和桌面 smoke，验证真实原生窗口确实移动而不是只在
  Canvas 内移动精灵。

## Non-goals

- 不创建全屏透明窗口或每块显示器一个宠物窗口。
- 不让自主行为跨显示器，不制作跨显示器跳跃动画。
- 不实现点击命中、拖拽抛掷或文件投喂；这些由 `Issue 04` 使用本票运动 seam。
- 不实现随机行为调度、鼠标好奇或稀有动作；这些由 `Issue 05` 完成。
- 不承诺绕过 macOS 受保护全屏表面。

## Completion Criteria

- 原生窗口位置由 Rust 运动／安全区模型控制；前端不存在独立桌面坐标事实来源。
- 在单屏和至少一种双屏排列中，“召回宠物”会选择鼠标所在显示器并落在有效
  安全角落。
- 模拟显示器断开、缩放变化和非法持久位置后，宠物仍完全可见且状态可以继续
  保存。
- 普通位置更新不抢焦点、不激活当前应用，也不生成第二个宠物实例。
- 自动测试覆盖所有边界坐标和显示器生命周期；真实桌面 smoke 观察到窗口坐标
  改变。
- `pnpm qa:desktop` 人工验证 Space、全屏、双显示器召回和布局变化恢复；只有
  一块显示器时，应记录可执行的模拟证据与单屏人工结果，不能伪造双屏人工通过。
- 最后相关改动后 `pnpm verify` 通过，Standards + Spec 双轴 review 无阻塞项。
- 创建主要实施分支对应、指向 `integration/macos-preview-candidate` 的 Ready
  Pull Request，并在最新 integration 上通过 `macOS ARM64 最终验证`；只允许
  merge commit。

## Implementation Notes

- 运动积分、碰撞和显示器选择逻辑应保持可注入时钟／显示器快照，AppKit 调用只
  位于平台适配层。
- 坐标转换必须明确逻辑点与物理像素，不能依赖主屏位于 `(0, 0)`。
- 不以提高固定窗口尺寸掩盖位置和边界错误。

## Comments

- 2026-07-30：用户确认单宠物、多显示器不自主跨屏、拖动切换当前屏、召回到
  鼠标所在屏，以及显示器变化后的安全恢复规则。
- 2026-07-30 21:52 CST：领取本票。实施分支为
  `codex/macos-preview-candidate-03-display-motion`，base 为
  `integration/macos-preview-candidate`，base commit 为
  `a1d28f83227ed52959d6a69d33a6e5d47f530cbc`，Pull Request target 为
  `integration/macos-preview-candidate`。Issue 02 已通过 Pull Request #10
  合入该 base，依赖已解除。
- 2026-07-30：用户批准 Issue 03 与无前置依赖的 Issue 06 并行实施；两票使用
  独立 worktree、独立 topic 分支和独立 Pull Request，不互相合并兄弟分支。
- 2026-07-30：按已获用户批准的 ticket/spec 确认本票 TDD 公共 seams：
  平台无关的运动／碰撞／安全区域公共模型；以显示器快照为输入的位置恢复与
  当前显示器选择边界；产品状态的最后有效位置读写边界；macOS 显示器／鼠标
  快照与原生窗口定位适配边界；菜单召回及可控位置更新命令／事件；真实桌面
  smoke 观察到的原生窗口坐标变化。测试只通过这些公共边界验证行为，不绑定
  私有实现。
- 2026-07-30：TDD 红绿证据：新增显示模型时先观察到模块缺失、非法保存位置、
  逻辑速度、碰撞、断屏恢复、外部移屏、召回、非法缩放／重复标识和非有限速度
  等测试逐项失败，再以最小模型实现转绿；桌面 smoke 先因缺少
  `native_window_motion_and_display_recall` 失败，再观察到真实窗口坐标变化。
- 2026-07-30：首轮 Standards + Spec 双轴审查发现显示器 ID 错误绑定分辨率／
  缩放、控制器丢弃碰撞后速度、前台 PID 采样未覆盖位置更新，以及安全边界计算
  重复。新增失败测试后已改为稳定运行时 ID、返回完整 `MotionStep`、至少 10 次
  PID 采样覆盖原生移动，并抽取统一 `SafeBounds`；等待复审与最终验证。
- 2026-07-31：最终 Standards + Spec 双轴复审无阻塞发现；Standards 仅保留
  `lib.rs` 三处事件结果发布分支重复的非阻塞判断，本票不再扩大重构。验证前台
  探针寿命从 3.5 秒延长至 8 秒以覆盖原生移动，真实 Clippy 夹具单测 timeout
  调整为 15 秒以消除全套并发下约 6 秒的门禁抖动，未放宽任何断言。
- 2026-07-31：最终 `pnpm verify` 通过；scope／architecture、27 个 Rust 单元、
  147 个 Web／工程测试、2 个 Chromium E2E、lint、WebView 与真实 Tauri release
  构建及 closeout 扫描均通过。真实自动 smoke 通过 12 项，原生窗口从
  `(2276, 1110)` 移动到 `(2196, 1110)` 后召回，未聚焦且仅一个 `pet` 实例；焦点
  探针 10/10 次 PID 保持不变，连续输入 169/100。
- 2026-07-31：人工 QA 首次重启项因我为显示缩放实测打开系统设置，导致重启前后
  前台基准改变而被脚本诚实拒绝；关闭系统设置后重新运行，13/13 项通过，应用在
  计划重启和退出前持续运行并干净结束。当前只有 1 块物理显示器，已实际完成
  `1470×956 → 1710×1112 → 1470×956` 缩放实测并截图确认宠物全程可见；双屏、
  断屏、负坐标、上下排列和混合缩放以确定性 Rust 模拟证据覆盖，未伪记双屏人工
  通过。
- 2026-07-30：按用户批准的新策略迁移到
  `integration/macos-preview-candidate`；本票等待 `Issue 02` 的 Pull Request
  合入 integration 并完成 closeout 后再领取。
- 2026-07-30：历史迁移例外：planning 资产已在新生命周期规则生效前通过 Pull
  Request #4 进入 `main`，因此不伪造 planning bootstrap。例外仅校正本专题
  交付路由，不改写 `main`；风险是流程资产曾表达错误 target。补救为从
  `main@6f06cc7` 建立受保护 integration、治理 PR 完整门禁、逐票 closeout 和
  最终全规格 review。

## Closeout Evidence

领取并完成后，用实际结果替换以下占位内容；`pending` 状态不得用于关闭。

### Verify

- Status: passed
- Command: `pnpm verify`
- Result: 2026-07-31 CST：scope／architecture 检查通过（48 个模块、9604 LOC、无循环依赖）；27 个 Rust 单元测试、147 个 Web／工程测试、2 个 Chromium E2E、lint、WebView 构建、真实 Tauri release 构建及 closeout 扫描全部通过。architecture 真实夹具在全套并发下曾稳定约 6 秒，timeout 调整为 15 秒以消除门禁抖动，未放宽断言。

### Manual QA

- Status: passed
- Command: `pnpm qa:desktop`
- Result: 2026-07-31 CST：最终人工 QA 报告
  `target/desktop-smoke/manual-qa.json` 为 `passed: true`，13/13 项通过；应用在计划重启和退出前持续运行并干净结束。自动 smoke 报告
  `target/desktop-smoke/report.json` 记录原生窗口从 `(2276, 1110)` 移动到
  `(2196, 1110)` 后召回，未聚焦且仅一个 `pet` 实例；焦点探针 10/10 次 PID
  保持不变，连续输入 169/100。当前仅 1 块物理显示器，已实际完成
  `1470×956 → 1710×1112 → 1470×956` 缩放实测并截图确认宠物全程可见；双屏、
  断屏、负坐标、上下排列和混合缩放由确定性 Rust 模拟覆盖，未伪记双屏人工通过。
- Reason: 首次人工 QA 因显示缩放实测期间系统设置改变重启前台基准而被脚本拒绝；关闭系统设置后重新运行并通过，失败尝试未计入通过证据。

### Review

- Standards: passed
- Spec: passed
- Notes: 2026-07-31 CST：最终 Standards + Spec 双轴复审无阻塞发现。Standards 仅记录
  `lib.rs` 三处事件结果发布分支重复的非阻塞判断，本票不扩大重构；TDD 红绿证据、
  首轮四项阻塞修复及最终验证均已记录在本票 Comments。

### Commit

- Status: committed
- Hash: `4684c26f80779c3daea405b864b4529112bce3f5`

## Answer

已完成原生宠物窗口的运动积分、边界反弹、显示器选择与断屏／缩放恢复；召回会将
宠物放到鼠标所在显示器的安全角落，位置更新不抢焦点且不创建第二实例。自动与人工
桌面证据、双轴 review 和最终 `pnpm verify` 均已通过。双屏人工操作受当前设备只有
一块物理显示器限制，已由确定性模拟覆盖并如实记录；拖拽抛掷与随机行为仍分别属于
Issue 04、Issue 05。本票待创建指向 `integration/macos-preview-candidate` 的 Ready
Pull Request 并通过最新 integration 的 `macOS ARM64 最终验证` 后关闭。
