import { describe, expect, it } from "vitest";

import { actionLabel } from "./action-labels";

describe("actionLabel", () => {
  it("maps host semantic actions to user-facing labels", () => {
    expect(actionLabel("feed_react")).toBe("文件投喂");
  });

  it("keeps unknown values visible for diagnostics", () => {
    expect(actionLabel("future_action")).toBe("future_action");
  });
});

