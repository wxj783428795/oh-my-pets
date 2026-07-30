# Issue Tracker: Local Markdown

本仓库的 issue 和 spec 以 Markdown 文件形式保存在 `.scratch/` 目录中。

## 约定

- 每个功能或专题使用一个目录：`.scratch/<feature-slug>/`
- 规格说明文件使用：`.scratch/<feature-slug>/spec.md`
- 实施 issue 按单文件存放：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- issue 编号从 `01` 开始，不使用单个汇总 tickets 文件
- issue 顶部应包含 `Status:` 行，用于记录分诊状态；状态词见 `triage-labels.md`
- 新实施 issue 顶部应包含 `Closeout-Contract: v1`，用于启用机械关闭校验
- 新实施 issue 可用 `Kind: feature|bugfix|hotfix|process` 记录工作类别；缺省为 `feature`
- 讨论记录追加在文件底部的 `## Comments` 小节下

## 当技能要求“发布到 issue tracker”时

在 `.scratch/<feature-slug>/` 下创建对应 Markdown 文件；如果目录不存在，先创建目录。

## 当技能要求“读取相关 ticket”时

直接读取用户提供的 issue 文件路径，或按 issue 编号到对应目录下查找文件。

## 实施 ticket 生命周期

实施 ticket 使用 `open -> claimed -> resolved` 生命周期，并遵循 `engineering-flow.md`：

- `open`：尚未领取，不能修改对应产品代码。
- `claimed`：已领取并正在实施或验收。
- `resolved`：已满足下述 Definition of Done。

领取 ticket 时，应先确认其未被阻塞，并按 `branch-management.md` 确定 base 和
Pull Request target。在 `## Comments` 中记录领取时间、分支名、base 分支、
base commit 和 target。发现新的阻塞项时，把状态保持为 `claimed`，同时在
`Blocked by:` 或 `## Comments` 中记录阻塞关系。

bugfix 和 hotfix 仍使用相同生命周期与 Closeout Contract。当前 ticket 范围内
的回归在当前 ticket 修复；独立缺陷建立新 ticket，并按缺陷实际存在于 `main`
还是临时 integration 选择 base。只涉及 `main` 与 integration 时先修 `main`
再前向同步；存在受影响的已维护 release 时，从最早维护线修复，再逐线前向移植
到 `main` 和 integration。具体路由见 `branch-management.md`。

## Definition of Done

实施 ticket 只有同时满足以下条件才能标记为 `resolved`：

1. ticket 和 spec 的验收标准均已验证，非目标没有被擅自扩张。
2. 相关自动化测试、格式检查、lint 和构建均已通过，或已记录无法执行的客观原因与风险。
3. 所需人工验收已经完成；确实不适用时，ticket 中必须明确写出原因。
4. 已完成 Standards + Spec 双轴 code review，所有阻塞性发现均已修复或登记为 blocker。
5. 实施变更已使用中文提交信息形成可追溯提交，提交记录已写回 ticket；用户明确要求不提交时除外。
6. `## Answer` 或实施结果中已记录实际变更、验证证据、已知限制和遗留风险。
7. 已创建指向开工时记录 target 的 Pull Request，或记录用户明确要求不创建 Pull Request 的流程例外。

任一条件缺失时，ticket 必须保持 `claimed`。当前 ticket 所需的人工 QA 不能拆成独立 ticket 来绕过完成条件；验收中发现的独立缺陷可以建立 bug ticket，并按是否阻塞当前验收记录依赖。

## 结构化关闭证据

使用 `Closeout-Contract: v1` 的实施 ticket 必须包含以下结构；值必须是实际结果，不能保留 `pending`：

```markdown
## Closeout Evidence

### Verify

- Status: passed
- Command: `pnpm verify`
- Result: <实际结果>

### Manual QA

- Status: passed
- Command: `pnpm qa:desktop`
- Result: <实际结果或报告路径>
- Reason: <not-applicable 时必填>

### Review

- Standards: passed
- Spec: passed
- Notes: <阻塞发现及处理结果>

### Commit

- Status: committed
- Hash: <7-40 位 Git commit hash>
```

人工 QA 确实不适用时，`Status` 可写 `not-applicable`，但 `Result` 和 `Reason` 都必须解释客观边界。准备关闭单票时运行：

```bash
pnpm closeout:check -- --ticket .scratch/<feature>/issues/<NN>-<slug>.md
```

不传 `--ticket` 时，命令扫描全部 resolved ticket，并由 `pnpm verify` 调用。`scripts/closeout-baseline.json` 只列出 v1 契约启用前已经 resolved 的历史票，避免伪造历史验收；新票不得加入基线来绕过 Definition of Done。

## Wayfinding 约定

- 地图文件：`.scratch/<effort>/map.md`
- 子 ticket：`.scratch/<effort>/issues/<NN>-<slug>.md`
- 子 ticket 顶部可包含 `Type:`，可选值为 `research`、`prototype`、`grilling`、`task`
- 实施 ticket 顶部可包含 `Kind:`，可选值为 `feature`、`bugfix`、`hotfix`、`process`
- 子 ticket 顶部可包含 `Blocked by:`，记录阻塞它的 issue 编号
- 可领取的 frontier ticket 条件是：未关闭、未阻塞、未被领取
- 领取时先写入 `Status: claimed`
- 完成时在 `## Answer` 下补充结论；满足 Definition of Done 后，才能将 `Status:` 改为 `resolved`
