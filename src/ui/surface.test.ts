import { describe, expect, test } from "vitest";

import { resolveSurface } from "./surface";

describe("WebView 产品表面路由", () => {
  test.each([
    ["?surface=pet", "pet"],
    ["?surface=preferences", "preferences"],
    ["?surface=developer", "developer"],
  ] as const)("把 %s 映射到 %s 表面", (search, expected) => {
    expect(resolveSurface(search, "pet")).toBe(expected);
  });

  test.each(["", "?surface=unknown", "?other=value"])(
    "生产入口 %s 不会意外暴露开发工作台",
    (search) => {
      expect(resolveSurface(search, "pet")).toBe("pet");
    },
  );

  test("浏览器测试可以显式保留开发工作台作为默认表面", () => {
    expect(resolveSurface("", "developer")).toBe("developer");
  });
});
