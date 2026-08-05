# 卷卷正式宠物包

卷卷是一只原创的橘白短腿猫：圆头、粗卷尾、深棕轮廓和青色项圈，性格安静、
好奇，偶尔有点笨拙。正式素材采用少色块、无渐变的扁平 2D 卡通风格。

## 包内容

- `pet.json`：`sprite-atlas-v1` 清单、动作时间线、cue point 和交互锚点。
- `atlas.json` / `atlas.png`：单张 `2560×1899` 透明图集，共 86 个独立帧。
- `preview.png`：`320×320` 标准画布上的默认预览。
- `LICENSE.txt`：来源、使用权和第三方素材边界。

全部帧使用 `320×320` 标准画布语义和 `y=288` 脚底基线。动作预算如下：

| 动作         | 帧数 | 循环 |
| ------------ | ---: | :--: |
| `intro`      |    8 |  否  |
| `idle`       |    6 |  是  |
| `walk_left`  |    6 |  是  |
| `walk_right` |    6 |  是  |
| `sleep`      |    5 |  是  |
| `drag_hold`  |    2 |  是  |
| `fall`       |    3 |  是  |
| `land`       |    4 |  否  |
| `tap_react`  |    5 |  否  |
| `feed_react` |    7 |  否  |
| `curious`    |    5 |  是  |
| `edge_play`  |    5 |  是  |
| `quiet_idle` |    4 |  是  |
| `rare_1`     |   10 |  否  |
| `rare_2`     |   10 |  否  |

## 制作与来源

2026-07-30 使用 OpenAI ImageGen 2 为本项目直接生成角色定稿和 15 张逐动作姿态表。
提示词由项目角色约束、动作叙事和纯蓝色键背景组成，没有输入、复制或描摹
`reference/` 中的第三方角色、帧或图集。原始姿态表是制作过程文件，位于被忽略的
`output/juanjuan-production/`，不作为运行时资产提交。

2026-07-31 根据真实桌面视觉反馈继续使用 OpenAI ImageGen 2 重制完整 `idle`
六帧动作条，以同一角色锚点约束头身、四脚、卷尾、尺度和脚底基线，只保留连续
眨眼、轻呼吸与轻尾摆；没有拼贴单帧或从第三方素材补帧。随后重新运行同一确定性
组装流程和全包校验。

同日独立动效复审继续发现 `sleep` 与 `fall` 的循环首尾跳变，因此分别重制完整
五帧和三帧动作条。`sleep` 全程保持闭眼蜷卧的呼吸回环；`fall` 先用既有明确
悬空的 `fall_00` 提取姿态锚点，再让 ImageGen 2 生成同一头低臀高、后爪悬空
姿态家族的微变化，避免把低伏或落地帧混入下落循环。

生成输入的 SHA-256 记录如下，用于把正式图集追溯到本次制作批次：

```text
0ad0dfff8c271618629be5f2f817f7d7b70a793dc8d626ee5c003f5598c1cab4  canonical-base-chroma.png
f8ed7cbba6cbdad9888f47ec4d20e1c42e7a1dfa4d18a80e98c623fb254bd5c9  curious.png
e0ab8eb1f119b45e6ab007f88ed95035046eb74e646e10e4221488eacfa0fd26  drag_hold.png
2ef6b7ad6383538b5a27752c551624c259b914e54931f19bce5ee05c03e65770  edge_play.png
a92a10fce3ac2845ff527fa27b861b9e22fd5d994d148ff0d876fe81815a281e  fall.png
d0496de2e487a4c13d9cafdcddff14895073fb1907b540dd36f88afe17391851  feed_react.png
ac19440a4e84125d69a3eb89eee9a3df6bf1e693c427821dbc765d6db4d7e281  idle.png
5ad62fb79dc9946c0fa1e608d083843015145536d2739027a54f000f31f26882  intro.png
1e16f2d4ca66b421fe32f4fa88af8b13d397ecf290fb6a03ea4c019c4f592821  land.png
fd2c01b45c9463256e8bfb1beddc9002da1a20d7a99db5913659bfd33dc4799c  quiet_idle.png
10af3cd4a1241972be4271d7c8c3df1eed2ae8903152b2da5b3059091ee0f53b  rare_1.png
5cd8b3b5260e3581fabfd85206ac9c87955b2d7ad0a27213c2e7081752557c08  rare_2.png
bb6ae447d94b5c56fbdb0e0fd07137c054527907a82e0a552c19bf8287909b62  sleep.png
01615a93f756eb164ffc7fa5ac0b1be6e4032890fee08eb1762792ac4f41a362  tap_react.png
9391f688f0b6e185bf4a6f4a5b400f6802eb77c093c3d370b779d0333b8cfc95  walk_left.png
6a7b052bcbaf53dba799fdc34f077af5b2ec04c6999643aebb18dc546b7efae4  walk_right.png
```

`scripts/assemble-production-juanjuan.py` 对姿态表执行确定性的色键去背、连通域清理、
固定色板量化、动作级比例归一、基线定位和图集装箱。运行脚本前必须调用
`load_workspace_dependencies`，并使用其返回的 Python；脚本的输入路径必须明确指向
本次制作目录。例如：

```bash
<workspace-python> scripts/assemble-production-juanjuan.py \
  --run-dir output/juanjuan-production \
  --pack-dir assets/pets/juanjuan \
  --qa-dir docs/qa/juanjuan-production
```

机械校验使用：

```bash
pnpm pet:assets:check
```

该检查覆盖动作和帧预算、引用唯一性、标准画布放置、动作主体占比、图集尺寸、
透明边界、脚底基线、待机相邻轮廓连续性、睡眠／坠落循环 seam，以及原始像素和
归一化轮廓重复，防止用明显跳变、重复帧、整体平移或简单缩放冒充逐帧动画。

## 审阅与限制

逐帧接触表、全动作动效预览和两个招牌动作片段位于
`docs/qa/juanjuan-production/`。正式包只包含单一角色、单一配色和固定 2D 视角；
粒子、纸片等小型叙事道具已烘焙进对应帧，不包含音频、换装或可拆分组件图层。
