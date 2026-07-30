# 制作并集成正式“卷卷”宠物包

Type: task
Kind: feature
Status: resolved
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

- 2026-07-30 22:05:52 +0800：已在独立顶层 Codex worktree
  `/Users/xiaojie.wu/.codex/worktrees/f3d2/oh-my-pets` 领取。本票实施分支为
  `codex/macos-preview-candidate-06-production-juanjuan`，base 与 Pull Request
  target 均为 `integration/macos-preview-candidate`，完整 base commit 为
  `a1d28f83227ed52959d6a69d33a6e5d47f530cbc`。已 fetch 并确认该提交等于领取时
  最新 `origin/integration/macos-preview-candidate`，且包含 Issue 01、Issue 02
  的已合入事实。
- 本票与 Issue 03 在两个独立顶层 Codex worktree 会话并行；禁止读取或修改
  `/Users/xiaojie.wu/.codex/worktrees/b466/oh-my-pets` 中的未提交文件，禁止从
  `codex/macos-preview-candidate-03-display-motion` 派生、合并或拣选提交，
  两票只能分别通过各自 Pull Request 进入
  `integration/macos-preview-candidate`。
- 开工前确认本票只在以下公共 seam 验证，不测试私有实现细节：
  1. Rust 领域公开入口 `load_pet_pack(pack_dir, app_version)`，验证正式包能够
     加载且通过既有格式、动作、引用、尺寸和安全边界；
  2. 根目录公开命令 `pnpm pet:assets:check`，验证 accepted spec 独有的
     15 动作、80–96 独立帧、320×320 标准画布、图集像素、透明边界、脚底
     基线／锚点漂移和禁止伪动画约束；
  3. `PetRenderer.mount()` / `PetRenderer.play()`，验证 PixiJS 真实消费裁剪帧、
     offset、逐帧时长与循环／非循环动作；
  4. `pnpm test:e2e` 的真实 Chromium Canvas 截图 seam，验证内置正式包首帧
     经过真实 PixiJS WebGL 渲染后的稳定像素；
  5. `pnpm qa:desktop:auto` 与交互式 `pnpm qa:desktop`，验证真实 Tauri
     `.app` 中三档尺寸、15 动作与透明窗口合成。以上 seams 已由 accepted spec
     与本票验收契约预先确认，新增机械校验按 TDD red→green 小切片推进。
- `hatch-pet` Codex v2 的固定 `8×11`、`192×208`、9 个标准状态和
  `spriteVersionNumber: 2` 与本仓库 accepted `320×320` 标准画布、15 个语义
  动作、单图集声明式包冲突，因此不运行其固定包装器，也不修改项目宠物包规范。
  本票迁用该 skill 的角色身份锁定、`imagegen` 位图生成、平坦色键与透明边缘
  处理、逐动作行生成、确定性裁切／组装、来源记录、逐帧与动作方向检查、
  接触表／动效预览以及独立视觉 QA 方法；项目清单与领域校验仍为最终事实源。
- 为命中用户指定的目标 `86` 帧，同时完整保留两个 10 帧招牌动作，本票把建议
  预算中的 `sleep` 从 6 调整为 5、`feed_react` 从 8 调整为 7、
  `curious` 与 `edge_play` 各从 6 调整为 5；其余动作保持建议帧数。最终预算为
  `8+6+6+6+5+2+3+4+5+7+5+5+4+10+10=86`，不削弱
  `rare_1`、`rare_2` 的叙事。
- 2026-07-30 至 2026-07-31：首次真实桌面视觉验收中，用户明确指出透明窗口
  应继续保持 `320×320`，但卷卷本体相对窗口过小且卷尾不完整，并要求修正后由
  Computer Use 继续验证。本票据此采用用户批准的 ticket 级视觉覆盖：不修改
  accepted spec 或宠物包格式，不改变窗口和标准画布，只把待机主体中位高度从
  约 `205px` 提高到 `235px`，中号 CSS 比例从 `0.86` 提高到 `0.92`，并重新
  生成完整露出卷尾的待机姿态。因此最终中号可见高度高于 spec 中早期
  `128–144px` 目标；这是针对用户实机反馈的显式覆盖，不推广为全局规范变更。
