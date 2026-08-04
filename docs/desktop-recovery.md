# 桌面故障恢复

本页用于恢复正式 Tauri 主线的开发、构建、窗口和诊断链路。先在仓库根目录运行：

```bash
pnpm doctor:desktop
```

doctor 默认只读，只检查平台、工具版本、可选 Rust coverage 工具、Tauri 前置条件、`127.0.0.1:1420`、正式依赖和仓库内诊断/构建路径。它不会安装依赖、结束进程、清理缓存或修改用户文件。`fail` 表示继续构建前必须处理，`warn` 表示当前状态可能合理，但应按对应章节确认。缺少可选 coverage 工具只会警告，不影响普通桌面开发检查。

仓库使用 `doctor:desktop` 是因为 pnpm 10 自带同名 `pnpm doctor` 命令，package script 会被内置命令遮蔽；带命名空间的根命令确保实际运行本仓库检查。

若 shell 直接报告 `node` 或 `pnpm` 不存在，doctor 自身无法启动；这时不把 pnpm 内置 doctor 的结果当作仓库检查，直接阅读下方“依赖缺失”并先恢复 Node/pnpm。

## Tauri 前置条件

macOS 正式开发环境使用 `.node-version` 固定的 Node 22.14.0、`packageManager` 固定的 pnpm 10.27.0、`rust-toolchain.toml` 固定的 Rust/Cargo 1.97.1、仓库内 Tauri CLI，以及可由 `xcode-select -p` 定位的 Xcode Command Line Tools。Node 的项目最低引擎约束仍是 22.12，固定 patch 版本用于让本机、worktree 和 CI 的结果一致。缺少 Rust 时按 Rust 官方方式安装仓库声明的工具链，再重新运行 `pnpm doctor:desktop`；缺少 Xcode 工具时由开发者主动运行系统安装流程，doctor 不代为安装。

Windows 仍是产品目标平台，但当前票不扩张 Windows 实机验收。Windows 开发者需人工确认 Rust 使用 MSVC target，并已安装 Microsoft C++ Build Tools 与 WebView2 Runtime；确认后先运行 `pnpm doctor:desktop`，再用 `pnpm build:desktop` 验证真实链路。非 macOS/Windows 平台只能用于部分工程检查，不能作为桌面验收环境。

## 开发端口占用

Vite 与 Tauri 固定使用 `127.0.0.1:1420`，且 Vite 启用 `strictPort`。先只读定位监听者：

```bash
lsof -nP -iTCP:1420 -sTCP:LISTEN
```

Windows PowerShell 可运行：

```powershell
Get-NetTCPConnection -LocalPort 1420 -State Listen
```

如果监听者是当前终端启动的 `pnpm dev`，回到该终端用 `Ctrl+C` 正常停止后重试。不要让 doctor 或恢复脚本自动杀进程，也不要仅凭端口号终止未知进程；无法确认归属时保留进程并联系其所有者。

## 依赖缺失

先确认 `package.json`、`pnpm-lock.yaml`、`Cargo.toml` 与 `Cargo.lock` 来自当前提交。若任何受版本控制的依赖清单缺失，先运行只读命令：

```bash
git status --short
```

保留尚未提交的本地编辑，再从当前提交或协调线程恢复缺失文件；不要用安装命令伪造 manifest 或 lockfile，也不要直接覆盖有改动的文件。

只有依赖清单完整但 `node_modules/.modules.yaml` 缺失时，且 Node/pnpm 版本与仓库声明一致，开发者才可明确选择运行：

```bash
corepack enable
corepack prepare pnpm@10.27.0 --activate
pnpm install --frozen-lockfile
```

该命令只恢复锁文件声明的仓库依赖。Tauri CLI 应通过 `pnpm exec tauri --version` 从仓库依赖解析，不使用来源不明的全局 CLI。Rust 依赖由后续 Cargo 构建按 `Cargo.lock` 解析；不要删除或重写锁文件来绕过失败。

## Rust coverage 工具

`pnpm coverage:rust` 需要 `cargo-llvm-cov 0.8.7` 与当前 Rust toolchain 的 `llvm-tools-preview`。doctor 只读提示 `cargo-llvm-cov` 是否可用，不会安装它，也不会因为这个可选工具缺失而失败。开发者可以明确选择常规安装：

