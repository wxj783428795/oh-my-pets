# 搭建 macOS 预览版主线最小骨架

Type: task
Status: resolved

## Question

在不承诺双平台 `外部 Alpha`、也不扩张到完整产品功能的前提下，如何搭建一个只面向 `macOS 预览版` 的正式主线骨架？请把范围限制在能够验证主线工程结构、示例宠物包加载、基础窗口恢复能力和本地诊断导出入口的最小实现，不要把 Windows 适配、自动更新或复杂权限能力一起打包开工。

## Comments

- 2026-07-28：正式主线实现已使用中文提交 `搭建 macOS 预览版主线骨架` 提交，提交为 `8ad7fc4030ae14ce90bf3bc93233e1a2675b8a1e`。自动验证、人工验收、Standards + Spec 双轴 review 和提交记录均已完成，本票按 Definition of Done 关闭为 `resolved`。
- 2026-07-28：第十轮 Standards + Spec 双轴 review 同时通过，两轴阻塞项均为 `0`。Standards 确认第九轮四项阻塞均已关闭，未发现新的安全、正确性、资源、生命周期或异步入口问题；Spec 确认 revision loading、图像格式真实性、actions 轻量快照和监听失败恢复均符合范围，scope creep 为 `0`。非阻塞遗留为 `App.vue`/`src-tauri/src/lib.rs` 职责偏多与轻微加载流程重复、未知嵌套非关键字段未完整保留、非方形画布视觉拉伸风险；不阻塞当前 macOS 预览版最小主线。
- 2026-07-28：按第九轮 Standards 四项 findings 完成逐切片修复。revision loading 测试先证明较新 `2.0.0` 已挂载但旧按钮请求未返回时行为入口仍禁用，再用 operation ID 集合让已接受 revision 只保留自身加载操作，旧操作完成不再影响 loading。伪装图集测试先证明名为 `atlas.png` 的 1×1 GIF 被错误作为 `image/png` 加载，再以字节签名和扩展名对应的 `ImageType` 双重校验拒绝。Store 测试先因缺少 `behavior_actions` 无法编译，再让行为 IPC 只克隆声明式 actions，不再克隆图集字节。监听注册测试先同时证明首个 unlisten 调用为 `0` 且 mounted hook 未处理拒绝，再改为逐项即时入栈、失败/卸载统一清理，并在工作台展示启动错误、结束 loading。
- 2026-07-28：本轮修复后 `pnpm test` 通过：Rust `23` 项、前端 `28` 项，共 `51` 项；`pnpm lint`、`pnpm build:web` 和领域层 `x86_64-pc-windows-msvc` 的 `cargo check --tests` 全部通过。仍需重新执行双轴 review，本票保持 `claimed`。
- 2026-07-28：第九轮双轴 review 中 Spec 轴通过、阻塞项 `0`；Standards 轴一次性发现 `4` 个阻塞项：过期加载长期挂起会让全局 loading 计数持续禁用行为入口；图像只按扩展名决定 MIME，伪装 PNG/WebP 的 JPEG/GIF 内容可通过领域校验却在 Pixi 解码失败；行为 IPC 的 Store snapshot 每次克隆包含最多 32 MiB 图集字节的完整宠物包；原生监听器批量注册中途失败会丢失此前 unlisten，且启动异常未展示。四项分别沿用 App/revision、`load_pet_pack`、`PetPackStore` 和 App/native event 已确认 seam 逐切片处理。第八轮 native drop finding 已确认关闭；非阻塞 smell 与 Spec 遗留不变。
- 2026-07-28：按第八轮 Standards finding 完成原生文件拖放加载期门禁 red -> green。挂起成功重载期间模拟 drop 的测试先证明会发出 `trigger_preview_action(feed_react)`，再把 `pack/loading` 门禁下沉到 `triggerAction`；追加用户状态断言后又证明虽然 IPC 已被阻止，界面仍伪报“收到 1 个文件投喂”，最终把同一门禁前移到 drop 状态写入前。修复后既不发旧动作，也不伪报接收。`pnpm test` 通过：Rust `21` 项、前端 `26` 项，共 `47` 项；`pnpm lint`、`pnpm build:web` 和领域层 Windows 目标检查全部通过。
- 2026-07-28：第八轮双轴 review 中 Spec 轴通过、阻塞项 `0`；Standards 轴发现加载期门禁仍漏掉原生文件拖放入口：drop 事件直接调用 `triggerAction`，成功重载挂载期间仍可把动作发往已清空渲染器。需沿用 App/native event seam 补挂载期间 drop 回归，并把 `loading` 门禁下沉到行为函数。其余非阻塞遗留不变。
- 2026-07-28：按第七轮 Standards finding 完成加载期行为入口 red -> green。成功菜单重载进入挂起 Pixi mount 的测试先证明“运行最小时间线”“点击反馈”“模拟投喂”三个按钮均未禁用，再把既有 `loading` 状态加入三个入口的禁用条件；停止时间线入口仍保持可用。修复后 `pnpm test` 通过：Rust `21` 项、前端 `25` 项，共 `46` 项；`pnpm lint`、`pnpm build:web` 和领域层 Windows 目标检查全部通过。
- 2026-07-28：第七轮双轴 review 中 Spec 轴通过、阻塞项 `0`；Standards 轴仍有 `1` 个 P2 交互竞争阻塞：成功重载已进入 Pixi 挂载但尚未完成时，旧 `pack` 仍使行为入口可用，动作 IPC 可通过现有 token 门禁却落到已清空的渲染器，持续时间线还可能重复请求。需在加载/挂载期间禁用并拒绝行为交互，补成功重载挂起回归测试。第六轮 rejected Promise 覆盖已确认关闭；非阻塞遗留不变。
- 2026-07-28：按第六轮 Standards 测试质量 finding，补充挂起时间线 IPC 与挂起一次性交互 IPC 在宠物包失败清场后晚返回 rejected Promise 的两条回归测试；两条测试直接通过，因为对应过期失败 guard 已在第五轮成功分支切片中同步实现。本记录不把既有实现后的绿色补覆盖伪称为新的 red -> green 循环。补测后 `pnpm test` 通过：Rust `21` 项、前端 `24` 项，共 `45` 项；`pnpm lint`、`pnpm build:web` 和领域层 Windows 目标检查全部通过。
- 2026-07-28：第六轮双轴 review 中 Spec 轴通过、阻塞项 `0`；Standards 轴仍有 `1` 个 P2 测试质量阻塞：持续时间线和一次性交互仅直接覆盖过期 IPC 的成功返回，未分别覆盖过期 rejected Promise。`App.vue` 与 `src-tauri/src/lib.rs` 职责偏多继续记为非阻塞 Divergent Change；未知嵌套非关键字段未完整保留与非方形画布视觉风险继续为 Spec 非阻塞遗留。
- 2026-07-28：按第五轮 review findings 完成三组 red -> green。任意深度 `command`、`plugin`、`nativeHook` 测试先证明首个 `command` 被当作 warning 且宠物包成功加载，再扩充宿主行为字段黑名单并逐项拒绝。Pixi 微任务竞争测试先稳定得到旧场景帧 `0`，证明 `clear()` 可在图集加载完成后仍被旧 mount 复活，再于创建子纹理和精灵前二次校验 mount 代次。App 持续时间线与一次性交互测试分别先证明挂起 IPC 会在宠物包失败清场后覆盖较新错误并触发旧播放，再用行为交互 token 在成功和失败返回处共同丢弃过期结果。
- 2026-07-28：本轮修复后 `pnpm test` 通过：Rust `21` 项、前端 `22` 项，共 `43` 项；`pnpm lint`、`pnpm build:web` 和领域层 `x86_64-pc-windows-msvc` 的 `cargo check --tests` 全部通过。仍需重新执行双轴 review，本票保持 `claimed`。
- 2026-07-28：第五轮双轴 review 未通过。Standards 轴发现两个 P1 异步竞争：`PetRenderer.mount` 在图集加载返回后、建场景前缺少第二次代次检查，`clear/destroy` 仍可能被旧 mount 复活；行为 IPC 返回后没有交互代次检查，宠物包失败清场后可能回写旧动作状态。Spec 轴发现任意深度宿主行为字段黑名单仍缺少 `command`、`plugin`、`nativeHook`，这些字段当前只产生 warning 而不拒绝。三项均落在已确认的 `load_pet_pack`、`PetRenderer.mount/clear/destroy` 与 App 交互 seam 内，继续逐切片 TDD；`App.vue` 职责偏多、未知嵌套非关键字段未完整保留和非方形画布视觉风险继续记为非阻塞遗留。
- 2026-07-28：按第四轮 review findings 完成 red -> green。App 先用回归测试稳定复现旧 revision 的 Pixi 挂载晚失败会清空较新 `3.0.0`，再让 `mountPack` 把渲染错误绑定到发起 payload 的 revision 并忽略已过期拒绝；旧菜单双失败事件测试先证明 `shell-operation-failed` 仍会污染较新状态，再让两类失败事件共用 revision 门禁。`PetPackStore` 测试先因缺少 `is_latest_revision` 无法编译，再补只读查询；原生托盘据此抑制旧重载的成功/失败标记和第二次壳错误，沿用已批准的不注入原生菜单故障例外。同 data URL 并发回归另确认旧挂载完成时不会卸载最新场景仍在使用的 Pixi 资源。
- 2026-07-28：本轮修复后 `pnpm test` 通过：Rust `20` 项、前端 `19` 项，共 `39` 项；`pnpm lint`、`pnpm build:web` 和领域层 `x86_64-pc-windows-msvc` 的 `cargo check --tests` 全部通过。仍需重新执行双轴 review，本票保持 `claimed`。
- 2026-07-28：第四轮双轴 review 仍未通过。Spec 与 Standards 均发现：旧 revision 已进入 Pixi 挂载后若晚失败，普通 JS Error 不携带 revision，App 会把它当当前失败并清空较新成功场景。Standards 另发现：旧菜单失败的 `pet-pack-load-failed` 虽会按 revision 忽略，但随后 `shell-operation-failed` 仍无条件覆盖 WebView 状态，原生托盘也会被旧失败标成 `卷!`；需在 WebView 与 Rust 托盘两端统一抑制过期 revision。缺少同 data URL 并发加载回归测试作为非阻塞测试建议。上述问题均属于已确认的 App/revision 与 PetRenderer 资源 seam，不新增测试边界；处理前 review 继续保持未完成。
- 2026-07-28：按第三轮确认 seam 完成两组 Standards blocker 的逐切片 red -> green。`PetPackStore` 测试先因缺少 `begin_reload/revision` 无法编译，再验证新成功后旧失败不能清空、新失败后旧成功不能恢复；Rust 在重载开始时分配 revision，Store 只应用最新已开始操作，成功 payload 与失败 error 均携带 revision。App 反向乱序测试先稳定停在旧菜单 `2.0.0`，再改为按 Rust revision 决胜，使后返回的新按钮 `3.0.0` 正确生效，原有正向乱序测试继续通过。Pixi 当前场景测试先证明 `Assets.unload` 调用为 `0`，再建立激活 URL 所有权；过期挂载测试先证明旧 data URL 未卸载，再以 URL 级在途计数和卸载 Promise 确保仅释放不再使用的缓存；挂起初始化销毁测试先证明 `Application.destroy` 调用为 `0`，再以终止态在初始化完成后补做且仅做一次销毁。
- 2026-07-28：上述修复后 `pnpm test` 通过：Rust `20` 项、前端 `16` 项，共 `36` 项；`pnpm lint`、`pnpm build:web` 和领域层 `x86_64-pc-windows-msvc` 的 `cargo check --tests` 全部通过。仍需重新执行双轴 review，本票保持 `claimed`。
- 2026-07-28：用户确认第三轮 Standards 阻塞项的测试 seam：扩展公开 `PetPackStore` revision seam，验证 Rust 在重载开始时分配 revision 且旧操作的成功或失败均不能覆盖新 revision；沿用 `App.vue` 交互 seam，验证菜单与按钮携带 Rust revision 后双向乱序都保留较新操作；扩展 `PetRenderer.mount/clear/destroy` 资源 seam，验证过期或清空的 data URL 调用 `Assets.unload`，并验证初始化挂起时销毁会在初始化完成后释放 Pixi Application。后续继续逐切片 red -> green。
- 2026-07-28：第三轮双轴 review 中 Spec 轴通过、阻塞项为 `0`，确认深层禁止字段、失败清场、快照图像、乱序重载、菜单挂载反馈、托盘原生错误标记、版本、重置位置与 `loop:false` 均符合当前 macOS 预览版规格；未知嵌套非关键字段未完整保留和非方形通用画布可能被方形容器拉伸记录为非阻塞遗留。Standards 轴仍未通过：当前前端 token 按结果到达顺序处理菜单事件，无法表达 Rust 菜单操作与按钮操作的真实发起先后，反向乱序仍可能判错；Pixi `Assets` 缓存原图未卸载，data URL 变化会积累资源，且初始化挂起时调用 `destroy` 不会在初始化结束后补做销毁。两项处理前 review 保持未完成。
- 2026-07-28：按确认 seam 完成本轮四个阻塞项的逐切片 red -> green。深层禁止字段测试先证明动作帧未知对象中的 `metadata.nested.script` 会被错误接受，再改为类型反序列化前递归检查原始 JSON 树；快照图像测试先因 `LoadedPetPack` 缺少图像资产而编译失败，再让领域层返回已校验字节并由 Tauri 编码 data URL；并发挂载测试先稳定显示旧请求帧，再以挂载代次和共享初始化 Promise 保证最新请求生效；App 乱序重载测试先从 `2.0.0` 回退为旧 `1.5.0`，再以加载代次阻止过期结果写回；`PetRenderer.clear` 测试先失败于方法不存在，App 失败测试再失败于清理调用为 `0`，随后统一清空 Pixi 场景和失败状态。未知嵌套非关键字段未完整保留与模块职责偏多继续作为非阻塞遗留，不在本轮安全/正确性修复中扩张。
- 2026-07-28：本轮修复后 `pnpm test` 通过：Rust `19` 项、前端 `14` 项，共 `33` 项；`pnpm lint`、`pnpm build:web` 和领域层 `x86_64-pc-windows-msvc` 的 `cargo check --tests` 全部通过。双轴 review 仍需重新执行，本票继续保持 `claimed`。
- 2026-07-28：最新一轮 Standards + Spec 双轴 review 未通过。Standards 轴发现：图集校验后仍由前端静态 URL 重新读取，TOCTOU 尚未闭合；按钮与菜单栏可并发重载，异步 Pixi 挂载缺少代次控制。Spec 轴发现：已知结构内的未知嵌套对象仍可藏入 `script`；Rust 校验在进入 `mount` 前失败时旧 Pixi 场景不会清空。`App.vue` 与 `src-tauri/src/lib.rs` 职责偏多继续作为非阻塞 Divergent Change 建议，未知嵌套非关键字段未完整保留作为非阻塞兼容性遗留。上述阻塞项处理前不勾选 review。
- 2026-07-28：用户确认本轮四个 TDD 测试 seam：沿用 `load_pet_pack` 公共 seam 验证任意层级禁止字段和快照图像字节；沿用 `PetRenderer.mount` 公共 seam 验证并发挂载仅最新请求生效；新增 `PetRenderer.clear` 公共 seam 验证 Rust 重载失败时清空旧场景；沿用 `App.vue` 交互 seam 验证过期重载结果不能覆盖较新的菜单栏结果。后续按逐切片 red -> green 修复。
- 2026-07-28：用户明确批准两项复审修复的 TDD 例外。其一，宠物包文件系统 TOCTOU 加固不编写依赖竞态时序的脆弱测试，改用 no-follow 目录能力句柄、同一文件句柄上的元数据与硬链接检查、单次受限读取形成内存快照，后续 JSON、文件声明和图片尺寸校验只消费该快照；现有 `load_pet_pack` 公共 seam 回归测试继续覆盖正常加载、符号链接、硬链接和外部路径拒绝。其二，隐藏 WebView 时的托盘操作失败不注入难以稳定构造的原生窗口 API 故障，改为在现有 WebView 事件之外把托盘标题改为 `卷!` 并更新 tooltip，下一次成功操作恢复正常标题；由编译、静态复审和人工可观察行为作为补偿证据。
- 2026-07-28：按首次复审新增 findings 继续修复。用户确认新增公开测试 seam 为 `PetPackStore` 原子状态快照，托盘错误与菜单重载挂载失败继续使用 `App` DOM seam；同时明确批准目录项迭代错误这一处 TDD 例外，不为难以稳定构造的 OS 级 `read_dir` 单项错误引入文件系统 mock，改由逐项 fail-closed 实现和复审确认。其余修复均留下 red -> green 证据：根目录符号链接在读取前拒绝；动作帧内 `script` 被拒绝；失败重载原子清除旧 Rust 包状态；菜单重载等待 Pixi 挂载结果；托盘操作失败通过 `shell-operation-failed` 展示。职责拆分仍作为非阻塞后续建议，本票不扩张重构。
- 2026-07-28：上述修复后 `pnpm test` 通过：Rust `17` 项、前端 `9` 项，共 `26` 项；`pnpm lint`、`pnpm build:web` 通过；领域层额外通过 `x86_64-pc-windows-msvc` 的 `cargo check --tests`，确认稳定 Win32 硬链接检测可以跨目标编译。双轴 review 尚待重新执行，因此本票继续保持 `claimed`。
- 2026-07-28：完成首轮 Standards + Spec 双轴 review，但存在阻塞性发现，review 尚未通过。Standards 轴：宠物包路径在安全校验前被读取且未拒绝硬链接；画布、帧数与动作总时长缺少上限/溢出保护；PixiJS 渲染器忽略非循环动作语义；另有桌面壳与工作台模块职责过多的非阻塞建议。Spec 轴：重置位置在窗口完全离屏时可能无法找到显示器；宠物包重载失败会保留旧包并继续显示“校验通过”；摘要缺少持久版本展示。上述行为问题处理前不勾选 review，不进入提交。
- 2026-07-28：宠物包重新加载与诊断导出人工复验通过。用户确认重新校验后仍加载 `15` 个动作，界面显示本地 Markdown 路径；只读检查确认最新诊断文件已写入应用日志目录，包含版本、`macos aarch64`、点击穿透、窗口状态和卷卷摘要。至此本票要求的人工恢复验收全部通过。
- 2026-07-28：点击穿透人工复验通过。用户确认开启后窗口不再响应点击或拖动，并可从菜单栏选择“关闭点击穿透”恢复窗口交互。
- 2026-07-28：窗口隐藏与菜单栏召回人工复验通过。应用右上角“收起”经 Issue 09 修复后可以隐藏预览工作台，左键点击可见的菜单栏“卷”可以恢复窗口；菜单栏拥挤时状态项可能落入刘海遮挡区，按已确认规格作为平台限制记录。
- 2026-07-28：窗口恢复人工 QA 报告两个阻塞观察项：点击“收起”后窗口不隐藏；macOS 菜单栏没有出现“卷”入口，无法继续验证菜单栏召回。已分别登记为 Issue 09 与 Issue 10。后续只读诊断中，Issue 09 在 agent 真实点击回路下未复现；Issue 10 确认为状态项已创建但落入当前内建屏幕的中央刘海遮挡区。本票保持 `claimed`，等待两张 bug 票收口并复验。
- 2026-07-28：拖动柄人工复验通过。用户确认右上角专用拖动入口可见，并可实际拖动 Tauri 窗口；此前观察项已修复。
- 2026-07-28：针对“界面没有可见拖动柄”的观察项，用户确认以 Vue 界面到 Tauri Window API 的公共交互边界作为测试 seam。先新增测试并两次确认 red 均稳定失败于缺少 `button[aria-label="拖动窗口"]`，再添加专用拖动柄及 `startDragging()` 最小实现转绿；随后 `pnpm test`（Rust `8` 项、前端 `3` 项，共 `11` 项）、`pnpm lint` 和 `pnpm build:web` 全部通过。拖动柄的可见性和实际窗口拖动仍待人工复验。
- 2026-07-28：流程复核发现，此前产品代码实施没有留下按已确认测试 seam 逐切片执行 `red -> green` 的记录，因此不能声称本票已按 TDD 实施；现有测试结果仅作为事后自动化验证证据。按工程流程不伪造历史，后续任何产品代码修复或补充均须先确认测试 seam，再按 TDD 推进。
- 2026-07-28：本地人工验收窗口恢复部分完成。用户确认 `重置位置` 生效；同时反馈界面没有可见拖动柄，记为待判断的体验观察项；菜单栏召回尚未测试，因此第二组人工验收仍未通过。
- 2026-07-28：本地人工验收第一组通过。用户确认主线窗口正常出现，卷卷、宠物包摘要与 `15` 个动作可见，“运行最小时间线”会持续切换当前语义动作。
- 2026-07-28：按项目工程流程重新打开。本票尚缺本地人工窗口验收、Standards + Spec 双轴 code review 和正式提交；完成这些门槛前保持 `claimed`。
- 2026-07-28：正式主线最小骨架已实现并完成自动化验证；未扩张到 Windows、正式打包、自动更新或外部分发。
- 2026-07-28：已按本地 issue tracker 规则领取，正式开始实施 macOS 预览版主线最小骨架。
- 本 ticket 是规划与低成本验证阶段之后的第一张实施入口票，不属于 `.scratch/oh-my-pets-p0-alpha/` 里前七张 `grilling/prototype` 决策票的延续实现。
- 前置决策已足够开工：
  - `Issue 02` 已锁定 `Tauri 2 + Rust + PixiJS` 的主线架构
  - `Issue 03` 已确认 `macOS 预览版` 可以进入实现，但不能声称 Windows 壳已验收
  - `Issue 04` 已锁定宠物包边界
  - `Issue 05` 与 `Issue 07` 已把当前阶段定义为 `macOS 预览版`
  - `Issue 06` 已给出首发宠物内容方向
