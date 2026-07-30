# 制作并集成正式“卷卷”宠物包

Type: task
Kind: feature
Status: open
Closeout-Contract: v1
Blocked by: none

## Question

如何由 Codex 直接产出一套具有明确原创身份、动作叙事和稳定锚点的正式“卷卷”
素材，替换当前单帧占位资源，并完整验证宠物包和 PixiJS 渲染链路？

## Scope

- 实施上下文必须先读取并使用 `hatch-pet` skill；需要生成或编辑位图时使用
  `imagegen`，并遵守两项 skill 的检查与来源记录要求。
- 先固定角色设定稿和动作模型：短腿、圆头、粗卷尾的橘白猫，深棕轮廓、青色
  项圈，安静好奇、偶尔笨拙；采用原创、少色块、无渐变的扁平 2D 卡通风格。
- 当前 `atlas.png` 只作构图参考，不逐像素复制，也不作为正式帧复用。
- 制作并集成全部 15 个动作，目标 86 帧，允许 80–96 帧：

| 动作         | 建议帧数 | 视觉要求                 |
| ------------ | -------: | ------------------------ |
| `intro`      |        8 | 入场落地后看向用户       |
| `idle`       |        6 | 眨眼与轻尾摆             |
| `walk_left`  |        6 | 左行步态清楚             |
| `walk_right` |        6 | 右行步态清楚             |
| `sleep`      |        6 | 趴下与呼吸               |
| `drag_hold`  |        2 | 被拎起的悬空姿态         |
| `fall`       |        3 | 下落方向可读             |
| `land`       |        4 | 挤压、回弹与灰尘         |
| `tap_react`  |        5 | 回头、抖耳或短暂炸毛     |
| `feed_react` |        8 | 嗅闻、扑住与抱住纸片     |
| `curious`    |        6 | 探头或抬爪               |
| `edge_play`  |        6 | 扒边或探头               |
| `quiet_idle` |        4 | 慢眨眼与低幅呼吸         |
| `rare_1`     |       10 | 把纸片扑成纸团后得意坐住 |
| `rare_2`     |       10 | 滑倒、挂边再偷看用户     |

- 统一全部帧的脚底基线、角色比例、色板、线宽、光向、透明边缘和动作朝向；
  不用重复单帧、整体平移或简单缩放冒充逐帧动画。
- 沿用 `320 x 320` 标准画布和单图集约束，生成正式图集、`atlas.json`、
  `pet.json`、`preview.png` 与来源／使用权说明。
- 校准 `hitbox`、`dropZone`、`bubbleAnchor` 和各动作 cue points。
- 更新宠物包 README，移除“单帧工程占位”描述并记录制作方法、来源、许可和已知
  限制。
- 为图集尺寸、帧引用、动作覆盖、帧数预算、锚点漂移和透明像素边界增加机械
  校验；为循环和非循环动作生成可审阅的接触表或录屏。
- 更新真实 Chromium 视觉基线和真实桌面 QA 项，人工审阅所有基线变化。

## Non-goals

- 不制作第二只宠物、第二套体型、换装、多配色、季节皮肤或第二视角体系。
- 不加入音频、口型、对白气泡、家具、配件或复杂组件图层。
- 不修改宠物包规范来迁就不合规素材，除非先建立独立规格变更票。
- 不从 `reference/` 复制第三方角色、帧、图集或受限 IP。
- 不把 AI 原始输出未经清理直接标记为正式资源。
- 不实现行为调度、窗口运动或用户宠物包导入。

## Completion Criteria

- 宠物包包含全部 15 个动作和 80–96 个有效独立帧，Rust 领域校验零 blocking
  error。
- 每个动作在动作接触表和实际 PixiJS 播放中都能辨认；两个招牌动作单独录成
  3–10 秒片段时，事件叙事无需文字也能看懂。
- 三档尺寸下耳尖、眼睛、尾巴和脚底动作可辨，角色轮廓不会被误认成狐狸、仓鼠
  或无物种团子。
- 循环动作无明显跳帧；非循环动作没有错误回弹；脚底基线、命中区和投喂区没有
  肉眼可见漂移。
- PNG/WebP 透明边缘无黑边、白边、脏像素或整帧多余透明画布；图集符合既有
  尺寸与总大小上限。
- 来源／使用权说明足以证明正式资产为项目原创或具有明确可用权，不依赖第三方
  授权 IP。
- 视觉基线只通过显式 `pnpm test:e2e:update` 更新并完成人工 diff 审阅。
- `pnpm qa:desktop` 在真实 `.app` 中人工检查三档尺寸、全部动作和透明窗口合成。
- 最后相关改动后 `pnpm verify` 通过，Standards + Spec 双轴 review 无阻塞项。
- 创建主要实施分支对应、指向 `integration/macos-preview-candidate` 的 Ready
  Pull Request，并在最新 integration 上通过 `macOS ARM64 最终验证`；只允许
  merge commit。

## Implementation Notes

- 本票允许美术制作过程中使用生成资产和临时接触表，但只有宠物包、预览图、
  来源说明、稳定测试基线和流程票据属于正式提交范围；`output/` 等生成物保持
  忽略。
- 如果某动作必须调整建议帧数，可在 80–96 总预算内调配，并在 Comments 记录
  原因；不得削弱 `rare_1` 或 `rare_2` 的可读叙事。
- 美术票可以与 `Issue 01`–`05` 并行；最终行为整合由 `Issue 07` 和 `Issue 08`
  验收。

## Comments

- 2026-07-30：用户明确把正式美术交给 Codex，并确认保留现有身份锚点、重新
  设计原创扁平 2D 风格。规划 Pull Request 合入 `main` 后，本票与
  `Issue 01` 构成首批可领取 frontier。
- 2026-07-30：按用户批准的新策略迁移到
  `integration/macos-preview-candidate`；治理迁移 Pull Request 合入后，本票
  仍属于首批 frontier，但本轮优先领取 `Issue 01`。
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