```bash
cargo install cargo-llvm-cov --version 0.8.7 --locked
rustup component add llvm-tools-preview
```

若只想为当前 worktree 生成一次本地报告，可把两项都隔离在已忽略的 `target/`：

```bash
cargo install --root target/coverage-tools cargo-llvm-cov --version 0.8.7 --locked
RUSTUP_HOME="$PWD/target/coverage-rustup" rustup toolchain install stable --profile minimal --component llvm-tools-preview
RUSTUP_HOME="$PWD/target/coverage-rustup" RUSTUP_TOOLCHAIN=stable PATH="$PWD/target/coverage-tools/bin:$PATH" pnpm coverage:rust
```

缺少任一项时，正式根命令会在运行测试前清晰失败，不会代为修改全局 toolchain。生成报告位于 `target/coverage/rust/`，原始 profile 与隔离工具同样留在 `target/`；这些都是可再生本地输出，不提交。覆盖率不是 `pnpm verify` 的组成部分，首次基线和盲区见 `docs/coverage-baseline.md`。

## 构建失败

按由窄到宽的顺序定位：

```bash
pnpm build:web
cargo check --workspace
pnpm build:desktop
```

保留首个失败命令的完整输出。前端失败优先处理 Oxlint、`vue-tsc` 或 Vite 报出的第一个文件；Oxlint 负责快速代码规则反馈，`vue-tsc` 继续负责 Vue/TypeScript 类型检查。Rust 失败优先处理 Cargo 的第一条 error；Tauri 打包失败再核对本页的原生前置条件。正式桌面产物位于 `target/release/oh-my-pets`，Windows 为 `target/release/oh-my-pets.exe`。只有最后一次相关改动后的 `pnpm verify` 可作为关闭证据。

## 窗口不可见

先确认应用进程仍在运行。菜单栏会按当前状态提供“显示／隐藏宠物”“开启／退出安静模式”“开启／关闭鼠标穿透”“召回宠物”、偏好设置和退出。若宠物因显示器布局变化、隐藏或点击穿透而不可用，直接选择“召回宠物”或关闭鼠标穿透；不需要先进入开发预览。不要直接删除用户偏好或应用数据来“重置”窗口。

“召回宠物”会读取当前鼠标所在的物理显示器，把唯一的 `pet` 原生窗口放到该屏
可用区域的右下安全角，并保持窗口不聚焦。自主运动不会跨显示器；只有用户或系统
明确移动窗口后才会更新当前显示器。应用会监听窗口移动／缩放并低频核对全部
显示器，在显示器断开、分辨率、缩放、排列或可用区域变化后把窗口收拢到最近的
可用安全区域。坐标与缩放边界见
[`ADR 0003`](adr/0003-native-pet-display-coordinate-model.md)。

排查时先记录显示器数量、相对排列、各自缩放、鼠标所在屏和问题前后的窗口位置，
再运行 `pnpm qa:desktop:auto`。报告中的
`native_window_motion_and_display_recall` 必须观察到真实原生窗口坐标改变、鼠标
屏召回、窗口未聚焦且只有一个 `pet` 实例。若只有一块物理显示器，人工结果只能
记录单屏；负坐标、上下排列、混合缩放和断开恢复由确定性 Rust 测试提供模拟证据，
不能把 macOS Space 当作第二块物理显示器。

如果真实桌面行为仍异常，先运行 `pnpm qa:desktop:auto` 生成包含当前桌面源码指纹的自动报告，再运行 `pnpm qa:desktop`，逐项确认窗口、动态菜单、偏好同步、跨启动矩阵、损坏恢复和受控开发入口。QA 使用仓库内被忽略的隔离偏好，脚本只在明确的验收步骤中重启测试应用和注入未知版本，不触碰真实用户配置。人工命令需要 macOS 交互式桌面并拒绝缺失、无效或源码指纹不匹配的自动报告；自动 smoke 不能替代真实点击与视觉确认。

## 启动抢焦点或输入中断

