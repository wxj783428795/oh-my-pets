# 制作并集成正式“卷卷”宠物包

Type: task
Kind: feature
Status: claimed
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
- 2026-07-31 06:22:54 +0800：用户在 PR #11 尚未合并时复查真实 `.app`，
  发现三项阻塞缺陷：中号宠物的卷尾在透明窗口右边界被裁切；真实宠物窗口只
  显示静态帧；偏好设置内容高于窗口时无法滚动到 `ADVANCED` 区域。本票重新
  置为 `claimed`，继续使用原独立 worktree、原 Issue 06 分支和原 PR target；
  此前 closeout 的 verify、人工 QA、双轴 review 与提交证据对新增修复失效。
  修复必须保持“不实现自主行为调度或窗口运动”的边界，只让真实宠物窗口消费
  声明式逐帧 idle 动画。
- 2026-07-31 06:36:03 +0800：修复前先记录 approved spec 的公共验证 seams：
  资源本体继续由 `pnpm pet:assets:check` 证明标准画布和透明边界；真实宠物
  表面由 DPR 2 Chromium 基线证明 `idle_00` 卷尾完整且 Canvas CSS 尺寸仍为
  `320×320`，由受控时钟证明首帧时长结束后换帧；偏好设置由真实页面滚动到
  `ADVANCED` 入口证明。红灯分别为：Tauri 的 `BTreeMap` 字典序首帧落到尾巴
  越界的 `curious_00`、宠物表面从未调用 `play`、滚动容器因 `min-height`
  随内容增长而无溢出。按 TDD 小切片修正为显式 `idle_00` 初始帧、仅消费
  声明式 idle 的持续播放并响应安静模式、固定视口高度的纵向滚动容器；6 项
  Chromium E2E 全绿，新增 Retina expected 已人工查看为完整卷尾。
- 2026-07-31 06:55:21 +0800：重开后的首轮双轴 review 中 Spec 轴无发现，
  Standards 轴发现原机械校验只以归一化 RGBA 精确哈希拒绝简单缩放，双线性
  重采样真实 `idle_00` 后会漏检；另有以 `Infinity` 表示持续播放的非阻塞
  Primitive Obsession 判断项。按 TDD 先加入真实卷卷帧 80% 双线性缩放红灯，
  再改为双线性归一化后的预乘透明像素平均差检测，正式 86 帧仍无误报；同时
  新增 `playUntilStopped` 明确 API 消除数值哨兵。相关 21 项窄测试、
  `pnpm lint:web` 与 `pnpm pet:assets:check` 已转绿，待完整门禁与双轴复审。
- 2026-07-31 22:42:20 +0800：用户指出上游分支冲突后重新 fetch，确认
  `origin/integration/macos-preview-candidate` 已通过 PR #12 推进到
  `c1376b85c42701059707840e20f0d62ba5d8665f`。本分支只合入该正式 integration
  提交，没有读取或修改 Issue 03 的独立 worktree，也没有直接合并或拣选兄弟
  topic 分支。唯一内容冲突位于 `docs/agents/delivery-readiness.md`：保留
  Issue 03 的真实原生运动／显示器 QA，并同时保留本票正式卷卷 15 动作、三档
  尺寸和透明边缘人工验收；桌面 smoke 仍不得替代内容资源验收。
- 2026-07-31 23:05:59 +0800：用户在真实桌面继续视觉复查时明确判定“现在的
  动作不流畅”，因此本票继续保持 `claimed`，此前视觉通过结论不得用于关闭。
  本轮先以桌面实际持续播放的 `idle` 建立最小红灯：现有 6 帧时长为
  `720/180/160/120/160/520ms`，且 `idle_02 -> idle_03`、
  `idle_03 -> idle_04` 的标准画布透明轮廓重合度分别仅为 `79.3%`、`82.4%`，
  对应长停顿后头身与卷尾突然换形。approved spec 对应的公共验证 seams 为：
  正式 `pet.json + atlas.json + atlas.png` 通过公开
  `validateProductionPetPixels`／`pnpm pet:assets:check` 检查静止待机相邻帧
  轮廓连续性；同一声明式动作再由实际 PixiJS 循环、动效预览与真实桌面三档
  尺寸确认肉眼无跳变。位图修复继续使用 imagegen2，并保持本仓库 15 动作、
  86 帧、`320×320` 单图集契约，不强套 `hatch-pet` 的 Codex v2 包装格式。
