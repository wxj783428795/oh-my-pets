# Delivery Readiness Gates

本页定义正式主线关闭检查、桌面 QA 与仓库资产边界。根目录 `pnpm` scripts 是唯一正式入口。

## 验证层级

| 命令                   | 用途                                                            | 能否作为最终关闭证据 |
| ---------------------- | --------------------------------------------------------------- | -------------------- |
| `pnpm verify:core`     | 范围检查、测试、lint、WebView 构建                              | 否                   |
| `pnpm verify`          | `verify:core`、真实 `tauri build`、resolved ticket 关闭证据扫描 | 是                   |
| `pnpm qa:desktop:auto` | 构建真实 Tauri 应用并执行自动 smoke                             | 仅桌面自动化部分     |
| `pnpm qa:desktop`      | 自动 smoke 后启动真实 macOS 交互式人工清单                      | 是，需验收人逐项确认 |
| `pnpm closeout:check`  | 扫描所有 resolved ticket                                        | 是                   |

`pnpm qa:desktop:auto` 的报告写入被 Git 忽略的 `target/desktop-smoke/report.json`，覆盖：

- 真实 Tauri 主窗口启动并可见
- Rust 示例宠物包加载且包含动作与图集帧
- 复用托盘菜单处理器隐藏并恢复窗口
- 真实窗口开启并关闭点击穿透
- 导出并重新读取本地诊断 Markdown

这些检查不模拟 WebView 或窗口状态，但仍不能替代人在真实桌面的判断。`pnpm qa:desktop` 要求验收人确认菜单栏入口真实可见且可点击、示例宠物视觉显示正常、点击穿透体验正确、诊断文件可定位阅读。命令只允许在 macOS（Darwin）交互式终端接受逐项结果，且 Tauri 应用必须成功启动并在问答期间保持运行；记录写入 `target/desktop-smoke/manual-qa.json`，非 macOS、非交互环境或应用提前退出都会失败。

## 仓库边界

| 类别      | 典型路径                                                               | 正式主线关闭范围          |
| --------- | ---------------------------------------------------------------------- | ------------------------- |
| mainline  | `src/`、`src-tauri/`、`assets/`、根配置和文档                          | 包含                      |
| process   | `.scratch/**/spec.md`、`.scratch/**/map.md`、`.scratch/**/issues/*.md` | 包含                      |
| prototype | `.scratch/**/prototypes/`                                              | 排除                      |
| research  | `research/`                                                            | 排除，但保持 Git 可见     |
| reference | `reference/`                                                           | 排除，只读且保持 Git 可见 |
| generated | `.codex/`、`output/`、`target/`                                        | 排除                      |

`.gitignore` 只直接隔离本地报告、输出和 prototype 子树，不整体忽略 `.scratch/`，也不隐藏 `research/` 或 `reference/`。`pnpm scope:check` 优先对当前 staged、unstaged 和未跟踪路径分类；工作树干净时改为检查 HEAD 提交，避免空门禁。发现辅助范围就失败，但不会删除、移动或覆盖任何文件。审查某个 Git 基线后的正式变更时可运行：

```bash
pnpm scope:check -- --base <git-revision>
```

仅查看分类、不阻断时运行 `pnpm scope:report`。
