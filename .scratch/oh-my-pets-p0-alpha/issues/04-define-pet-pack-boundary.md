# 确定宠物包规范与安全边界

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

P0 宠物包需要包含哪些资源、元数据、动作状态和版本信息，才能在双平台上可靠导入与校验？请明确格式、能力边界、兼容策略、错误反馈和禁止执行任意脚本的安全约束；动作定义还需支持未来在指定时点挂接可选音效，但 P0 不交付音频资源或播放能力。

## Comments

- 2026-07-28 对照 `reference/OpenPetsKit` 与 `reference/DyberPet` 复核了现有宠物格式。OpenPets 的 `pet.json + spritesheet` 导入模型足够简单，但固定 `8x9` 动画行列过于刚性，无法覆盖 P0 已确认的任意帧数、时长、锚点、热区和动作提示点需求。
- DyberPet 的 `pet_conf.json + act_conf.json` 表达力足够，但把随机动作、移动参数、条件、组件和可选音频都暴露给内容包配置，本质上已经接近“数据驱动行为脚本”，超出了 P0 想保住的 Rust 行为引擎边界。
- 因此 P0 采用中间路线：保留“单包目录 + 声明式清单 + 单图集”的易导入模型，但只允许内容包提供资源、固定的语义动作和动作提示点；概率、调度、物理、窗口逻辑、系统权限和任何执行能力都留在宿主。

## Answer

P0 宠物包的边界是“可声明外观与动作，不可声明行为逻辑”。规范分成传输格式、安装后目录、清单字段、动作键、导入校验和安全限制六部分。

1. 传输与目录格式

- P0 的标准分发格式是一个 zip 包；开发态可直接加载包含 `pet.json` 的目录。
- zip 解压后必须得到且只能得到一个宠物包根目录；根目录内至少包含 `pet.json`、`atlas.json` 和一个图集图片。
- 安装后的标准目录如下：

```text
my-pet/
  pet.json
  atlas.json
  atlas.webp
  preview.png        # 可选
  LICENSE.txt        # 可选
  README.md          # 可选
```

- 文件名仅允许 ASCII、小写字母、数字、`-`、`_` 和 `.`，避免跨平台解压或大小写冲突。

2. `pet.json` 必填字段

```json
{
  "schemaVersion": 1,
  "id": "momo-cat",
  "version": "1.0.0",
  "displayName": "Momo",
  "description": "A curious orange cat.",
  "author": { "name": "Oh My Pets Studio" },
  "minAppVersion": "0.1.0",
  "renderer": "sprite-atlas-v1",
  "canvas": { "width": 320, "height": 320 },
  "atlasPath": "atlas.json",
  "layout": {
    "baseline": { "x": 160, "y": 278 },
    "hitbox": { "x": 72, "y": 48, "width": 176, "height": 220 },
    "dropZone": { "x": 92, "y": 120, "width": 136, "height": 100 },
    "bubbleAnchor": { "x": 160, "y": 36 }
  },
  "actions": {
    "idle": {
      "loop": true,
      "frames": [
        { "ref": "idle_0", "durationMs": 1800 },
        { "ref": "idle_1", "durationMs": 140 },
        { "ref": "idle_2", "durationMs": 1800 }
      ],
      "cuePoints": [{ "name": "blink", "timeMs": 1800 }]
    }
  }
}
```

- `schemaVersion`：宠物包格式版本。P0 只接受 `1`。
- `id`：包的稳定标识，只允许小写短横线 slug；安装、升级和去重都以它为主键。
- `version`：宠物包自身版本，使用 semver 字符串；用于升级比较，不参与行为逻辑。
- `displayName`、`description`、`author`：导入列表和后续信息展示所需元数据。
- `minAppVersion`：宿主最低版本；当前应用版本低于它时直接拒绝导入。
- `renderer`：固定为 `sprite-atlas-v1`；P0 不接受其他渲染格式。
- `canvas`：该宠物的标准渲染画布尺寸，决定窗口内容区域和动作对齐基准。
- `layout`：全局锚点和热区定义。

3. `atlas.json` 与帧资源边界

