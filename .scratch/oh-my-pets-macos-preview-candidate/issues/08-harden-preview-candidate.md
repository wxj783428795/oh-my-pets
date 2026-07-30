# 达成预览候选版性能、稳定性与整体验收门槛

Type: task
Kind: feature
Status: open
Closeout-Contract: v1
Blocked by: 04, 05, 06, 07

## Question

如何在不扩张到正式发布的前提下，为完整桌宠建立可复核的性能和稳定性测量，
修复阻塞候选版的问题，并用真实 `.app` 证明整套陪伴体验达到封板门槛？

## Scope

- 建立可重复的候选版测量入口和报告格式，至少记录机器型号／芯片、macOS 版本、
  构建类型、应用提交、采样命令、采样周期和实际结果。
- 测量并验证：
  - 冷启动到宠物可见不超过 5 秒
  - 首次引导在 15 秒内完成
  - 点击、拖拽和菜单操作的可见反馈不超过 100 ms
  - 静置 5 分钟平均 CPU 不超过 3%
  - 活动动画期间平均 CPU 不超过 15%
  - 常驻内存不超过 250 MiB
  - 连续运行 4 小时后内存增长不超过 50 MiB
- 测量工具必须确认目标 PID／应用身份，避免把 Vite、测试浏览器或其他同名进程
  算入结果；超标必须使候选版验收失败。
- 针对实际瓶颈做范围内优化，例如无动作时降低无用渲染、合并窗口位置更新、
  清理定时器／纹理／监听器和限制诊断缓存；每项优化先有可重复失败证据。
- 扩展桌面自动 smoke，覆盖启动窗口拓扑、宠物包加载、菜单隐藏／恢复、穿透
  开关、召回、偏好同步和关键行为命令。
- 扩展 `pnpm qa:desktop` 交互式清单，覆盖正式卷卷、15 个动作抽查、点击、
  拖拽、抛掷、投喂、安静、全屏、Space、多显示器／模拟恢复、持久化、首次
  引导和菜单救援。
- 执行并记录 4 小时常驻；期间覆盖锁屏唤醒、睡眠恢复、Space／全屏切换和可用
  的显示器变化，确认无崩溃、卡死、持续高占用或无法召回。
- 汇总候选版已知限制和实际验证环境，更新交付就绪与桌面恢复文档。
- 完成全规格 Standards + Spec 最终 review，修复所有阻塞发现。

## Non-goals

- 本票不是替代前七张票人工 QA 的独立“验收票”；前票未完成自己的验证时，本票
  仍被阻塞。
- 不加入签名、公证、DMG、自动更新、崩溃上报、云遥测或外部测试分发。
- 不宣称未实际测量的 Intel Mac、Windows 或 macOS 版本兼容。
- 不通过放宽阈值、缩短采样时间、只测开发空闲窗口或关闭核心动作获得绿色。
- 不为了单纯降低 LOC／复杂度数字进行无关重构。
- 不在性能门槛失败时未经独立决策直接替换 PixiJS 渲染架构。

## Completion Criteria

- 候选版测量入口生成结构化、可复核报告，并机械拒绝缺少环境、提交、PID、周期
  或任一指标的“通过”记录。
- 实际 Apple Silicon macOS release/QA `.app` 达到全部启动、延迟、CPU、内存
  和四小时增长阈值；原始摘要和结论写入票据或正式文档。
- 四小时 soak 中完成可执行的锁屏、睡眠、Space、全屏和显示器变化场景；硬件
  不具备的场景必须用自动模拟证据加明确限制说明，不能伪造人工通过。
- 桌面自动 smoke 通过，真实交互式 QA 的全部必填项由验收人确认并生成报告。
- 正式“卷卷”在三档尺寸、完整行为、透明合成和长时间运行中无阻塞性视觉问题。
- 应用始终不抢当前应用焦点，菜单栏在状态项可见条件下可恢复隐藏、穿透或越界
  宠物。
- 最后相关改动后 `pnpm verify`、`pnpm qa:desktop:auto`、
  `pnpm qa:desktop` 与本票单票 closeout 全部通过。
- Standards review 与 Spec review 均覆盖完整候选版规格且阻塞发现为零。
- 使用中文提交形成可追溯实现记录；所有前置票保持各自真实 closeout 证据。
- 创建主要实施分支对应、指向 `main` 的 Ready Pull Request，并在最新
  `main` 上通过 `macOS ARM64 最终验证`；只允许 merge commit。

## Implementation Notes

- 四小时 soak 不应进入普通 `pnpm verify`，但应有明确的手动／候选版命令和
  报告，不允许靠口头描述代替。
- 性能测量使用 release 或 QA `.app`；开发服务器和调试构建只能用于定位问题，
  不能作为最终阈值证据。
- 若优化后仍无法满足 WebView/PixiJS 资源门槛，记录客观数据并建立独立架构决策
  票；本票保持 `claimed`。

## Comments

- 2026-07-30：用户确认启动、延迟、CPU、内存、四小时常驻和真实 `.app` QA
  门槛。本阶段只对实际记录的 Apple Silicon macOS 环境作出候选版结论。

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
