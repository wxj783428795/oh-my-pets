# 实现自主陪伴循环与环境降频

Type: task
Kind: feature
Status: open
Closeout-Contract: v1
Blocked by: 04

## Question

如何用 Rust 行为引擎把 15 个语义动作组织成长期可预测、短期有惊喜且不打扰的
陪伴循环，并正确处理活动频率、安静、全屏、锁屏、休眠和用户交互优先级？

## Scope

- 建立 Rust 拥有的行为状态机、调度器、可注入时钟和固定随机源。
- 让以下 15 个动作都有真实可达路径：
  `intro`、`idle`、`walk_left`、`walk_right`、`sleep`、`drag_hold`、`fall`、
  `land`、`tap_react`、`feed_react`、`curious`、`edge_play`、`quiet_idle`、
  `rare_1`、`rare_2`。
- 非首次启动后 60 秒内安排一次明显动作；标准频率下普通趣味动作目标间隔
  3–8 分钟，稀有动作最多每 15–30 分钟一次。
- 实现低／标准／高三级活动频率，保证由低到高的严格关系，并把具体参数集中在
  可测试配置中。
- 完成 `idle`、自主行走、睡眠、鼠标好奇、屏幕边缘玩法和两个招牌稀有动作的
  触发与结束规则。
- 普通自主行为限定在当前显示器边缘；允许招牌动作进入中央最多 3 秒，随后回到
  安全区域。
- 用户主动点击、拖拽和投喂优先；拖拽期间不得被定时器或系统状态抢占。
- 实现会话安静模式：回到安全角落，只允许 `quiet_idle`／`sleep`，保留拖动
  定位，不响应点击或投喂。
- 实现全屏自动降频：宠物仍可见，暂停自主移动、边缘玩法和稀有动作，保留轻量
  状态与用户主动互动；退出全屏后恢复保存的活动频率。
- 锁屏／休眠时暂停计时，恢复后不补播错过动作。
- 为所有状态转换、优先级、定时边界、随机边界、过期回调和系统生命周期补
  Rust 测试；为 PixiJS 语义事件播放补前端契约测试。

## Non-goals

- 不读取前台应用名称、窗口内容、摄像头、麦克风或会议状态。
- 不加入饥饿、心情、好感、离线惩罚、任务、提醒或专注统计。
- 不提供逐动作开关、用户可编辑概率或物理参数。
- 不加入声音、通知、对白气泡或读取文件内容后的行为。
- 不要求人工 QA 真实等待 15–30 分钟；长周期由可控时钟验证。
- 不自主跨越显示器。

## Completion Criteria

- 确定性测试能从稳定入口触发并观察全部 15 个动作，任何动作都不依赖统一
  `idle` 回退伪造完成。
- 固定种子下状态序列可复现；不同合法种子仍满足时间、冷却、位置和优先级不变量。
- 低／标准／高活动频率的相对关系、标准时间范围和稀有动作冷却均有边界测试。
- 点击、拖拽或投喂打断自主动作后，状态机不残留旧计时器、旧速度或过期完成
  回调。
- 安静模式、全屏降频、锁屏和休眠转换不会改写持久活动频率；重启后会话覆盖
  全部清除。
- 行为引擎只向渲染器发送语义动作和必要位置意图，不进行逐帧 IPC。
- `pnpm qa:desktop` 使用开发加速 seam 人工抽查全部动作，并以真实时间观察至少
  一次正常自主行为；加速 seam 不得在普通用户界面暴露。
- 最后相关改动后 `pnpm verify` 通过，Standards + Spec 双轴 review 无阻塞项。
- 创建主要实施分支对应、指向 `integration/macos-preview-candidate` 的 Ready
  Pull Request，并在最新 integration 上通过 `macOS ARM64 最终验证`；只允许
  merge commit。

## Implementation Notes

- 调度器、状态转换、运动意图和平台环境信号应拆成明确模块，避免把全部逻辑塞入
  `src-tauri/src/lib.rs`。
- 使用单调时钟；系统时间跳变不应制造动作风暴。
- 全屏降频是自动、非持久覆盖；安静模式是用户、会话级覆盖，两者必须保留可区分
  的状态语义。

## Comments

- 2026-07-30：用户确认“持久活动频率 + 会话安静模式 + 自动全屏降频”三层状态，
  并确认 15 个动作全部作为硬验收项。
- 2026-07-30：按用户批准的新策略迁移到
  `integration/macos-preview-candidate`；本票等待 `Issue 04` 的 Pull Request
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