- 范围必须收紧，避免再次越过阶段边界。第一轮实施只服务于 `macOS 预览版`，不负责完成双平台正式 Alpha。

## Answer

建议把第一轮实施范围锁成下面这组最小交付：

1. 正式主线工程结构

- 建立仓库根目录的正式工具链入口，而不是继续复用 throwaway 样机目录。
- 主线至少拆成：
  - Rust 领域层
  - Tauri 壳
  - 最小前端工作台或预览界面

2. 宠物包链路

- 能从正式主线读取一个示例宠物包
- 能做基础校验并返回明确错误
- 能在界面上显示最小的宠物包摘要，而不是只在终端打印

3. 最低恢复能力

- 菜单栏或托盘恢复入口
- `重置位置`
- `关闭点击穿透`
- `重新加载示例宠物包`
- `导出诊断摘要` 的入口占位

4. 明确不做

- 不做 Windows 适配
- 不做自动更新
- 不做完整权限引导
- 不做多宠物
- 不做正式发布打包
- 不做真实外部用户分发

5. 完成标准

- 从仓库根目录可以用统一命令启动主线
- 在 macOS 14+ Apple Silicon 上能打开主线窗口
- 能加载示例宠物包并驱动最小行为时间线
- 已知平台约束在界面或文档里写明，尤其是“整窗点击穿透与系统级文件拖放不能共存”

