# 决定运行时与渲染架构

Type: grilling
Status: resolved

## Question

在外部 Alpha 的范围和质量标准下，应采用什么跨平台桌面壳、核心逻辑与 2D 渲染组合？请结合现有调研，在 Tauri/Rust、原生适配层、PixiJS、Rive、序列帧或 Live2D 等候选中明确职责边界、淘汰方案与验证假设。

## Comments

- 渲染基线：P0 使用 PixiJS 8 渲染 PNG/WebP 精灵图集，由 JSON 描述任意帧数、时长、锚点、热区和提示点；透明 WebM 只进入样机验证。
- 扩展边界：Rive 不进入 P0；Live2D 不作为首发格式，但渲染器接口必须允许未来新增 Live2D 实现。
- 桌面壳：采用 Tauri 2、Rust 共享核心和双平台原生窗口适配器；macOS 与 Windows 细节不得渗入行为引擎或前端。
- 职责边界：Rust 负责行为、调度、物理、宠物包校验、本地状态和原生窗口控制；TypeScript/PixiJS 负责精灵渲染、视觉反馈、设置与引导；跨层只交换语义事件，不进行逐帧 IPC。
- 前端栈：采用 Vue 3、TypeScript 与 Vite；宠物窗口使用独立的最小 PixiJS 入口，设置窗口使用 Vue，二者只共享事件类型和基础状态。
- 窗口拓扑：使用按宠物最大动作范围确定尺寸的透明小窗口，由原生适配器跟随宠物全局坐标移动，不使用全屏透明覆盖层。
- 运动范围：自主行为限定当前显示器，用户拖拽可切换显示器；越界时恢复到最近显示器底部，宠物不会自主跨屏。
- 原生适配：在 Rust 中定义统一 `PlatformShell` 接口；macOS 使用 `tauri-nspanel` 与必要 AppKit 调用，Windows 使用 `windows-rs` 与 Win32/DWM；通用能力优先使用 Tauri 官方插件，不引入 Swift、C# 或辅助进程。
- 行为扩展：Rust 固定行为图、状态转换、物理规则和安全上限；宠物包提供动画、锚点、热区、提示点及受限性格权重，不允许脚本、任意条件表达式或自定义物理。
- 路线定位：WebView/PixiJS 是受性能门槛约束的 P0 基线，不承担平台窗口能力，也不是不可替换的长期承诺；若样机优化后仍不达标，保留 Rust 核心、事件协议与原生窗口适配器，仅将宠物渲染器替换为 `wgpu`。
- 支持范围：P0 仅发布并验收 macOS 14+ Apple Silicon（`arm64`）与 Windows 11（`x86_64`）；Intel Mac 与 Windows 10 不进入验收矩阵，也不提供对应安装包。
- 性能门槛：冷启动至宠物可见不超过 4 秒、热启动不超过 2 秒；静止待机 CPU 中位数不超过 2%，持续动作或拖拽不超过 5%；常驻内存不超过 200 MB；移动期间 95% 帧耗时不超过 20 ms且无肉眼可见抖动；连续运行 8 小时无崩溃，内存净增长不超过 20 MB。
- 调度策略：静止时暂停 PixiJS ticker，仅在状态变化时重绘；精灵动画按宠物包定义的 12–24 FPS 播放；拖拽、抛掷和窗口位移由 Rust 以最高 60 Hz 更新；窗口被系统遮挡、锁屏或进入手动安静模式时暂停非必要动画。

## Answer

采用 Tauri 2、Rust 共享核心、Vue 3 设置界面和独立 PixiJS 8 宠物渲染器。P0 以声明式 PNG/WebP 精灵图集为唯一正式动画格式，透明 WebM 仅用于样机验证，Rive 不进入 P0，Live2D 通过可替换渲染器接口预留。

Rust 独占行为、调度、物理、校验、本地状态与原生窗口控制；TypeScript 只负责渲染和界面，跨层仅交换语义事件。宠物运行在随全局坐标移动的小型透明窗口中，自主活动限定当前显示器。平台差异封装在统一 `PlatformShell` 后：macOS 使用 `tauri-nspanel`/AppKit，Windows 使用 `windows-rs`/Win32/DWM。

P0 只发布 macOS 14+ Apple Silicon 与 Windows 11 x86_64。WebView/PixiJS 必须通过已确认的资源与稳定性门槛；不达标时保留 Rust 核心、事件协议与平台适配器，仅将渲染器替换为 `wgpu`。完整取舍见 [ADR-0001](../../../docs/adr/0001-tauri-rust-pixijs-desktop-architecture.md)。
