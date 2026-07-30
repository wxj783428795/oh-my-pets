# 实现原生窗口运动与多显示器安全区

Type: task
Kind: feature
Status: open
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
- 创建主要实施分支对应、指向 `main` 的 Ready Pull Request，并在最新
  `main` 上通过 `macOS ARM64 最终验证`；只允许 merge commit。

## Implementation Notes

- 运动积分、碰撞和显示器选择逻辑应保持可注入时钟／显示器快照，AppKit 调用只
  位于平台适配层。
- 坐标转换必须明确逻辑点与物理像素，不能依赖主屏位于 `(0, 0)`。
- 不以提高固定窗口尺寸掩盖位置和边界错误。

## Comments

- 2026-07-30：用户确认单宠物、多显示器不自主跨屏、拖动切换当前屏、召回到
  鼠标所在屏，以及显示器变化后的安全恢复规则。

## Closeout Evidence

领取并完成后，用实际结果替换以下占位内容；`pending` 状态不得用于关闭。

### Verify

- Status: pending
- Command: `pnpm verify`
- Result: pending

### Manual QA

- Status: pending
- Command: `pnpm qa:desktop`
- Result: pending
- Reason:

### Review

- Standards: pending
- Spec: pending
- Notes: pending

### Commit

- Status: pending
- Hash: pending

## Answer

待实施。
