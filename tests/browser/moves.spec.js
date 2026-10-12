import { test, expect } from "@playwright/test";
import { encode } from "fast-png";

test("photo-v2 three-hit skill exposes its effect, uses one PP and presents three separate impacts", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator('.view-nav [data-view="creator"]').click();
  await expect(page.locator("#add-team-button")).toBeEnabled();
  await page.locator("#photo-input").setInputFiles({
    name: "連撃テスト.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      encode({
        width: 8,
        height: 8,
        channels: 4,
        data: new Uint8Array(
          Array.from({ length: 64 }, () => [60, 180, 240, 255]).flat(),
        ),
      }),
    ),
  });
  await expect(page.locator("#card-name")).toHaveText("連撃テスト");
  for (let i = 0; i < 3; i++) {
    if (i) await page.locator('.view-nav [data-view="creator"]').click();
    await page.locator("#add-team-button").click();
  }
  await expect(page.locator(".party-card")).toHaveCount(3);
  await page.locator(".test-settings summary").click();
  await page.locator("#battle-seed").fill("12345");
  await page.locator('[data-action="start-cpu"]').click();
  await expect(page.locator(".battle-move").first()).toContainText("三連水流");
  await expect(page.locator(".battle-move").first()).toContainText("3回攻撃");
  await expect(
    page.locator(".battle-move").first().locator(".move-base-power"),
  ).toHaveText("威力 22×3");
  await expect(
    page.locator(".battle-move").nth(2).locator(".move-base-power"),
  ).toHaveText("威力 —");
  await page.locator('[data-action="moves"]').click();
  await expect(page.locator(".sheet-moves .move-item").first()).toContainText(
    "威力 22 × 3回",
  );
  await page.locator('[data-action="close-sheet"]').click();
  await page.evaluate(() => {
    window.hitFrames = [];
    new MutationObserver(() => {
      const label = document.querySelector(
        ".opponent .damage-popup small",
      )?.textContent;
      if (label && window.hitFrames.at(-1)?.label !== label)
        window.hitFrames.push({
          label,
          hp: Number(
            document.querySelector(".opponent .fighter-hp b").textContent,
          ),
        });
    }).observe(document.querySelector("#battle-app"), { childList: true });
  });
  await page.locator(".battle-move").first().click();
  await expect(page.locator(".turn-indicator b")).toHaveText("2", {
    timeout: 25000,
  });
  const frames = await page.evaluate(() => window.hitFrames);
  expect(frames.map((f) => f.label)).toEqual([
    "1 / 3 HIT",
    "2 / 3 HIT",
    "3 / 3 HIT",
  ]);
  expect(frames[0].hp).toBeGreaterThan(frames[1].hp);
  expect(frames[1].hp).toBeGreaterThan(frames[2].hp);
  await expect(page.locator(".battle-move").first()).toContainText("PP 8/9");
  await expect(page.locator(".battle-move").first()).toBeEnabled();
  expect(errors).toEqual([]);
});

test("rare photo exposes a gold badge, base power, PP, rare cut-in and the 20-move catalog", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/#creator");
  await expect(page.locator("#add-team-button")).toBeEnabled();
  await page.locator("#photo-input").setInputFiles({
    name: "レア発見.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      encode({
        width: 8,
        height: 8,
        channels: 4,
        data: new Uint8Array(
          Array.from({ length: 64 }, () => [70, 230, 190, 255]).flat(),
        ),
      }),
    ),
  });
  await expect(page.locator("#card-name")).toHaveText("レア発見");
  await expect(page.locator(".rare-card-move")).toContainText("★ 天穹断裂");
  await expect(page.locator("#rule-label")).toHaveText("PHOTO-V3");
  for (let i = 0; i < 3; i++) {
    if (i) await page.locator('.view-nav [data-view="creator"]').click();
    await page.locator("#add-team-button").click();
  }
  await page.locator(".test-settings summary").click();
  await page.locator("#battle-seed").fill("12345");
  await page.locator('[data-action="start-cpu"]').click();
  const rare = page.locator(".battle-move.rare-skill");
  await expect(rare).toHaveCount(1);
  await expect(rare.locator(".rare-badge")).toHaveText("レア");
  await expect(rare.locator(".move-base-power")).toHaveText("威力 125");
  await expect(rare).toContainText("PP 3/3");
  const overflow = await rare.evaluate(
    (el) =>
      el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth,
  );
  expect(overflow).toBe(false);
  await page.locator('[data-action="rules"]').click();
  await expect(page.locator(".rare-catalog article")).toHaveCount(20);
  await page.locator('[data-action="close-sheet"]').click();
  await page.locator('[data-action="moves"]').click();
  await expect(page.locator(".sheet-moves .rare-move")).toContainText(
    "60%無視",
  );
  await page.locator('[data-action="close-sheet"]').click();
  // The cut-in lasts 820ms; observe DOM insertion instead of polling a transient node.
  await page.evaluate(() => {
    window.rareCutinSeen = false;
    new MutationObserver(() => {
      if (
        document.querySelector(".skill-cutin.is-rare strong")?.textContent ===
        "天穹断裂"
      )
        window.rareCutinSeen = true;
    }).observe(document.querySelector("#battle-app"), { childList: true });
  });
  await rare.click();
  await expect
    .poll(() => page.evaluate(() => window.rareCutinSeen), { timeout: 20000 })
    .toBe(true);
  await expect(page.locator(".turn-indicator b")).toHaveText("2", {
    timeout: 25000,
  });
  await expect(rare).toContainText("PP 2/3");
  expect(errors).toEqual([]);
});