“宠物没有成为前台应用”和“用户输入焦点未被打断”是两个不同条件。若启动期间
其他应用的文本框停止接收键盘输入，即使 System Events 看到的前台 PID 始终未变，
也按抢焦点缺陷处理。不要只增加前台 PID 采样次数后宣布通过。

先用真实 QA 构建复现，并同时保留三类证据：启动前后的前台 PID、启动期间持续
发送到独立临时输入控件的按键数量，以及该控件的 AppKit first responder 是否
从未丢失。探针必须拥有自己的临时控件和输出，不能借用或修改用户已经打开的
TextEdit、编辑器或浏览器文档。基线连续输入应先通过；应用启动样本若明显少于
基线，或 first responder 曾经丢失，就继续排查而不是把丢键归因于观察误差。
`pnpm qa:desktop:auto` 会先用一个独立真实 Tauri 进程完成该探针并清理，再启动
另一个真实进程执行会显式聚焦偏好窗口的产品 smoke，避免后者污染启动证据。

```bash
pnpm qa:desktop:focus
```

按一次只改变一个变量的顺序缩小范围：

1. 暂停产品 setup，确认问题是否仍存在。
2. 暂停配置窗口创建，区分 Tauri/TAO 生命周期与 WebView、窗口显示。
3. 分别排除默认应用菜单和可选插件初始化。
4. 核对进入事件循环前和 setup 完成后的 macOS 激活策略。

当前主线的已知根因与约束见
[`ADR 0002`](adr/0002-macos-background-launch-activation-handshake.md)：TAO 在
`applicationDidFinishLaunching` 中的强制激活可在不改变前台 PID 的情况下清除
其他应用的 first responder。正式实现必须在启动握手期间保持 Prohibited，setup
完成后再切换为 Accessory；可交互宠物必须是真正带
`NSWindowStyleMaskNonactivatingPanel` 的 `NSPanel`，不能把该样式位强加给普通
`NSWindow`，也不能靠长期 Prohibited 换取保焦点。升级原生面板依赖、Tauri、TAO
或 macOS 最低版本后，应同时重跑真实连续输入探针，以及“输入—物理点击宠物—
继续输入—拖拽宠物”回归；若行为变化，先检查上游实现和实际窗口类型。

## 菜单栏入口受限

macOS 菜单栏空间不足时，系统可能隐藏图标；先退出或收起其他菜单栏应用，再确认 “Oh My Pets” 图标。菜单栏入口无法点击时，不要把自动 smoke 的处理器结果当成人工通过；记录系统版本、显示器布局和是否存在菜单栏管理工具。

如果菜单栏仍不可用，可从已经打开的偏好设置完成低频设置和诊断；产品宠物窗口本身不承载退出或恢复控件。不要通过杀进程作为常规恢复手段；只有已确认属于本次开发会话、且正常退出失效时，才由开发者手动处理该单一进程。

## 日志与诊断

应用的“导出诊断”会把 `oh-my-pets-diagnostics-<timestamp>.md` 写入 Tauri 返回的当前平台应用日志目录，并在界面或桌面 smoke 报告中返回准确路径。摘要包含持久偏好、会话开关和本次启动的偏好健康状态，但不包含偏好文件路径。自动桌面检查可运行：

```bash
pnpm qa:desktop:auto
```

其索引位于 `target/desktop-smoke/report.json`；`diagnostics_export` 项记录实际诊断文件路径。人工桌面报告位于 `target/desktop-smoke/manual-qa.json`。这些文件可能包含本机路径和运行状态，仅用于本地定位，不提交、不上传、不粘贴到公开渠道。若自动检查尚未运行，doctor 对缺少报告只给出 `warn`。

## 安全清理边界

优先重跑最窄的失败命令，不以清理代替诊断。确需重建时，只能由开发者明确选择仓库内可再生目录，例如 `dist/`、`target/` 或 `node_modules/`，并在删除前确认当前路径是本仓库。doctor 永远不执行这些操作。

禁止删除整个 workspace、用户主目录、用户宠物或偏好文件、`assets/`、`research/`、`reference/`、`.scratch/**/spec.md` 或 `.scratch/**/issues/`。默认也不清理全局 pnpm/Cargo 缓存，不改写锁文件，不递归删除宽泛路径。若无法证明某个目录完全可再生，保留它并先收集日志与诊断。