这张票完成后，仓库才算真正进入“正式主线已开始实现”的阶段；在它之前，所有结论都仍然属于规划与验证，而不是产品主线。

## Implementation Result

已按本票范围完成第一轮正式主线：

- 根目录建立 Cargo workspace 和唯一的 `pnpm` 工具链入口；`pnpm dev` 会启动 Vite 并运行 Tauri 主线。
- `src/pet-domain/` 建立 Rust 宠物包领域层，校验路径、文件白名单、schema、版本、必填语义动作、禁止行为字段、帧引用、图集边界和实际图片尺寸，并返回结构化问题。
- `src-tauri/` 建立 macOS 预览壳，提供菜单栏召回、重置位置、关闭点击穿透、重新加载示例宠物包和导出本地诊断摘要。
- `src/ui/` 建立 Vue 3 工作台和 PixiJS 预览器；Rust 选择语义动作，WebView 内部负责逐帧渲染，没有逐帧 IPC。
- `assets/pets/juanjuan/` 提供符合 P0 声明式边界的卷卷示例包。当前图集明确是单帧工程占位资源，不代表 `Issue 06` 的约 86 帧首发内容已经完成。
- 界面与 `README.md` 已明确写出“整窗点击穿透与系统级文件拖放不能共存”，点击穿透默认关闭，菜单栏保留恢复入口。

