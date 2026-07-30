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

test("首次加载后在真实浏览器中显示正式卷卷 Canvas", async ({
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

  await page.getByRole("button", { name: /重新加载正式卷卷/ }).click();

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

test("15 个正式动作的首帧都经真实 PixiJS Canvas 渲染", async ({ page }) => {
  await page.clock.install({
    time: new Date("2026-07-29T03:59:00.000Z"),
  });
  await page.goto("/");

  const canvas = page.locator(".pixi-host canvas");
  await expect(canvas).toBeVisible();
  await page.clock.pauseAt(new Date("2026-07-29T04:00:00.000Z"));
  const actions = await page.evaluate(async () => {
    const response = await fetch("/pets/juanjuan/pet.json");
    const manifest = (await response.json()) as {
      actions: Record<string, { frames: Array<{ durationMs: number }> }>;
    };
    return Object.entries(manifest.actions).map(([name, action]) => ({
      name,
      frameCount: action.frames.length,
    }));
  });
  expect(actions).toHaveLength(15);
  expect(actions.every((action) => action.frameCount > 1)).toBe(true);
  await expect(page.locator("button[data-preview-action]")).toHaveCount(15);

  let previousFrame = (await canvas.screenshot()).toString("base64");
  for (const action of actions) {
    await page.locator(`button[data-preview-action="${action.name}"]`).click();
    await expect(page.locator(".timeline-status code")).toHaveText(action.name);
    await expect
      .poll(async () => (await canvas.screenshot()).toString("base64"), {
        message: `${action.name} 必须切换到自己的独立首帧`,
      })
      .not.toBe(previousFrame);
    previousFrame = (await canvas.screenshot()).toString("base64");
  }
});

test("真实宠物表面保留完整卷尾", async ({ baseURL, browser }) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 320 },
    deviceScaleFactor: 2,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    colorScheme: "dark",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await page.clock.install({
    time: new Date("2026-07-29T04:00:00.000Z"),
  });
  await page.goto(`${baseURL}/?surface=pet&browserTestQuietMode=1`);

  const canvas = page.locator(".pet-canvas canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveCSS("width", "320px");
  await expect(canvas).toHaveCSS("height", "320px");
  await expect(canvas).toHaveScreenshot("juanjuan-pet-retina.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    threshold: 0,
    maxDiffPixels: 0,
  });
  await context.close();
});

test("真实宠物表面持续播放待机逐帧", async ({ page }) => {
  await page.clock.install({
    time: new Date("2026-07-29T04:00:00.000Z"),
  });
  await page.goto("/?surface=pet");

  const canvas = page.locator(".pet-canvas canvas");
  await expect(canvas).toBeVisible();
  const firstFrame = (await canvas.screenshot()).toString("base64");
  await page.clock.runFor(721);
  await expect
    .poll(async () => (await canvas.screenshot()).toString("base64"), {
      message: "真实宠物表面必须在 idle_00 的首帧时长结束后显示下一帧",
    })
    .not.toBe(firstFrame);
});

test("偏好设置在内容高于窗口时可滚动到高级入口", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 650 });
  await page.goto("/?surface=preferences");

  const surface = page.locator(".preferences-surface");
  await expect(page.getByRole("heading", { name: "偏好设置" })).toBeVisible();
  await expect
    .poll(() =>
      surface.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    )
    .toBe(true);

  await surface.hover();
  await page.mouse.wheel(0, 900);
  await expect
    .poll(() => surface.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("heading", { name: "高级开发预览" }),
  ).toBeInViewport();
});