```json
{
  "imagePath": "atlas.webp",
  "pixelWidth": 2048,
  "pixelHeight": 1024,
  "frames": {
    "idle_0": { "x": 0, "y": 0, "w": 180, "h": 160, "offsetX": 70, "offsetY": 96 },
    "idle_1": { "x": 180, "y": 0, "w": 182, "h": 162, "offsetX": 69, "offsetY": 94 }
  }
}
```

- 图集只允许一张 `.png` 或 `.webp`；`.webp` 为首选。
- `frames` 只描述像素裁剪与放回固定画布的位置，不携带任何移动速度、概率、脚本或条件。
- P0 先限定这些上限：图集不超过 `4096x4096`，解压后总大小不超过 `32 MiB`，总帧数不超过 `256`，动作数不超过 `32`。

4. 语义动作边界

- 宠物包只能实现宿主规定的固定语义动作键，不能自定义状态机、概率或条件表达式。
- P0 必填动作键：
  - `idle`
  - `walk_left`
  - `walk_right`
  - `sleep`
  - `drag_hold`
  - `fall`
  - `land`
  - `tap_react`
  - `feed_react`
- P0 可选动作键：
  - `intro`
  - `curious`
  - `edge_play`
  - `rare_1`
  - `rare_2`
  - `quiet_idle`
- 只对可选动作做回退：`intro`、`curious`、`edge_play`、`rare_*` 缺失时可回退到 `idle` 或行走动作；任何必填动作缺失都直接拒绝导入。
- 动作定义只包含这些声明式字段：`loop`、`frames`、`cuePoints`、可选的 `layoutOverride`。不允许 `probability`、`need_move`、`direction`、`physics`、`soundPath`、`script`、`if`、`phase` 之类会改变宿主行为的字段。

5. 动作提示点与未来音效兼容

- 每个动作都可声明 `cuePoints`，格式为 `name + timeMs`；它们是纯元数据，不会在 P0 触发任何播放逻辑。
- P0 不接收也不安装任何音频文件；包内出现 `.wav`、`.mp3`、`.ogg` 等文件即视为非法输入。
- 未来如果接入可选音效，只允许宿主把少数受支持的提示点名映射到本地音效资产；宠物包仍然不能直接引用文件路径、URL 或脚本回调。

6. 导入校验、兼容策略与错误反馈

- 导入流程固定为：解压到临时目录，逐项验证路径安全，再验证 `pet.json`、`atlas.json`、图集尺寸、动作键、帧引用和大小限制，全部通过后才复制到安装目录。
- 兼容策略：
  - `schemaVersion` 主版本不匹配：拒绝导入。
  - `renderer` 非 `sprite-atlas-v1`：拒绝导入。
  - `minAppVersion` 高于当前应用：拒绝导入。
  - 未识别的非关键字段：保留并给出 warning，不阻塞导入。
  - 同一 `id` 的更高 `version`：视为同一宠物包的新版本；替换策略由安装流程决定，但兼容判断以 `id + version + schemaVersion` 为基础。
- 错误反馈分两级：
  - blocking error：缺少文件、JSON 非法、路径不安全、图集超限、未知必填动作、帧引用不存在、尺寸越界、格式版本不支持。这类错误直接终止导入，并给出明确字段名或文件路径。
  - warning：未使用的帧、未知非关键字段、缺少 `preview.png`、存在允许但未使用的说明文件。这类问题允许导入，但在 UI 中提示“已导入，存在兼容警告”。

7. 安全红线

- 禁止任何可执行内容：脚本、二进制、动态库、宏、字体插件、HTML、JS、Wasm、嵌套压缩包一律拒绝。
- 禁止任何越权路径：绝对路径、`..`、符号链接、硬链接、大小写冲突路径、指向包外部的引用一律拒绝。
- 清单中的所有路径都必须是相对路径，且只能引用包内白名单文件。
- 宿主不执行包内代码，不下载远程资源，不解析表达式，不注册回调，不开放 Lua/Python/JS 之类扩展点。

结论是：P0 宠物包采用“`pet.json` + `atlas.json` + 单图集图片”的严格声明式格式，由 Rust 宿主独占行为与安全边界。内容包只负责资源、语义动作和动作提示点，这既比 OpenPets 的固定 `8x9` 更能表达 P0 需求，又避免落入 DyberPet 那种高自由度内容配置即逻辑配置的失控边界。