验证结果：

- `pnpm test` 通过：Rust 领域层、包状态、窗口恢复、行为时间线和正式示例包 `23` 个测试通过，前端 `28` 个测试通过，共 `51` 个。
- `pnpm lint` 通过：`cargo fmt --check`、Clippy `-D warnings` 和 Vue TypeScript 检查全部通过。
- `pnpm build:web` 通过。
- Rust 领域层通过 `x86_64-pc-windows-msvc` 的 `cargo check --tests`；这只证明目标级编译，不代表 Windows 壳或 Windows 人工验收。
- `pnpm dev` 在当前 macOS Apple Silicon 环境中两次完成 `Vite -> cargo run -> target/debug/oh-my-pets` 启动链路，进程持续运行且无启动期错误。
- 自动桌面控制无法把未打包的 Tauri 开发二进制识别为可寻址应用，因此本轮没有自动窗口截图；这不扩张为正式视觉验收结论。

## Remaining Acceptance

- [x] 在本地窗口中人工验证启动、宠物包摘要、行为时间线和 PixiJS 预览。
- [x] 人工验证菜单栏召回、重置位置、关闭点击穿透、重新加载宠物包和诊断导出。
- [x] 完成 Standards + Spec 双轴 code review，并处理阻塞性发现。
- [x] 使用中文提交信息形成正式提交，并把提交记录写回本票。

当前实现结果保留，但在上述门槛完成前，本票不表示“macOS 预览版最小主线骨架”已经关闭，更不表示完整首发宠物内容、正式安装包、Windows 壳或双平台外部 Alpha 已完成。