- 2026-07-31 23:15:52 +0800：imagegen2 重制的完整 `idle` 六帧动作条经确定性
  组装后，相邻轮廓重合度提升到 `92.1%–95.7%`，独立视觉 reviewer 判定
  `idle` 平滑；但同一 reviewer 仍阻断整票，指出 `sleep` 末帧蜷卧闭眼回首帧
  睁眼趴卧、`fall` 末帧四足低伏回首帧后身抬高，均有明显循环跳变。实测两者
  首尾轮廓重合度分别仅 `75.2%`、`34.9%`。因此已停止会被后续位图改动作废的
  `pnpm verify`，继续以公开宠物包像素校验建立循环 seam 红灯，并分别重制两张
  完整动作条；不得拼接单个修补帧或把视觉失败伪记为通过。
- 2026-07-31 23:30:30 +0800：`sleep` 完整五帧重制后首尾轮廓重合度提升到
  `86.0%`，独立 reviewer 确认始终闭眼蜷卧且呼吸回环平滑。首版 `fall`
  修复虽把 seam 提升到 `89.0%`，却被 reviewer 判为低伏警觉而非下落；第二次
  文本强化仍由 imagegen worker 主动拒绝为贴地扑跃。按 `hatch-pet` 收敛规则
  改用既有明确悬空的 `fall_00` 作为姿态锚点后，第三版三帧均保持头低臀高、
  后爪悬空和卷尾上扬，首尾轮廓重合度为 `93.1%`。同一独立 reviewer 最终确认
  `fall` 内部过渡与回环均连贯，并对全部 15 行返回视觉通过；真实 `.app` 三档
  尺寸与用户人工观感仍须在本轮新资源上重新确认。机械红灯、完整 10 项资产
  契约测试和 `pnpm pet:assets:check` 已转绿。
- 2026-08-04 13:04:37 CST：再次 fetch 正式上游，确认
  `origin/integration/macos-preview-candidate` 已通过 PR #13 推进到完整提交
  `42d3101f31967f591971c8e9386fba4885efec26`。本分支仍只合入正式
  integration，没有读取、修改或合并 Issue 03 / Issue 04 的兄弟 worktree、
  topic 分支或未提交文件。三个冲突均来自同一职责交汇：
  `PetWindow.vue`、`PetWindow.test.ts` 和 `pet-renderer.ts` 中，本票的持续
  `idle` 逐帧播放与上游的点击／拖拽／投喂动作、首帧回执同时修改了播放入口。
  语义合并保留两边意图：普通交互动作按 Rust 的 `holdMs` 结束且继续回报首帧，
  `idle` 使用同一渲染核心持续循环；交互开始停止待机，完成返回 `idle` 后恢复
  持续逐帧播放。新增前端契约测试锁定该恢复 seam；窄范围 24 项 Vitest 与
  `pnpm lint:web` 已通过，合并完成后仍须重跑最终 `pnpm verify`。
