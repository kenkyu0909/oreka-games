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
  await expect(page.locator("#sample-button")).toBeEnabled();
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

test("home starts with no card; the creator stays empty until a sample is requested", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // デフォルトのサンプルカードは作らない。ホームも作成画面も空のまま始まる。
  await page.goto("/");
  await expect(page.locator("#home-screen")).toBeVisible();
  await expect(page.locator("#add-team-button")).toBeDisabled();
  await expect(page.locator("#download-button")).toBeDisabled();
  expect(await page.locator("#card-photo").getAttribute("src")).toBe(null);
  await expect(page.locator("#card-shell")).toHaveClass(/is-empty/);
  await page.locator('.view-nav [data-view="creator"]').click();
  await expect(page.locator("#forge-scene")).toBeHidden();
  await expect(page.locator("#status")).toContainText("写真を選ぶと");
  // サンプルを明示的に選んだ時だけ、生成シーンが最初から再生される。
  await page.locator("#sample-button").click();
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
  await expect(page.locator("#card-shell")).not.toHaveClass(/is-empty/);
  const opacity = await page
    .locator(".game-card .photo-frame")
    .evaluate((el) => getComputedStyle(el).opacity);
  expect(opacity).toBe("1");
});

test("sample cards are only created on request and never auto-fill the team", async ({
  page,
}) => {
  await motionOff(page);
  await page.goto("/");
  await expect(page.locator("#home-screen")).toBeVisible();
  await page.locator('.view-nav [data-view="creator"]').click();
  await expect(page.locator("#add-team-button")).toBeDisabled();
  await page.locator("#sample-button").click();
  await expect(page.locator("#add-team-button")).toBeEnabled({ timeout: 15000 });
  // サンプルは作成画面に出るだけで、勝手にチームへ入らない。
  await page.locator('.view-nav [data-view="battle"]').click();
  await expect(page.locator(".party-card")).toHaveCount(0);
  await expect(page.locator('[data-action="samples"]')).toBeVisible();
});

test("the device asking for reduced motion no longer hides the scene", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#creator");
  await expect(page.locator("#sample-button")).toBeEnabled();
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
  await expect(page.locator("body")).toHaveAttribute("data-motion", "off");
  await expect(page.locator("#add-team-button")).toBeDisabled();
  await page.locator("#sample-button").click();
  await expect(page.locator("#add-team-button")).toBeEnabled({ timeout: 15000 });
  expect(await page.locator("#card-photo").getAttribute("src")).toMatch(/^blob:/);
  await expect(page.locator("#forge-scene")).toBeHidden();
  const opacity = await page
    .locator(".game-card .card-heading")
    .evaluate((el) => getComputedStyle(el).opacity);
  expect(opacity).toBe("1");
});

test.describe("narrow screen", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows the step HUD under the card instead of text over it", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/#creator");
    await expect(page.locator("#sample-button")).toBeEnabled();
    await page.locator("#sample-button").click();
    // 狭い画面では左右の工程リストをやめ、カード下のHUDに畳む。
    await expect(page.locator("#forge-hud")).toBeVisible();
    await expect(page.locator("#forge-steps")).toBeHidden();
    const boxes = await page.evaluate(() => {
      const hud = document.getElementById("forge-hud").getBoundingClientRect();
      const card = document.getElementById("card-shell").getBoundingClientRect();
      return { hudTop: hud.top, cardBottom: card.bottom, hudWidth: hud.width };
    });
    // 工程の文字がカードに重ならない。
    expect(boxes.hudTop).toBeGreaterThanOrEqual(boxes.cardBottom - 1);
    // ステージ幅いっぱいに広がり、横スクロールも出さない。
    expect(boxes.hudWidth).toBeGreaterThan(300);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
    // 工程が進むとHUDの番号・状態・進捗も追従する。
    await expect(page.locator("#forge-hud-index")).toHaveText(/0[2-6]/);
    await expect(page.locator("#forge-hud-state")).not.toHaveText("待機");
    await expect
      .poll(() =>
        page.locator('#forge-hud-track span[data-state="active"]').count(),
      )
      .toBe(1);
    await expect
      .poll(() =>
        page.locator('#forge-hud-track span[data-state="done"]').count(),
      )
      .toBeGreaterThanOrEqual(2);
    await expect(page.locator("#forge-scene")).toBeHidden({ timeout: 20000 });
    await expect(page.locator("#forge-hud")).toBeHidden();
  });
});
