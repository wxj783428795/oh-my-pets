# Branch Management

本页是仓库分支、Pull Request 和合并策略的正式规范。所有产品代码、工程配置、
测试、正式文档和 `.scratch` 流程资产变更都必须遵守；接入 GitHub CI 后，
本地验证继续提供快速反馈，GitHub Pull Request 上的 required check 才是进入
受保护目标分支的远端门禁。

## 核心原则

1. `main` 是唯一永久主线，必须始终保持已验证、可集成和可作为新工作的基线。
   它记录已经交付的产品事实和已经生效的工程治理，不接收尚未获准实施或尚未
   达到交付条件的产品规划。
2. 正常变更不得直接提交或 push 到 `main`、`integration/*` 等受保护分支。
3. 一张实施 ticket 对应一个主要实施分支和一个主要 Pull Request；无关改动
   不得夹带。bugfix 向其他受影响维护线前向同步时，可以建立额外同步 PR，但
   必须回链原 bug ticket。
4. 规划阶段使用短期 `codex/plan-<effort>` 隔离；规划获准实施后，独立且完成
   后即可交付的小票以 `main` 为目标，跨多票且中间状态不适合进入 `main` 的
   accepted spec 使用临时 `integration/<spec>`。
5. 分支依赖必须通过 ticket、spec 和 Pull Request 的 base 显式表达，禁止靠
   ticket 分支互相合并形成不可见的依赖链。
6. 所有受保护目标分支使用相同的最终 CI 门禁；验证通过 Pull Request 在合并前
   完成，合并后的目标分支 push 不重复运行相同验证，必要时使用手动触发复查。
7. 流程例外必须获得用户明确批准，并记录原因、范围、风险和补救验证。

## 分支类型

| 分支                             | 生命周期 | 创建基线                     | 接收什么                                     | 结束条件                   |
| -------------------------------- | -------- | ---------------------------- | -------------------------------------------- | -------------------------- |
| `main`                           | 永久     | 不适用                       | 已完成专题、独立小票、bugfix 和流程变更的 PR | 不删除、不重写             |
| `codex/plan-<effort>`            | 短期     | 最新 `main`                  | 研究结论、决策、spec 和 ticket               | 规划迁移或取消后删除       |
| `integration/<spec>`             | 临时     | 最新 `main`                  | 已接受规划和同一 spec 的 ticket PR           | 最终 PR 合入 `main` 后删除 |
| `codex/<effort>-<ticket>-<slug>` | 短期     | 对应 `main` 或 integration   | 一张 agent 实施 ticket                       | PR 合并后删除              |
| `codex/fix-<ticket>-<slug>`      | 短期     | 缺陷实际存在的目标分支       | 普通 bugfix                                  | PR 合并后删除              |
| `codex/hotfix-<ticket>-<slug>`   | 短期     | 最新 `main` 或受支持 release | 紧急生产／候选版修复                         | PR 合并并前向同步后删除    |
| `codex/docs-<slug>`              | 短期     | 最新目标分支                 | 独立文档或流程改动                           | PR 合并后删除              |
| `release/<version>`              | 按需     | `main`                       | 已进入并行稳定期的发布线修复                 | 对应版本停止维护后删除     |

当前没有长期 `develop` 或 `release/*`。只有出现“稳定当前发布候选，同时必须在
`main` 开发下一版本”的真实需求后，才能通过独立决策引入 `release/*`；不得为了
形式完整预建长期分支。

所有 agent 创建的普通工作分支使用 `codex/` 前缀。名称使用小写短横线，包含
effort 或 ticket 标识和可识别的短 slug；禁止使用 `tmp`、`test`、`new` 等无法
说明归属的名字。

## 规划成熟度与分支转换

规划分支和 integration 表达不同成熟度，不是两条并行主线：

- `codex/plan-<effort>` 只承载 grilling、wayfinder、研究结论、ADR 草案、spec、
  map 和 tickets，不实施正式产品功能。多会话规划应提交到该分支；需要远端备份
  时可以 push，但在尚未批准实施时不得以 `main` 为合并目标。
- worktree 只提供工作目录隔离，不承载流程状态。规划是否存在、是否被接受和
  是否已经迁移，必须由分支、提交以及 spec/ticket 状态表达。
