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

先确认应用进程仍在运行。若菜单栏入口可用，选择“显示宠物”；产品菜单只保留显示／隐藏宠物、打开偏好设置和退出，不再直接放置开发恢复命令。若宠物因显示器布局变化或点击穿透而看似不可用，先从菜单栏打开偏好设置，再从其中的受控入口进入“高级开发预览”，使用重置位置或关闭点击穿透等恢复控制。不要直接删除用户偏好或应用数据来“重置”窗口。

如果真实桌面行为仍异常，运行 `pnpm qa:desktop` 逐项确认启动时只有宠物、焦点保持、Space／普通全屏可见性、菜单栏恢复、偏好设置重建和受控开发入口。该命令需要 macOS 交互式桌面，自动 smoke 不能替代真实点击与视觉确认。

## 菜单栏入口受限

macOS 菜单栏空间不足时，系统可能隐藏图标；先退出或收起其他菜单栏应用，再确认 “Oh My Pets” 图标。菜单栏入口无法点击时，不要把自动 smoke 的处理器结果当成人工通过；记录系统版本、显示器布局和是否存在菜单栏管理工具。

如果菜单栏仍不可用，可从已经打开的偏好设置或高级开发预览完成可用操作；产品宠物窗口本身不承载退出或恢复控件。不要通过杀进程作为常规恢复手段；只有已确认属于本次开发会话、且正常退出失效时，才由开发者手动处理该单一进程。

## 日志与诊断

应用的“导出诊断”会把 `oh-my-pets-diagnostics-<timestamp>.md` 写入 Tauri 返回的当前平台应用日志目录，并在界面事件或桌面 smoke 报告中返回准确路径。自动桌面检查可运行：

```bash
pnpm qa:desktop:auto
```

其索引位于 `target/desktop-smoke/report.json`；`diagnostics_export` 项记录实际诊断文件路径。人工桌面报告位于 `target/desktop-smoke/manual-qa.json`。这些文件可能包含本机路径和运行状态，仅用于本地定位，不提交、不上传、不粘贴到公开渠道。若自动检查尚未运行，doctor 对缺少报告只给出 `warn`。

## 安全清理边界

优先重跑最窄的失败命令，不以清理代替诊断。确需重建时，只能由开发者明确选择仓库内可再生目录，例如 `dist/`、`target/` 或 `node_modules/`，并在删除前确认当前路径是本仓库。doctor 永远不执行这些操作。

禁止删除整个 workspace、用户主目录、用户宠物或偏好文件、`assets/`、`research/`、`reference/`、`.scratch/**/spec.md` 或 `.scratch/**/issues/`。默认也不清理全局 pnpm/Cargo 缓存，不改写锁文件，不递归删除宽泛路径。若无法证明某个目录完全可再生，保留它并先收集日志与诊断。
