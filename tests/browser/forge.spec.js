import { test, expect } from "@playwright/test";

const STEPS = ["frame", "photo", "features", "stats", "moves", "finish"];

test("card generation plays an assembly scene and settles every part visible", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/#creator");
  await expect(page.locator("#download-button")).toBeEnabled();
  await page.locator("#sample-button").click();
  // 解析中は組み立てシーンと進行状況が出る。
  await expect(page.locator("#forge-scene")).toBeVisible();
  await expect(page.locator("#forge-status-count")).toBeVisible();
  // 解析が一瞬で終わっても、前半の工程を飛ばさずに見せてから組み立てる。
  await page.waitForTimeout(250);
  expect(await page.locator("#forge-step-number").textContent()).not.toBe("06");
  // 完了するとシーンは引っ込み、手順はすべて完了になる。
  await expect(page.locator("#forge-scene")).toBeHidden({ timeout: 8000 });
  await expect(page.locator("#forge-step-number")).toHaveText("06");
  for (const name of STEPS)
    await expect(page.locator(`[data-forge-step="${name}"]`)).toHaveAttribute(
      "data-state",
      "done",
    );
  await expect(page.locator("#card-shell")).not.toHaveClass(/assembling/);
  // パーツがアニメーションで隠れたままにならない。
  for (const part of [
    ".card-meta",
    ".photo-frame",
    ".card-heading",
    ".card-primary-stats",
    ".card-mini-moves",
    ".card-footer",
  ]) {
    const opacity = await page
      .locator(`.game-card ${part}`)
      .evaluate((el) => getComputedStyle(el).opacity);
    expect(opacity).toBe("1");
  }
  await expect(page.locator("#card-primary-stats > div")).toHaveCount(10);
  await expect(page.locator("#card-mini-moves > span")).toHaveCount(4);
});

test("turning effects off skips the assembly scene and shows the card immediately", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/#creator");
  await expect(page.locator("#download-button")).toBeEnabled();
  await page.locator("#motion-toggle").click();
  await expect(page.locator("body")).toHaveAttribute("data-motion", "off");
  const before = await page.locator("#card-photo").getAttribute("src");
  await page.locator("#sample-button").click();
  await expect(page.locator("#card-photo")).not.toHaveAttribute("src", before, {
    timeout: 8000,
  });
  await expect(page.locator("#forge-scene")).toBeHidden();
  const opacity = await page
    .locator(".game-card .card-heading")
    .evaluate((el) => getComputedStyle(el).opacity);
  expect(opacity).toBe("1");
});