- 2026-08-04 13:16 CST：上游合并后的 Standards + Spec 双轴 review 各发现
  一个阻塞交汇缺陷，均按 TDD 小切片修复。Standards 轴指出点击穿透取消动作
  返回持续 `idle` 时没有 `pet-interaction-visible` 首帧回执，会使真实桌面自动
  smoke 超时；先在“互动完成恢复持续待机”前端测试中确认 revision 2 回执红灯，
  再让声明式 `idle` 以同一个 `playUntilStopped` 首帧回调发出回执。Spec 轴指出
  Issue 04 的占位时长会把正式 `land`、`tap_react`、`feed_react` 分别从
  `500/720/1320ms` 提前截断为 `320/620/1100ms`；先加入 Rust 正式动作时长
  红灯，再让有限交互动作从当前已加载宠物包逐帧求和，只有包不可用或溢出时才
  回退宿主安全值，`idle/drag_hold/fall` 的长期仲裁保持不变。16 项直接互动
  Rust 测试、24 项相关前端测试与完整 lint 已转绿；因这些是 review 后相关改动，
  双轴复核确认原发现均已关闭且无新增阻塞；提交前仍须在当前最终工作树重跑
  `pnpm verify`，未全绿不得完成合并提交。
- 2026-08-04 13:20:39 CST：在合并提交 `28f6628` 的当前源码上真实运行
  `pnpm qa:desktop:auto`，13/13 项全部通过，源码指纹为
  `f0d4c281182665cd678be888e0bdf7e07fc9385ef5d812416a26a1c2bb4753ee`。
  其中正式卷卷读回 15 动作／86 帧；真实点击、拖拽、抛掷、落地和文件投喂
  通过且首帧响应 2ms；点击穿透取消动作已确认到达 Pixi `idle` 首帧；原生
  NSPanel、窗口运动、偏好恢复、登录项、菜单状态、诊断与不抢焦点均通过。
  此次前台环境不再被 ToDesk 占用，旧阻塞已解除；自动 smoke 仍不替代
  `pnpm qa:desktop` 的真实视觉、三档尺寸与逐项用户人工确认。
- 2026-07-31 23:43:27 +0800：本轮最终 Standards 轴无阻塞项，Spec 轴为
  `pass-with-closeout-pending`。Standards 的唯一非阻塞发现是损坏清单把循环动作
  标为 `loop: true` 却漏掉 `frames` 时，连续性像素校验会抛 `TypeError`；按
  TDD 先以公开 `validateProductionPetPixels` 复现红灯，再为 `idle` 和循环 seam
  加入 `Array.isArray` guard，11 项资产契约测试、Web lint 与资产检查转绿。
  最后一轮相关资源上的 `pnpm verify` 曾完整通过，但该 guard 属于后续相关改动，
  因此提交前仍须从头重跑。真实 `pnpm qa:desktop:auto` 已连续两次因外部 ToDesk
  固定占用前台 PID `34450` 而在焦点探针失败；Finder 激活也被立即抢回，未结束
  或修改 ToDesk，且绝不把该结果记为通过。Computer Use 同样在此环境超时；随后
  只直接启动本 worktree 新构建的 `.app` 供用户观看，并清理重复实例，仅保留
  一个进程。新版人工动作观感与正式交互式 `pnpm qa:desktop` 仍待用户确认，
  本票继续保持 `claimed`。
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
- Result: 2026-08-04 CST：最终相关源码上，正式卷卷 15 动作／86 帧机械校验、
  81 个 Rust 测试、176 个 Web／工程测试、6 个 Chromium E2E、架构与范围、
  lint、WebView、真实 Tauri release 构建及 closeout 扫描全部通过；随后真实
  `pnpm qa:desktop:auto` 13/13 项通过。

### Manual QA

- Status: pending
- Command: `pnpm qa:desktop`
- Result: 自动桌面 smoke 已在最终源码上通过；正式交互式人工清单仍待用户逐项
  确认，不能用自动结果代替。
- Reason: 待真实 `.app` 三档尺寸、15 个动作、透明合成与最终退出人工验收。

### Review

- Standards: passed
- Spec: passed
- Notes: 上游合并首轮各发现一个交汇阻塞；按 TDD 修复 `idle` 首帧回执和正式
  动作声明时长后复核均通过，无新增 hard violation、smell、规格缺失或 Issue 05
  自主调度 scope creep。人工 closeout pending 不伪装成代码通过。

### Commit

- Status: pending
- Hash: pending

## Answer

修复中。