- 规划尚未收口、仍有会改变实现方向的问题，或用户尚未批准实施时，不创建
  `integration/*`，也不把规划资产提前合入 `main`。
- 规划获准后，先按工作规模选择交付路径，再结束 planning 分支。不得同时长期
  维护 planning 和 integration，也不得让 ticket 分支持续依赖 planning 分支。

独立小票或单会话小改动直接交付到 `main` 时：

1. 从最新 `main` 创建正式实施分支。
2. 将已接受的纯规划提交明确迁移到实施分支，与实现和验证一起进入同一个
   Pull Request；不得直接在 planning 分支上继续实现。
3. 确认迁移完整后删除 planning 分支。

跨多票且中间状态不可交付时：

1. 只有在 spec 已 accepted、tickets 已可领取且用户已经批准开始实施后，才从
   最新 `main` 创建 `integration/<spec>` 并配置临时 ruleset。
2. 以 planning 分支为 head、integration 为 base 建立一次 planning bootstrap
   Pull Request，把已接受的 spec、map、tickets 和适用决策迁入 integration。
3. bootstrap PR 通过等价门禁并合并后立即删除 planning 分支；后续 ticket
   只从最新 integration 创建并 PR 回 integration。
4. 专题整体达到交付条件后，integration 通过最终 Pull Request 进入 `main`，
   随后删除 integration。

如果规划被取消，保留必要的取消结论或后续入口后删除 planning 分支；不得为了
“保存规划”而把未接受的产品承诺合入 `main`。希望长期沉淀但不代表交付状态的
讨论材料，应放在 issue、研究记录或专门的决策载体中，不把 planning 分支变成
永久档案。

## 每次进入新开发的硬门槛

每次新的实施、bugfix、hotfix、流程或正式文档工作都必须依次完成以下检查；
即使改动很小，也不能直接在 `main` 上开始：

1. 运行 `git status --short --branch` 和 `git worktree list`，确认当前分支、
   未提交内容和现有 worktree。用户已有改动不得被移动、覆盖、清理或带入新
   分支；当前工作树不干净时，使用独立 worktree。
2. 按“规划、独立小票、多票 spec、main bug、integration bug、hotfix、
   docs/process”分类工作，确定唯一 base 和 Pull Request target。
3. 更新远端引用并确认 base 是计划使用的最新受保护分支；不得从一个陈旧 topic
   分支派生无关工作。
4. 按 `engineering-flow.md` 读取 `CONTEXT.md`、适用 ADR、spec 和 ticket。
   已 ticket 化的工作先确认依赖已解除，并把 ticket 改为 `claimed`。
5. 创建独立分支；当前工作树不干净或存在并行任务时，再为该分支创建独立
   worktree。有 ticket 时，在 `## Comments` 中记录领取时间、分支名、base
   分支、base commit 和预期 Pull Request target。
6. 重新检查 `git status --short --branch`，确认 HEAD 位于新工作分支，并在
   需要时位于隔离 worktree，才允许修改正式代码或流程文件。

没有 ticket 的明确小改动也必须执行分支检查和创建 topic 分支，只是不强制补建
spec/ticket。诊断、研究和原型不能借 topic 分支直接演变为正式产品实现；若结论
要求改产品，必须回到工程流程重新确定范围和分支。

## 独立小票流程

独立小票完成后能够保持 `main` 可集成时，使用：

```text
main
  └── codex/<effort>-<ticket>-<slug>
        └── Draft/Ready PR + required check + review -> main
```

- 从最新 `main` 创建 ticket 分支。
- Draft Pull Request 可以尽早建立，但不能把 Draft 或 CI 结果当成完成证据。
- 前置 ticket 尚未合入 `main` 时，依赖它的新票不得从其 topic 分支偷偷派生；
  应等待前置合入，或把整个 effort 明确切换为临时 integration 模式。
- 合并后自动删除远端 topic 分支，再清理本地 worktree 和本地分支。

## 多票 spec 与临时 integration

临时 `integration/<spec>` 只在以下条件同时满足时创建：

