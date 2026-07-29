# PixiJS 视觉验证与有限 Web E2E

本文说明 `oh-my-pets` 如何在真实 Chromium 中验证 PixiJS 生成的
`<canvas>` 像素，并用少量 Web E2E 覆盖首次加载、可见渲染和失败恢复。
它不覆盖 Tauri 原生窗口、菜单栏、点击穿透、诊断导出或物理桌面交互；
这些行为仍由 `pnpm qa:desktop:auto` 和 `pnpm qa:desktop` 负责。

文中使用以下标记区分证据与项目选择：

- **文档事实**：由所附官方文档、规范或一方源码直接支持。
- **仓库决策**：为满足本仓库验收条件而作出的选择，不声称是上游唯一方案。
- **实现约束**：从上游能力与本仓库风险推导出的具体做法。

## 工具选择与兼容性

### 为什么使用 Playwright Test

**文档事实**：Playwright Test 是面向现代 Web 应用的端到端测试框架，
能驱动 Chromium、Firefox 和 WebKit，并内置断言、隔离、并行和追踪能力。
安装文档同时给出了 pnpm 初始化、运行和浏览器安装方式。
[Playwright Installation](https://playwright.dev/docs/intro)

**文档事实**：Vue 官方将 Vite 作为具有一等 Vue SFC 支持的工具；Vite
官方要求 Node.js `20.19+` 或 `22.12+`。
[Vue Tooling](https://vuejs.org/guide/scaling-up/tooling)；
[Vite Getting Started](https://vite.dev/guide/)

**文档事实**：PixiJS v8 在浏览器中默认使用 `BrowserAdapter`；其 renderer
通过 WebGL/WebGL2 或 WebGPU 向 canvas 绘制。当前 `WebGLRenderer` 是稳定、
推荐的 renderer，`CanvasRenderer` 仍标为 coming-soon。这里的“真实 Canvas”
因此是“真实 Chromium 中由 Pixi WebGL renderer 生成的 `<canvas>` 像素”，
不是 Pixi 的 `CanvasRenderer`。
[PixiJS Environments](https://pixijs.com/8.x/guides/concepts/environments)；
[PixiJS Renderers](https://pixijs.com/8.x/guides/components/renderers)

**仓库决策**：使用 Playwright Test 驱动 Vite 提供的现有 Vue/Pixi 页面，
不引入专属 Vue 或 Pixi 测试运行时。断言对象是浏览器中的实际 canvas 和页面
状态，不用 jsdom、DOM 快照或 mock Pixi 代替像素证据。

### Node、pnpm 与固定版本

**文档事实**：Playwright 当前安装文档列出的受支持 Node.js 是最新
`22.x`、`24.x` 或 `26.x`；`@playwright/test@1.62.0` 一方包元数据的最低
engine 是 Node `>=20`。Vite 则要求 Node `20.19+` 或 `22.12+`。
[Playwright system requirements](https://playwright.dev/docs/intro#system-requirements)；
[`@playwright/test@1.62.0` package metadata](https://github.com/microsoft/playwright/blob/v1.62.0/packages/playwright-test/package.json)；
[Vite Getting Started](https://vite.dev/guide/)

**仓库决策**：固定使用 `@playwright/test` `1.62.0`。本仓库
`engines.node >=22.12.0` 与 Playwright/Vite 在当前 Node 22 LTS 上相交；
但 `>=22.12.0` 这个宽范围本身不代表所有未来或奇数 Node 版本都属于
Playwright 官方支持矩阵。执行视觉门禁时应使用 Playwright 文档列出的当前
LTS 主版本。

**文档事实**：pnpm `--save-exact` 会把依赖保存为精确版本；
`--frozen-lockfile` 不更新 lockfile，并在 manifest 与 lockfile 不同步时失败。
[pnpm add](https://pnpm.io/cli/add#--save-exact--e)；
[pnpm install](https://pnpm.io/cli/install#--frozen-lockfile)

**实现约束**：`package.json` 使用不带 `^` 或 `~` 的
`"@playwright/test": "1.62.0"`，并提交同步后的 `pnpm-lock.yaml`。新增或升级
时使用等价于下列命令的根目录操作，并审阅 manifest 与 lockfile 的差异：

```bash
pnpm add -DwE @playwright/test@1.62.0
pnpm install --frozen-lockfile
```

### 浏览器安装

**文档事实**：每个 Playwright 版本依赖特定浏览器二进制；升级 Playwright
后可能需要重新运行 install。可以只安装一个浏览器，也可在 Linux/CI 同时安装
所需系统依赖。
[Playwright Browsers](https://playwright.dev/docs/browsers)

本仓库只需要 Chromium。日常从根目录使用统一入口：

```bash
pnpm test:e2e:install
```

该 script 会把当前锁定 Playwright 所需的 Chromium 安装到被 Git 忽略的
`target/playwright-browsers/`，不读取用户主目录的浏览器缓存。Linux/CI
缺少系统库时可先用以下 Playwright 低层命令安装系统依赖；浏览器本身仍用
根命令安装：

```bash
# Linux/CI 安装 Chromium 所需系统依赖
pnpm exec playwright install-deps chromium

# 核对锁定的 Playwright 版本
pnpm exec playwright --version
```

浏览器下载物不是仓库资产，不应提交。测试基线必须由相同 Playwright 版本、
浏览器项目和受控运行环境生成。

## 确定性视觉场景

Playwright 官方明确提醒：浏览器截图会受操作系统、浏览器版本、设置、硬件、
电源状态和 headless 模式影响；基线与比较应在相同环境中运行。
[Playwright Visual comparisons](https://playwright.dev/docs/test-snapshots)

固定软件输入可显著减少波动，但不能把不同 GPU/OS 的像素完全等同。因此本仓库
只建立一个 Chromium 视觉项目，不把同一 PNG 基线跨操作系统或浏览器复用。

### 浏览器与页面输入

**文档事实**：Playwright 可显式配置 viewport、`deviceScaleFactor`、locale、
timezone、color scheme 等浏览器上下文输入。
[Playwright Emulation](https://playwright.dev/docs/emulation)

**实现约束**：视觉项目至少固定以下值：

- 固定 viewport，不读取桌面窗口尺寸。
- `deviceScaleFactor: 1`，同时固定 Pixi renderer `resolution`。
- 固定 locale、timezone、color scheme 和 reduced-motion 偏好。
- 只运行固定的 Chromium project；不隐式改用机器上已安装的 Chrome。
- viewport 或 project 变化必须产生独立基线，不能用宽松阈值吸收尺寸差异。

### Pixi renderer、资源和动画

**文档事实**：Pixi `Application.init()` 的 `preference` 默认是 `webgl`，
并可显式设置 `resolution`、`autoDensity`、宽高和抗锯齿等影响像素的选项。
Pixi ticker 使用 `requestAnimationFrame` 驱动，可用 `stop()`/`app.stop()`
暂停；renderer 提供显式 `render()`。
[PixiJS Application](https://pixijs.com/8.x/guides/components/application)；
[PixiJS Ticker](https://pixijs.com/8.x/guides/components/ticker)；
[PixiJS Renderers](https://pixijs.com/8.x/guides/components/renderers)

**文档事实**：Playwright 的 `toHaveScreenshot()` 默认
`animations: "disabled"`，但该选项说明的范围是 CSS animations、CSS
transitions 和 Web Animations。Playwright Clock 可控制 `Date`、timer、
`requestAnimationFrame` 和 `performance`。
[Playwright PageAssertions.toHaveScreenshot](https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-1)；
[Playwright Clock](https://playwright.dev/docs/clock)

**实现约束**：

- 显式选择 Pixi WebGL renderer，并固定 renderer 宽高、resolution、
  auto-density 和抗锯齿配置。
- 产品 `PetRenderer` 在初始化后无条件停止 Pixi ticker，挂载固定宠物包的首帧
  并执行一次显式 render；这三个产品渲染不变量共同固定 canvas 状态。浏览器
  测试 seam 只提供固定宠物包和受控 Tauri 成功/失败输入，不接管渲染器内部。
  `animations: "disabled"` 只能作为 DOM/CSS 兜底，不能被当作已冻结 Pixi
  ticker 的证据。
- 在页面脚本使用时间前安装 Playwright Clock，或通过同一测试 seam 注入固定
  时间；不要先让实时 ticker 运行若干不可控帧再截图。
- 固定示例宠物包、动作、帧、位置和缩放；不得随机挑选资源或读取用户目录。

**文档事实**：Pixi `Assets.load()` 是 Promise-based，并在 Promise 完成时返回
已加载资源；纹理加载后仍可能需要解码和上传 GPU。
[PixiJS Assets](https://pixijs.com/8.x/guides/components/assets)；
[PixiJS Textures](https://pixijs.com/8.x/guides/components/textures)

**实现约束**：视觉场景只引用仓库内提交的固定宠物包与图集。应用在资源加载、
纹理解码/准备、场景组装和最终显式 render 完成后暴露明确的 ready 状态；
测试等待该状态，不使用任意 `sleep` 猜测加载完成时间。测试不得访问 CDN、
`research/`、`reference/`、prototype 或未跟踪文件。

### 字体

**文档事实**：Pixi 支持通过 `Assets` 加载仓库内的 WOFF/WOFF2/TTF/OTF；
CSS Font Loading 规范的 `document.fonts.ready` 在文档字体加载和相关布局操作
完成后兑现。
[PixiJS Text font loading](https://pixijs.com/8.x/guides/components/scene-objects/text/canvas#font-loading)；
[CSS Font Loading Module Level 3](https://www.w3.org/TR/css-font-loading/)

**实现约束**：视觉区域若包含文字，使用提交到仓库的固定 WOFF2，不依赖系统
字体，并在截图前同时等待字体资源加载与 `document.fonts.ready`。当前基线只
截取固定 attribute/CSS 尺寸的 Pixi canvas；canvas 内没有文字，页面文字也不
进入截图且不能改变 canvas 尺寸，因此系统字体不参与本基线像素。若未来把 DOM
文字纳入视觉范围，必须先提交固定字体并等待 ready。

## 截图比较、基线与失败证据

**文档事实**：`expect(page).toHaveScreenshot()` 或 locator 版本会等待连续两张
截图稳定后与参考图比较。Playwright 的 `updateSnapshots` 默认是 `missing`，
会创建缺失基线；设置为 `none` 才能让普通运行完全禁止更新。
[Playwright Visual comparisons](https://playwright.dev/docs/test-snapshots)；
[Playwright TestConfig.updateSnapshots](https://playwright.dev/docs/api/class-testconfig#test-config-update-snapshots)

**仓库决策**：常规配置必须写明：

```ts
export default defineConfig({
  updateSnapshots: "none",
});
```

普通测试只比较，缺少或不匹配基线都失败：

```bash
pnpm test:e2e
```

只有显式更新命令可以传入 `--update-snapshots=changed`：

```bash
pnpm test:e2e:update
```

更新后必须人工查看 PNG 与 `git diff`，只提交稳定的 expected 基线。`actual`、
`diff`、HTML report、trace、浏览器缓存和其他运行结果一律进入既有本地输出
边界，不提交。

**文档事实**：Playwright 1.62.0 的一方 matcher 源码在截图不匹配时把
`-expected`、`-actual`、`-diff` 写入测试 output 目录并作为附件加入报告；
HTML/UI 报告支持查看 image diff、actual 和 expected。
[`toMatchSnapshot.ts` at v1.62.0](https://github.com/microsoft/playwright/blob/v1.62.0/packages/playwright/src/matchers/toMatchSnapshot.ts)；
[Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer)

**实现约束**：Playwright `outputDir` 和 HTML report 必须指向仓库现有的
`target/` 本地输出边界，并保留失败输出。定位失败时先看 actual/diff/expected，
再按需打开 report：

```bash
pnpm exec playwright show-report target/playwright/report
```

报告中的 trace 可继续用于检查页面、网络、错误和动作时序。不得通过自动接受
基线、遮罩整个 canvas 或放宽像素阈值来消除真实差异。

## 有限 Web E2E

**文档事实**：Playwright `webServer` 可以在测试前启动本地开发服务器，
`baseURL` 可用于相对导航。Vite 端口被占用时默认尝试下一个端口，而
`strictPort: true` 会直接失败。
[Playwright Web server](https://playwright.dev/docs/test-webserver)；
[Vite server.port and server.strictPort](https://vite.dev/config/server-options.html#server-port)

**实现约束**：由 Playwright `webServer` 启动根目录 Vite 命令，绑定固定
loopback host 和固定端口，并启用 strict port；不得复用来源不明的已有服务。
`pnpm dev:web:e2e` 是供 Playwright `webServer` 调用的内部根 script，
不是独立的验收命令。测试只覆盖以下三件事：

1. 首次导航后应用进入 ready 状态。
2. 示例宠物在真实 Chromium 的 Pixi canvas 中可见，并通过至少一个实际像素
   基线证明 renderer 输出。
3. 一条受控加载失败后的恢复，或页面 reload 后重新进入 ready 且宠物可见。

这不是完整用户旅程矩阵。不要在该套件重复托盘、原生窗口恢复、透明窗口合成、
点击穿透、诊断导出或 macOS 菜单栏断言。

### Tauri seam 的边界

**文档事实**：Tauri 的 `mockIPC` 可拦截 IPC 并模拟后端结果，但官方明确说明
该 mock 下没有真实 webview 或 Rust backend 运行。
[Tauri Mock APIs](https://v2.tauri.app/develop/tests/mocking/)

**仓库决策**：浏览器测试若需要 Tauri 输入，只能通过一个显式、可清理、默认
关闭的适配 seam 提供固定返回值或固定失败。测试名称和关闭证据必须称其为
“Web/UI E2E”或“renderer E2E”，不得称为 Tauri/native E2E。该 seam 证明前端
面对受控 IPC 结果的行为，不证明真实 Rust command、WKWebView、窗口系统或
操作系统集成；后者仍由桌面构建与 QA 命令覆盖。

## 维护检查表

新增或修改视觉场景时：

1. 确认场景使用提交的本地资源和字体，不访问网络或用户目录。
2. 确认 viewport、DPR、renderer 配置、时间、ticker、动作帧和字体 ready
   状态均固定。
3. 先运行普通比较；确需更新时才运行显式 snapshot update。
4. 人工查看新 expected 与失败时的 actual/diff，确认变化符合需求。
5. 保持 Web E2E 数量有限，并确认没有侵入 P0 原生 desktop smoke 的职责。
6. Playwright 升级时同时更新精确版本、lockfile 和 Chromium 安装，并在相同
   环境审阅是否需要重新生成基线。
7. 最后相关改动后运行 `pnpm test:e2e`，再运行包含该稳定浏览器检查的
   `pnpm verify`。

上游版本、支持矩阵或截图行为变化时，应先复核本文链接的一方资料，再更新
依赖、命令和基线；不要根据未锁定的 `latest` 隐式改变视觉环境。
