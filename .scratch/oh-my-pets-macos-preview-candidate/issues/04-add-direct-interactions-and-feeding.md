# 实现点击、拖拽、抛掷和文件投喂

Type: task
Kind: feature
Status: open
Closeout-Contract: v1
Blocked by: 03

## Question

如何在紧凑原生窗口和现有宠物包热区上实现低延迟直接互动，同时保证抛掷物理
不会让宠物丢失、整窗鼠标穿透可恢复、文件投喂严格无副作用？

## Scope

- 根据宠物包 `hitbox` 解释点击和抓取，根据 `dropZone` 解释文件拖放。
- 点击有效命中后触发 `tap_react`，动作结束回到合适的稳定状态。
- 抓取进入 `drag_hold`；拖动宠物时原生窗口跟随指针并可切换当前显示器。
- 释放时采样有限速度，执行 `fall -> land -> idle`；重力、碰撞、反弹和速度
  上限由 Rust 拥有，任何路径最终回到可见安全区。
- 有效单个本地普通文件只触发 `feed_react`；文件夹、多个文件或非普通文件只
  触发一次短暂 `curious`。
- 保证文件不被读取、复制、移动、删除、修改或上传；路径、文件名、大小、哈希
  和预览不得进入持久状态、日志、诊断或遥测。
- 整窗鼠标穿透开启后禁用点击、宠物拖拽和文件拖放；菜单栏关闭后立即恢复。
- 安静模式下允许拖动重新定位，但点击和投喂不触发趣味动作。
- 建立统一的用户动作仲裁，避免点击、拖拽、投喂和过期动画回调互相覆盖。
- 为坐标缩放、热区边界、快速拖拽、零速度释放、跨屏拖拽、撞边、穿透切换、
  安静模式和文件隐私补测试。

## Non-goals

- 不实现逐像素 Alpha 命中或窗口透明区域局部穿透。
- 不在开启整窗鼠标穿透时尝试保留系统文件拖放。
- 不读取文件内容来生成定制动作，不显示文件名，不产生饱腹或好感度。
- 不接收文件夹、多个文件、远程 URL 或剪贴板内容作为投喂。
- 不实现完整自主调度；`Issue 05` 负责把直接互动与自主状态机整合。
- 不加入音效、触觉、系统通知或权限监控。

## Completion Criteria

- 点击、拖拽、抛掷、落地和投喂各有独立可见反馈，并通过确定性动作测试。
- 快速向任意方向释放、屏幕边缘碰撞和跨显示器拖动后，宠物不会永久离开可见
  区域，也不会产生第二个窗口。
- 开启鼠标穿透后所有直接输入均停止；菜单栏关闭穿透后立即恢复，重启后默认
  关闭。
- 测试使用带唯一敏感标记的临时路径，证明设置、日志和诊断摘要中不存在路径、
  文件名或衍生内容。
- 多文件和文件夹不触发 `feed_react`，只播放一次 `curious` 且不弹错误。
- 交互过程中用户当前应用保持焦点；宠物可见反馈满足候选版 100 ms 目标的可测
  seam。
- `pnpm qa:desktop` 在真实 `.app` 中人工验证四类直接互动、穿透恢复、安静
  模式下的限制和投喂无副作用。
- 最后相关改动后 `pnpm verify` 通过，Standards + Spec 双轴 review 无阻塞项。
- 创建主要实施分支对应、指向 `integration/macos-preview-candidate` 的 Ready
  Pull Request，并在最新 integration 上通过 `macOS ARM64 最终验证`；只允许
  merge commit。

## Implementation Notes

- 原生拖放事件会短暂携带路径；边界要求是最小化瞬时使用并阻止任何二次保存或
  输出，不能虚假声称系统从未向进程提供路径。
- 输入坐标转换应复用宠物画布、尺寸档位和窗口缩放的单一模型。
- 物理参数集中在 Rust 内部，不暴露为用户设置；测试使用可控时钟而非真实等待。

## Comments

- 2026-07-30：用户确认稳定最小窗口、应用级热区、整窗穿透开关和文件投喂隐私
  边界；候选版不以局部穿透为关闭条件。
- 2026-07-30：按用户批准的新策略迁移到
  `integration/macos-preview-candidate`；本票等待 `Issue 03` 的 Pull Request
  合入 integration 并完成 closeout 后再领取。
- 2026-07-30：历史迁移例外：planning 资产已在新生命周期规则生效前通过 Pull
  Request #4 进入 `main`，因此不伪造 planning bootstrap。例外仅校正本专题
  交付路由，不改写 `main`；风险是流程资产曾表达错误 target。补救为从
  `main@6f06cc7` 建立受保护 integration、治理 PR 完整门禁、逐票 closeout 和
  最终全规格 review。

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