- 已有 accepted spec 和多张带显式 blocking edges 的实施 ticket；
- 用户已明确批准开始实施，而不只是批准继续规划；
- 单张 ticket 的中间状态不适合独立进入 `main`；
- spec 或 map 明确 integration 名称、最终整合 ticket 和删除时机；
- 可以为该精确分支配置与 `main` 等价的远端门禁。

流程如下：

```text
main
  ├── codex/plan-<effort> ── bootstrap PR ──┐
  └── integration/<spec> <──────────────────┘
        ├── codex/<ticket-01>-<slug> -> PR + gate ──┐
        ├── codex/<ticket-02>-<slug> -> PR + gate ──┼─> integration/<spec>
        └── codex/<ticket-N>-<slug>  -> PR + gate ──┘

integration/<spec> -> 最终 PR + main gate -> main -> 删除 integration
```

- bootstrap PR 只迁移已接受的规划资产，不夹带正式产品实现；合并后删除
  planning 分支，不能让它继续充当 ticket base。
- integration 从最新 `main` 创建，只接收同一 spec 的 ticket；不得混入其他
  feature、独立 bug 或顺手重构。
- 每张 ticket 从最新 integration 创建，仍需自己的 TDD、最终 `pnpm verify`、
  人工 QA、双轴 review、中文提交和 closeout。
- 有依赖的票必须等待前置票通过 Pull Request 进入 integration，不能直接合并
  前置 ticket 分支。
- `main` 出现必须同步的修复时，通过 `main -> integration/<spec>` 的同步 PR
  前向合入，并重新运行 required check；不得直接 push integration。
- 最终 ticket 完成后，以一个 Ready Pull Request 将 integration 合入最新
  `main`，再次运行完整门禁和全规格 review。
- 最终 PR 合并后，先停用精确匹配该分支的临时 ruleset，再删除 integration；
  它不得成为下一专题的 base 或事实源。

## Bugfix 与 Hotfix

缺陷修复可以从分诊或诊断开始，但开始修改前必须记录复现条件、期望行为、影响
范围和回归验证。缺陷很小不能成为跳过分支、测试、review 或 CI 的理由。

### 路由规则

| 情况                                             | 处理方式                                           | Base / PR target                |
| ------------------------------------------------ | -------------------------------------------------- | ------------------------------- |
| 当前 ticket 范围内、由本次改动导致或阻塞本票验收 | 在当前 ticket 中修复并补回归测试                   | 当前 ticket 分支                |
| 已存在于 `main` 的独立缺陷                       | 建立 bug ticket 和 `codex/fix-*`                   | `main` / `main`                 |
| 只存在于某个临时 integration 的缺陷              | 建立 bug ticket，记录其阻塞关系                    | 该 integration / 该 integration |
| `main` 与 integration 都受影响                   | 先修复 `main`，再用同步 PR 前向合入 integration    | `main`，随后 integration        |
| 已维护 release 与 `main` 都受影响                | 从最早受影响的维护线修复，再用独立 PR 逐线前向移植 | 对应 release，随后 `main`       |
| 崩溃、数据损坏、安全问题或候选版发布阻断         | 建立 hotfix ticket 和 `codex/hotfix-*`             | 最新稳定目标分支                |

### 实施要求

- 正常 bugfix 先用失败测试或可重复验证证据证明问题，再做最小修复和回归测试；
  无法自动化时，在 ticket 和 PR 中说明原因、人工步骤和残余风险。
- integration 独有 bug 不得先合入 `main`；只有最终专题 PR 才把它随完整功能
  带入 `main`。
- `main` bug 修复完成后，所有仍受影响的活动 integration 都必须建立前向同步
  PR，禁止复制粘贴形成不可追踪的平行修复。存在受影响的已维护 release 时，
  release 优先规则覆盖“先修 main”：从最早受影响的维护线修复，再依次前向移植
  到较新 release、`main` 和活动 integration。
- 前向同步 PR 是原 bugfix 的交付动作，不算第二个主要实施 PR；每个同步 PR
  必须回链原 bug ticket，并把 target 和结果写回该 ticket。同步产生非平凡
  冲突、行为差异或额外验收时，必须另建 follow-up bug ticket。
