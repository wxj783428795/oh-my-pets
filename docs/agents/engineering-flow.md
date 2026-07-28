# Engineering Flow

本仓库的工程工作默认遵循主流程：

`grill-with-docs -> [to-spec -> to-tickets] -> implement(tdd) -> code-review -> commit`

这些阶段是防止在问题、规格和验收标准尚未收口时过早修改产品代码的硬约束，不是可选建议。

## 入口选择

- 有代码库的常规功能工作从 `grill-with-docs` 开始，在同一上下文中澄清需求并把关键结论写入 `CONTEXT.md` 或 ADR。
- 无法只靠讨论回答的问题，可以经 `handoff -> prototype -> handoff` 做 throwaway 验证；原型只回答问题，不演变为正式产品主线。
- 面对范围大、决策多、边界模糊的绿地工作，先使用 `wayfinder`。该阶段只产出决策、证据、原型结论和待解决问题，不实施正式产品功能；地图收口后在 `to-spec` 处汇入主流程。
- 会跨多个会话的工作必须先通过 `to-spec` 形成规格，再通过 `to-tickets` 拆成带 blocking edges 的 tracer-bullet tickets。
- 范围确实很小、能在当前上下文内完成并验收的工作，可以在完成 `grill-with-docs` 后直接进入 `implement`，不强制创建 spec 和 ticket。
- 缺陷修复可以从分诊或诊断开始，但仍需明确复现条件、预期行为和完成标准。

## 开工门槛

任何工作开始修改产品代码前，必须同时满足：

1. 相关决策已经收口，不存在会改变实现方向的未决问题。
2. 范围、非目标、行为要求和验收标准已经明确。
3. 实施上下文已读取 `CONTEXT.md` 和适用的 ADR。

对于多会话或已经 ticket 化的工作，还必须同时满足：

1. `spec` 已记录范围、非目标、行为要求和验收标准。
2. 当前 ticket 是一条端到端 tracer bullet，依赖和阻塞关系已记录。
3. ticket 状态已改为 `claimed`。
4. 新的实施上下文已读取当前 ticket 和相关 spec。

`wayfinder`、研究、grilling 和 prototype ticket 不能直接作为正式产品代码的开工授权。决策地图收口后，除非工作被明确证明为单会话小改动，否则必须经过 `to-spec` 和 `to-tickets`。

## 实施与验证

- `grill-with-docs` 到 `to-tickets` 应保持在同一未中断的上下文中；每张实施 ticket 再使用新的上下文，避免把规划阶段的隐含假设带入实现。
- 实施按可验证的小切片推进，默认采用 red-green-refactor 的 TDD 循环。
- 自动化测试、格式检查、lint 和构建只证明机器可检查的部分，不能替代 ticket 要求的人工体验验收。
- 最后一次相关改动完成后，正式主线必须运行根目录 `pnpm verify`。任何后续相关改动都会使已有结果失效，必须重跑后才能进入 review 或提交。
- 最终交接和 ticket 验证证据必须记录 `pnpm verify` 的实际结果；不能用更早的局部检查替代最终改动后的关闭检查。
- 当前 ticket 的人工 QA 属于该 ticket 的完成条件，不能另建一张 QA ticket 来规避未完成的验收。
- 验证发现的独立缺陷应建立 bug ticket；会阻塞当前验收的缺陷必须记录为 blocker，当前 ticket 保持 `claimed`。

## Review、提交与关闭

正式提交前必须完成双轴 review：

- Standards review：检查正确性、可靠性、安全性、可维护性和测试质量。
- Spec review：逐项检查实现是否满足 ticket、spec、非目标和验收标准。

阻塞性 review 发现必须先修复或登记为明确 blocker。随后使用中文提交信息形成可追溯提交；存在 ticket 时，还要把验证证据、review 结论和提交记录写回 ticket。只有满足 `docs/agents/issue-tracker.md` 的 Definition of Done 后，ticket 才能改为 `resolved`。

## 上下文与例外

- 规划阶段应连续推进到 tickets 可领取；每张实施 ticket 重新建立上下文。
- 任何跳过阶段或完成门槛的例外都必须由用户明确批准，并在 ticket 的 `## Comments` 中记录原因、范围和风险。
- 不为已经发生的历史工作伪造流程记录；发现流程偏差后，从当前状态如实补齐缺失门槛。
