import { test, expect } from "@playwright/test";
import { motionOff } from "./motion.js";

const STEPS = ["frame", "photo", "features", "stats", "moves", "finish"];
const partOpacity = (page, part) =>
  page
    .locator(`.game-card ${part}`)
    .evaluate((el) => getComputedStyle(el).opacity);

test("card generation plays an assembly scene and settles every part visible", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/#creator");
  await expect(page.locator("#download-button")).toBeEnabled();
  await page.locator("#sample-button").click();
  // 解析中は組み立てシーンと工程リストが出る。
  await expect(page.locator("#forge-scene")).toBeVisible();
  await expect(page.locator("#forge-steps")).toBeVisible();
  // 最初は枠だけの空のカード。工程が進むにつれて中身が嵌まる。
  await expect(page.locator("#card-shell")).toHaveClass(/assembling/);
  expect(await partOpacity(page, ".card-mini-moves")).toBe("0");
  expect(await partOpacity(page, ".card-footer")).toBe("0");
  // 解析が一瞬で終わっても、前半の工程を飛ばさずに見せてから組み立てる。
  await page.waitForTimeout(250);
  await expect(page.locator('[data-forge-step="finish"]')).not.toHaveAttribute(
    "data-state",
    "done",
  );
  // 完了するとシーンは引っ込み、手順はすべて完了になる。
  await expect(page.locator("#forge-scene")).toBeHidden({ timeout: 20000 });
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
    expect(await partOpacity(page, part)).toBe("1");
  }
  await expect(page.locator("#card-primary-stats > div")).toHaveCount(10);
  await expect(page.locator("#card-mini-moves > span")).toHaveCount(4);
});

test("opening the app on home and then the creator still plays the scene", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // ホームで起動すると、最初のサンプルは作成タブが見えていない間に出来上がる。
  await page.goto("/");
  await expect(page.locator("#home-screen")).toBeVisible();
  await expect(page.locator("#download-button")).toBeEnabled();
  await expect(page.locator("#forge-scene")).toBeHidden();
  // 作成タブを開いた時点で、生成シーンが最初から再生される。
  await page.locator('.view-nav [data-view="creator"]').click();
  await expect(page.locator("#forge-scene")).toBeVisible();
  await expect(page.locator('[data-forge-step="finish"]')).not.toHaveAttribute(
    "data-state",
    "done",
  );
  await expect(page.locator("#forge-scene")).toBeHidden({ timeout: 20000 });
  for (const name of STEPS)
    await expect(page.locator(`[data-forge-step="${name}"]`)).toHaveAttribute(
      "data-state",
      "done",
    );
  await expect(page.locator("#card-shell")).not.toHaveClass(/assembling/);
  const opacity = await page
    .locator(".game-card .photo-frame")
    .evaluate((el) => getComputedStyle(el).opacity);
  expect(opacity).toBe("1");
});

test("opening the creator while the first sample is still being made still plays the scene", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#home-screen")).toBeVisible();
  // 最初のサンプル生成が終わる前に作成タブへ移っても、シーンは見せる。
  await page.locator('.view-nav [data-view="creator"]').click();
  await expect(page.locator("#forge-scene")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#forge-scene")).toBeHidden({ timeout: 22000 });
  await expect(page.locator('[data-forge-step="finish"]')).toHaveAttribute(
    "data-state",
    "done",
  );
  await expect(page.locator("#card-shell")).not.toHaveClass(/assembling/);
});

test("the device asking for reduced motion no longer hides the scene", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#creator");
  await expect(page.locator("#download-button")).toBeEnabled();
  // 端末の「動きを減らす」設定でも演出は止めない。
  await expect(page.locator("body")).toHaveAttribute("data-motion", "on");
  await page.locator("#sample-button").click();
  await expect(page.locator("#forge-scene")).toBeVisible();
  await expect(page.locator("#forge-scene")).toBeHidden({ timeout: 20000 });
});

test("motion off skips the assembly scene and shows the card immediately", async ({
  page,
}) => {
  await motionOff(page);
  await page.goto("/#creator");
  await expect(page.locator("#download-button")).toBeEnabled();
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