- hotfix 仍必须使用分支、Pull Request、required check 和 merge commit。只有
  GitHub Actions 故障或安全事件无法等待正常门禁时，才可在用户明确批准后使用
  应急 bypass；必须保留 PR，记录绕过原因，先运行可执行的本地 `pnpm verify`，
  并在服务恢复后补跑远端验证。
- 未复现、影响范围不明或可能改变架构方向的缺陷保持在诊断阶段，不得以
  `hotfix` 名义抢先实施。

## Pull Request 与合并规则

每个正式 Pull Request 必须：

- 指向开工时记录的 target；base 改变时同步更新 ticket 依赖和验证证据。
- 包含变更目的、主要改动、测试／`pnpm verify` 结果、配置影响、ticket 路径；
  界面或资源变更还要附截图、录屏或示例路径。
- 在 Ready 前完成所需人工 QA、Standards + Spec 双轴 review，并处理阻塞发现。
- 在最新 target 上通过 GitHub Actions 的 `macOS ARM64 最终验证`。
- 合并前解决所有 review 对话。

仓库当前只允许 merge commit：

- GitHub merge commit 保留 ticket closeout 记录的原实现 SHA。
- squash 和 rebase 会产生新的提交 SHA，在 closeout 契约改造前禁止使用。
- `Require linear history` 必须关闭，因为它与 merge commit 冲突。
- 实现 SHA 写入 Closeout Evidence 后不得 rebase 或强推；base 前进时只允许
  GitHub 的 “Update with merge commit” 或普通 merge 保留原提交，禁止选择
  update-by-rebase，并重新运行验证。
- 合并必须通过 GitHub Pull Request 完成，不能在本地生成 merge commit 后
  直接 push 受保护分支。

若未来希望使用 squash，必须先用独立流程 ticket 改造 closeout scanner、
ticket 证据和范围检查，使其记录 PR 与最终 squash SHA；不得只改 GitHub 设置。

## GitHub 规则

永久 `main` ruleset、每个精确匹配的临时 integration ruleset，以及未来每条
活动 `release/*` 的精确 ruleset 至少包含：

- Require a pull request before merging。
- Required approvals：单维护者为 `0`，存在第二名稳定维护者后为 `1`。
- Require conversation resolution。
- Required status check：`macOS ARM64 最终验证`，Expected source 为
  GitHub Actions。
- Require branches to be up to date before merging（Strict）。
- Allowed merge method 仅 `merge`，关闭 linear history。
- Block force pushes 和 Restrict deletions。
- 日常 Bypass 为空；应急 bypass 只按本页 hotfix 规则使用。

引入 `release/*` 的独立决策必须同时建立对应 ruleset 并验证 required check；
规则尚未生效时，该 release 分支不得接收正式变更。

Required job 名是仓库设置与 workflow 之间的合约。改名时必须先让新名称真实
成功运行，再同步 ruleset，避免 Pull Request 永久等待旧检查。

当前个人账号仓库不启用 merge queue。未来若迁移到支持该能力的组织且持续出现
高并发合并，再独立评估；启用前必须让 required workflow 响应
`merge_group`。

GitHub 官方参考：

- [About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [About pull request merges](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/about-pull-request-merges)
- [Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)

## 清理与例外

- 开启普通 Pull Request head branch 自动删除；integration 因受删除规则保护，
  在最终合并后按“停用临时 ruleset -> 删除远端分支”的顺序清理。
- 删除本地 worktree 或分支前，先确认改动已提交、PR 已合并且目标分支可到达
  对应提交。不得仅凭名称判断分支已经无用。
- 长期未活动分支先核对关联 ticket、Pull Request 和未合入提交，再决定恢复或
  删除；任何 material 删除都应告知用户。
- 研究、reference 和 prototype 不能与正式实施 PR 混合；其范围边界继续遵守
  `delivery-readiness.md`。
- 任何绕过分支、PR、CI、review、人工 QA 或合并方式的例外，都必须由用户明确
  批准。有 ticket 时记录在 `## Comments`；仍有 Pull Request 时也记录在 PR。
  如果用户同时明确要求不建 ticket 和 PR，则在最终交接中记录原因、范围、
  风险、临时措施和补救验证，并在下一份适用的正式流程记录中回链该例外。
