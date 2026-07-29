import { describe, expect, test } from "vitest";

import { validateCloseoutTicket } from "./closeout.mjs";

const completeTicket = `# 完成交付

Type: task
Status: resolved
Closeout-Contract: v1

## Closeout Evidence

### Verify

- Status: passed
- Command: \`pnpm verify\`
- Result: 通过

### Manual QA

- Status: not-applicable
- Command: \`pnpm qa:desktop:manual\`
- Result: 不适用
- Reason: 本票不修改桌面行为

### Review

- Standards: passed
- Spec: passed
- Notes: 无阻塞发现

### Commit

- Status: committed
- Hash: 0123456789abcdef0123456789abcdef01234567

## Answer

已完成。`;

describe("ticket 关闭证据", () => {
  test("接受包含完整结构化证据的 resolved ticket", () => {
    expect(validateCloseoutTicket(completeTicket)).toEqual({
      status: "resolved",
      contract: "v1",
      errors: [],
    });
  });

  test("拒绝缺失人工 QA 结果的 resolved ticket", () => {
    const result = validateCloseoutTicket(
      completeTicket.replace("- Status: not-applicable", "- Status: pending"),
    );

    expect(result.errors).toContain(
      "Manual QA Status 必须是 passed 或 not-applicable",
    );
  });

  test("人工 QA 不适用时必须提供原因", () => {
    const result = validateCloseoutTicket(
      completeTicket.replace(
        "- Reason: 本票不修改桌面行为",
        "- Reason: pending",
      ),
    );

    expect(result.errors).toContain(
      "Manual QA 标记为 not-applicable 时必须填写 Reason",
    );
  });

  test("不允许快速检查冒充最终 verify", () => {
    const result = validateCloseoutTicket(
      completeTicket.replace("`pnpm verify`", "`pnpm verify:core`"),
    );

    expect(result.errors).toContain("Verify Command 必须执行 pnpm verify");
  });

  test("人工 QA 通过时必须记录正式桌面命令", () => {
    const result = validateCloseoutTicket(
      completeTicket
        .replace("- Status: not-applicable", "- Status: passed")
        .replace("`pnpm qa:desktop:manual`", "`pnpm qa:desktop:auto`"),
    );

    expect(result.errors).toContain(
      "Manual QA Command 必须执行 pnpm qa:desktop",
    );
  });

  test("拒绝缺失双轴 review 或提交哈希的 resolved ticket", () => {
    const result = validateCloseoutTicket(
      completeTicket
        .replace("- Standards: passed", "- Standards: pending")
        .replace(
          "- Hash: 0123456789abcdef0123456789abcdef01234567",
          "- Hash: pending",
        ),
    );

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Standards review 必须是 passed",
        "Commit Hash 必须是 7-40 位 Git 十六进制哈希",
      ]),
    );
  });

  test("带标点的待办文案仍视为占位证据", () => {
    const result = validateCloseoutTicket(
      completeTicket.replace("已完成。", "待实施。"),
    );

    expect(result.errors).toContain("Answer 必须记录实际交付结果");
  });
});
