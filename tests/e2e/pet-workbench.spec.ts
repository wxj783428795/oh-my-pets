import { expect, test, type Page } from "@playwright/test";

function collectUnexpectedRequests(
  page: Page,
  allowedOrigin: string,
): string[] {
  const unexpected: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      !["data:", "blob:"].includes(url.protocol) &&
      url.origin !== allowedOrigin
    ) {
      unexpected.push(request.url());
    }
  });
  return unexpected;
}

test("首次加载后在真实浏览器中显示示例宠物 Canvas", async ({
  baseURL,
  page,
}) => {
  const unexpectedRequests = collectUnexpectedRequests(
    page,
    new URL(baseURL!).origin,
  );
  await page.clock.setFixedTime(new Date("2026-07-29T04:00:00.000Z"));
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "卷卷",
    }),
  ).toBeVisible();

  const canvas = page.locator(".pixi-host canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("width", "320");
  await expect(canvas).toHaveAttribute("height", "320");
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) =>
        Boolean(element.getContext("webgl2") ?? element.getContext("webgl")),
      ),
    )
    .toBe(true);
  await expect(canvas).toHaveScreenshot("juanjuan-canvas.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    threshold: 0,
    maxDiffPixels: 0,
  });
  expect(unexpectedRequests).toEqual([]);
});

test("初始宠物包失败后可重新加载并恢复 Canvas", async ({ baseURL, page }) => {
  const unexpectedRequests = collectUnexpectedRequests(
    page,
    new URL(baseURL!).origin,
  );
  await page.clock.setFixedTime(new Date("2026-07-29T04:00:00.000Z"));
  await page.goto("/?browserTestInitialPackFailure=1");

  await expect(page.locator(".status-strip")).toContainText(
    "浏览器测试注入的宠物包读取失败",
  );
  await expect(page.locator(".pixi-host canvas")).toHaveCount(0);

  await page.getByRole("button", { name: /重新加载示例宠物包/ }).click();

  await expect(
    page.getByRole("heading", {
      name: "卷卷",
    }),
  ).toBeVisible();
  await expect(page.locator(".pixi-host canvas")).toBeVisible();
  await expect(page.locator(".status-strip")).toContainText(
    "宠物包已重新校验并加载",
  );
  expect(unexpectedRequests).toEqual([]);
});
