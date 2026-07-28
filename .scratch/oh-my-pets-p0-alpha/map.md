# Oh My Pets P0 外部 Alpha 决策地图

## Destination

形成一套足以结束规格设计并进入受控实施的 P0 决策集：明确 macOS 与 Windows 外部 Alpha 的产品边界、技术架构、内容规范、发布策略和验证标准。

## Notes

- 本地图只做规划和低成本验证，不直接实施产品功能。
- 现有证据优先来自 `research/` 调研报告和 `reference/` 参考源码。
- 交付标准是可供真实外部用户独立下载安装试用的 Alpha。
- P0 只包含一只原创 2D 宠物和标准化宠物包导入，产品完全本地优先。
- 每个会话应参考 `CONTEXT.md`，并按需使用 `/grilling`、`/domain-modeling` 或 `/prototype`。
- 截至 2026-07-28，本地图的规划与低成本验证结论已经收口；正式实现已通过独立的 `Issue 08` 进入，最小主线骨架已经实现，但人工验收、双轴 review 和正式提交尚未完成。

## Decisions so far

- [定义 P0 陪伴循环与必备交互](./issues/01-define-p0-companion-loop.md) — 采用无养成压力的自主趣味行为循环，以屏幕边缘活动、直接物理交互和低打扰控制验证 3 天常驻意愿。
- [决定运行时与渲染架构](./issues/02-decide-runtime-and-rendering-architecture.md) — 采用 Tauri 2、Rust 原生平台适配层与 PixiJS 精灵渲染，按资源门槛验证 WebView 路线并保留 `wgpu` 退路。
- [用最小样机验证双平台桌宠壳](./issues/03-prototype-cross-platform-shell.md) — macOS 侧已确认透明窗、拖拽、托盘和文件投喂路线可行，但也确认“整窗点击穿透与系统级文件拖放不能共存”；Windows 11 图形壳仍是后续外部 Alpha 前的实施阻塞项。
- [确定宠物包规范与安全边界](./issues/04-define-pet-pack-boundary.md) — 采用严格声明式的 `pet.json + atlas.json + 单图集` 内容包，行为、物理和安全边界留在 Rust 宿主。
- [定义首发宠物内容与动画清单](./issues/06-define-first-pet-content.md) — 首发内容锁定为一只原创短腿橘白猫，以约 `86` 帧动作覆盖陪伴循环和两个可分享的招牌动作。
- [确定外部 Alpha 的发布、权限与恢复策略](./issues/05-define-alpha-distribution-strategy.md) — 先做 `macOS 预览版`，再以双平台门槛进入真正的 `外部 Alpha`；当前不把未验证的 Windows 能力包装成可发布承诺。
- [设计外部 Alpha 的验证与反馈闭环](./issues/07-define-alpha-validation-loop.md) — 先用 `8–12` 名 macOS 用户完成预览版闭环，再补 Windows 11 样本进入双平台外部 Alpha。
- [搭建 macOS 预览版主线最小骨架](./issues/08-build-macos-preview-mainline.md) — 已建立 Rust 领域层、Tauri 壳、Vue/PixiJS 工作台、示例宠物包链路和最低恢复能力；当前状态为 `claimed`，仍需完成人工验收、双轴 review 和正式提交。

## Next Frontier

- 当前 frontier 是完成 `Issue 08` 已定义的人工验收、双轴 review 和正式提交。窗口恢复 QA 发现的独立缺陷已登记为 `Issue 09` 与 `Issue 10`：前者需要再次人工复现，后者已收窄为菜单栏状态项被当前内建屏幕刘海遮挡。两张 bug 票都是 `Issue 08` 的 blocker，不是用来规避该票人工验收的独立 QA ticket；后续功能工作仍需先建立独立 ticket。

## Not yet specified

- 自动更新是否进入 Alpha，待发布和异常恢复策略明确后再决定。
- 点击穿透、输入权限与状态提示的默认策略，待 `macOS 预览版` 主线和后续 Windows 11 实机验证后再细化。
- Alpha 之后的内容生产和商业化方向，待首轮外部验证结果出现后再规划。

## Out of scope

- iOS 客户端。
- AI 对话与人格聊天。
- 3D 或 VRM 宠物。
- 照片或视频一键生成宠物。
- 账号、云同步、内容市场和多人共享。
- 支持任意可执行脚本的 UGC。
