# Oh My Pets P0 外部 Alpha 决策地图

## Destination

形成一套足以结束规格设计并进入受控实施的 P0 决策集：明确 macOS 与 Windows 外部 Alpha 的产品边界、技术架构、内容规范、发布策略和验证标准。

## Notes

- 本地图只做规划和低成本验证，不直接实施产品功能。
- 现有证据优先来自 `research/` 调研报告和 `reference/` 参考源码。
- 交付标准是可供真实外部用户独立下载安装试用的 Alpha。
- P0 只包含一只原创 2D 宠物和标准化宠物包导入，产品完全本地优先。
- 每个会话应参考 `CONTEXT.md`，并按需使用 `/grilling`、`/domain-modeling` 或 `/prototype`。
- 截至 2026-07-28，本地图的规划与低成本验证结论已经收口；正式实现已通过独立的 `Issue 08` 完成 macOS 预览版最小主线骨架，并完成自动验证、人工验收、双轴 review 和中文正式提交 `8ad7fc4030ae14ce90bf3bc93233e1a2675b8a1e`。

## Decisions so far

- [定义 P0 陪伴循环与必备交互](./issues/01-define-p0-companion-loop.md) — 采用无养成压力的自主趣味行为循环，以屏幕边缘活动、直接物理交互和低打扰控制验证 3 天常驻意愿。
- [决定运行时与渲染架构](./issues/02-decide-runtime-and-rendering-architecture.md) — 采用 Tauri 2、Rust 原生平台适配层与 PixiJS 精灵渲染，按资源门槛验证 WebView 路线并保留 `wgpu` 退路。
- [用最小样机验证双平台桌宠壳](./issues/03-prototype-cross-platform-shell.md) — macOS 侧已确认透明窗、拖拽、托盘和文件投喂路线可行，但也确认“整窗点击穿透与系统级文件拖放不能共存”；Windows 11 图形壳仍是后续外部 Alpha 前的实施阻塞项。
- [确定宠物包规范与安全边界](./issues/04-define-pet-pack-boundary.md) — 采用严格声明式的 `pet.json + atlas.json + 单图集` 内容包，行为、物理和安全边界留在 Rust 宿主。
- [定义首发宠物内容与动画清单](./issues/06-define-first-pet-content.md) — 首发内容锁定为一只原创短腿橘白猫，以约 `86` 帧动作覆盖陪伴循环和两个可分享的招牌动作。
- [确定外部 Alpha 的发布、权限与恢复策略](./issues/05-define-alpha-distribution-strategy.md) — 先做 `macOS 预览版`，再以双平台门槛进入真正的 `外部 Alpha`；当前不把未验证的 Windows 能力包装成可发布承诺。
- [设计外部 Alpha 的验证与反馈闭环](./issues/07-define-alpha-validation-loop.md) — 先用 `8–12` 名 macOS 用户完成预览版闭环，再补 Windows 11 样本进入双平台外部 Alpha。
- [搭建 macOS 预览版主线最小骨架](./issues/08-build-macos-preview-mainline.md) — 已建立 Rust 领域层、Tauri 壳、Vue/PixiJS 工作台、示例宠物包链路和最低恢复能力；自动验证、人工验收、双轴 review 与正式提交均已完成，状态为 `resolved`。

## Next Frontier

- `Issue 08`、窗口隐藏修复 `Issue 09` 和菜单栏入口诊断 `Issue 10` 均已关闭。
- 2026-07-30，后续 `macOS 预览候选版` 已完成 grilling 并形成独立
  [`spec`](../oh-my-pets-macos-preview-candidate/spec.md) 与
  [`实施地图`](../oh-my-pets-macos-preview-candidate/map.md)；规划 Pull Request
  合入 `main` 后，其 `Issue 01` 产品窗口壳和 `Issue 06` 正式卷卷美术成为
  首批可领取 frontier。
- 新工作必须在新的实施上下文中领取候选版 ticket；不得把完整首发内容、正式
  发布或 Windows 壳回写到已经关闭的预览版骨架票。

## Not yet specified

- 自动更新是否进入 Alpha，待发布和异常恢复策略明确后再决定。
- Windows 11 的点击穿透、输入权限与状态提示仍待 Windows 实机验证；macOS
  候选版默认策略已由后续规格锁定。
- Alpha 之后的内容生产和商业化方向，待首轮外部验证结果出现后再规划。

## Out of scope

- iOS 客户端。
- AI 对话与人格聊天。
- 3D 或 VRM 宠物。
- 照片或视频一键生成宠物。
- 账号、云同步、内容市场和多人共享。
- 支持任意可执行脚本的 UGC。