- 2026-07-31：Computer Use 先以完整路径启动本 worktree 的真实
  `Oh My Pets.app`，确认 `surface=pet` 后，再在同一正式前端与同一正式宠物包
  的 Chromium 高级预览中逐一点击 15 个动作。每个动作均更新为对应语义 ID，
  后续 14 张 UI 截图哈希互不相同；小／大／中三档依次切换且单选状态即时同步，
  “重新加载内置卷卷”和“打开开发预览”均成功。最后由 Computer Use 点击真实
  `.app` 的 `Quit Oh My Pets`，进程干净结束。macOS 自定义状态栏项未暴露给
  Computer Use 的 AX 树，托盘、透明合成、点击穿透与偏好恢复仍以本次通过的
  `pnpm qa:desktop:auto`、前轮用户确认和交互式 `pnpm qa:desktop` 报告为据，
  未把该工具盲区伪记为 Computer Use 直接点击。
- 2026-07-31：Codex 重启后按用户要求再次用 Computer Use 验证。重新从
  f3d2 worktree 的完整 `.app` 路径启动真实宠物窗口，确认正式包元数据为
  `juanjuan-cat@1.0.0`、15 个动作、86 帧、`320×320`，并逐项读回
  `intro`、`idle`、`walk_left`、`walk_right`、`sleep`、`drag_hold`、
  `fall`、`land`、`tap_react`、`feed_react`、`curious`、`edge_play`、
  `quiet_idle`、`rare_1`、`rare_2` 的语义状态；重新加载正式卷卷后返回
  “共 15 个动作”。该轮 Computer Use 的 Chromium Canvas 截图滞后于 AX
  文本，因此只把语义状态作为功能证据，视觉仍以 Chromium 基线、接触表、
  动效预览和用户此前明确确认作为准据。最终交互式 QA 的退出项由 Computer
  Use 实际点击 `Quit Oh My Pets` 后再确认，报告记录进程干净结束。
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

- Status: passed
- Command: `pnpm verify`
- Result: 最后相关产品改动后通过；正式范围与架构检查、15 动作／86 帧机械
  资源校验、Rust workspace、19 个 Vitest 文件共 153 项、3 项真实 Chromium
  E2E／视觉基线、Rust/Web lint、WebView 与真实 Tauri release 构建及 closeout
  扫描全部通过。

### Manual QA

- Status: passed
- Command: `pnpm qa:desktop`
- Result: 自动 smoke 11 项全部通过；交互式 QA 11 项全部通过，报告
  `target/desktop-smoke/manual-qa.json` 的 `passed=true`、
  `appStayedRunningUntilExitCheck=true`、`appExitedCleanly=true`，自动与人工
  报告共享最终源码指纹
  `6a769f0c54f8e801055a5f7156f6cfd2fdf06057e8ca11834fc819a834718590`。
- Reason: 新增的卷卷视觉与三档尺寸由用户在本顶层会话明确确认；用户要求旧的
  通用桌面项改由脚本或 Computer Use 验证，因此窗口、菜单、恢复、偏好、
  点击穿透和诊断项复用本轮真实 `qa:desktop:auto`、既有用户确认与重新执行的
  Computer Use 功能证据，未重复提问；最终退出由 Computer Use 直接操作。

### Review

- Standards: passed
- Spec: passed
- Notes: 双轴复审均无阻塞项。首轮发现的动作 E2E 时钟未冻结、视觉测试文档边界、
  `rare_1` 末帧纸团叙事和 `land` 灰尘可见性均已修正并复审通过；生成器与独立
  机械校验器之间存在非阻塞的动作契约重复，保留为相互校验的事实源。

### Commit

- Status: committed
- Hash: `95acee5a216e9e49db746aca17a26a5134a17dbb`

## Answer

已完成正式“卷卷”宠物包制作与集成：原创橘白短腿圆头粗卷尾角色具备 15 个
动作、86 个独立帧、`320×320` 标准画布和单图集，正式资源、来源／使用权说明、
确定性组装器、机械校验、接触表、动效预览、Chromium 视觉基线及真实桌面 QA
均已交付并通过验收。
