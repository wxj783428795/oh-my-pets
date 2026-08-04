# 实现点击、拖拽、抛掷和文件投喂

Type: task
Kind: feature
Status: claimed
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

- 2026-08-04：实现提交 `1fe53236734ec930883cdf0107935016199ffac1` 已推送。
  因误解用户关于 Issue 03 的指令，曾误建指向
  `integration/macos-preview-candidate` 的 Draft Pull Request #13；确认后已立即
  关闭，未合并且未删除本票分支或实现提交。Issue 06 / PR #11 仍为 `claimed` 且
  存在未提交的正式动画修复；本票三项可见反馈人工检查仍未通过，不在该依赖合入
  和补验前另建 Ready Pull Request 或合并。
- 2026-08-03：焦点缺陷已按实机证据修复。根因是 Accessory 应用中的普通
  `NSWindow` 会在物理点击时清除其他应用的 first responder；永久 Prohibited
  虽保住输入焦点，却使用户先操作其他应用后宠物收不到首次点击／拖拽。最终把
  同一个 Tauri 宠物窗口转换为不可成为 key/main 的非激活 `NSPanel`，偏好设置
  保持普通窗口。用户在唯一 QA 构建中确认 `asd → 点击宠物 → def` 的 `def` 正常
  出现，且随后仍可拖动宠物。当前人工阻塞只剩单帧占位资源无法区分三类动作反馈。
- 2026-08-03：自动焦点证据进一步硬化为两个互不重叠的真实 Tauri 进程。第一
  进程在 AppKit 探针完成前若退出或报错会立即失败；取证完成后必须等待其实际
  退出，才启动第二进程执行会显式聚焦偏好窗口的产品 smoke，避免把不同进程的
  成功片段拼成假通过。
- 2026-08-02：真实人工 QA 完成 17 项中的 14 项。用户确认原生拖拽、释放下落、
  再次拖拽、菜单召回、文件无副作用、界面路径隐私、安静模式拖动和退出均可用；
  但物理点击宠物后原应用输入焦点消失，违反本票焦点关闭条件。点击、拖拽／落地
  和投喂的语义通路虽经自动 smoke 通过，当前内置卷卷仍为 15 个动作复用 1 张
  `placeholder` 帧，导致 `tap_react`、`fall`、`land`、`feed_react` 与 `curious`
  肉眼不可区分，三项可见反馈人工检查失败。Issue 4 保持 `claimed`；焦点缺陷需在
  本票修复，可辨识动作关闭证据需等待 Issue 06 正式内容进入目标分支或由用户明确
  调整交付顺序。
- 2026-07-30：用户确认稳定最小窗口、应用级热区、整窗穿透开关和文件投喂隐私
  边界；候选版不以局部穿透为关闭条件。
- 2026-07-31 23:02 CST：领取本票。实施分支为
  `codex/macos-preview-candidate-04-direct-interactions`，base 为
  `integration/macos-preview-candidate`，base commit 为
  `c1376b85c42701059707840e20f0d62ba5d8665f`，Pull Request target 为
  `integration/macos-preview-candidate`。Issue 03 已通过 Pull Request #12
  合入该 base，依赖已解除；Issue 06 在独立 worktree 和独立 topic 分支并行，
  两票不互相合并兄弟分支。
- 2026-07-31：用户确认本票 TDD 公共 seams：Rust 交互仲裁；宠物包热区与输入
  坐标转换；拖拽及释放速度采样；复用原生运动边界的抛掷、碰撞与落地控制器；
  Tauri 输入／拖放命令和语义事件；真实桌面 smoke。测试只通过这些公共接口观察
  行为，不绑定私有实现。
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

- Status: passed
- Command: `pnpm verify`
- Result: 2026-08-03 CST：范围与架构检查、79 个 Rust 测试、160 个 Web／工程
  测试、2 个 Chromium E2E、lint、WebView 构建、真实 Tauri release 构建和
  closeout 扫描全部通过。最新 `pnpm qa:desktop:auto` 13/13 项通过；真实
  `NSPanel` 契约通过，点击首帧 2 ms，独立 AppKit 输入探针收到 100/100 次按键，
  first responder 全程保持且 10/10 次前台 PID 采样不变。

### Manual QA

- Status: failed
- Command: `pnpm qa:desktop`
- Result: 2026-08-02 CST：`target/desktop-smoke/manual-qa.json` 记录 14/17 项
  通过，应用在退出检查前持续运行并干净退出。单屏召回、分辨率／缩放变化、菜单
  恢复、偏好持久化与损坏恢复、物理点击穿透、安静模式和退出均通过；未伪记双屏
  人工覆盖。
- Reason: 焦点缺陷已由 2026-08-03 的唯一 QA 构建补充实测关闭；当前单帧占位
  宠物包仍使点击、拖拽／落地和文件投喂没有可辨识的动作差异。用户同时确认拖拽
  与释放下落实际发生、落地后仍可再次拖动和召回，投喂文件内容／位置不变且界面
  不显示路径。

### Review

- Standards: passed
- Spec: blocked
- Notes: 2026-08-03 按固定 base `c1376b85c42701059707840e20f0d62ba5d8665f`
  重跑双轴复核。Standards 首轮发现独立焦点探针未拒绝目标进程提前退出；TDD
  修复后复核为 no findings。直接互动 smoke 与生产编排重复、`PetWindow.vue`
  职责集中及原生面板宏的主线程约束记录为非阻塞维护风险。Spec 未发现新增代码级
  偏差，但仍被单帧内容导致的 3 项人工可见反馈失败、未完成提交／PR／远端门禁
  阻塞；双屏与混合缩放实机覆盖仍是残余风险。

### Commit

- Status: committed
- Hash: `1fe53236734ec930883cdf0107935016199ffac1`

## Answer

直接互动、原生抛掷与无副作用投喂的语义和系统通路已实现，物理点击保焦点且仍可
拖动的缺陷已经实机关闭；单帧占位内容仍无法提供独立可见反馈，本票暂不关闭。
