import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { encode } from "fast-png";
const root = new URL("../../", import.meta.url);
const manifest = JSON.parse(
  fs.readFileSync(new URL("public/strong-cards/manifest.json", root), "utf8"),
);
async function createLegend(page, id) {
  await page.goto("/#creator");
  await expect(page.locator("#add-team-button")).toBeEnabled();
  const card = manifest.cards.find((c) => c.id === id);
  await page
    .locator("#photo-input")
    .setInputFiles({
      name: card.name + ".png",
      mimeType: "image/png",
      buffer: fs.readFileSync(
        new URL("public/strong-cards/" + card.file, root),
      ),
    });
  await expect(page.locator("#card-name")).toHaveText(card.name, {
    timeout: 20000,
  });
  await expect(page.locator("#add-team-button")).toBeEnabled();
  return card;
}

test("legend import runs the real worker, shows a rare awakening and enters the existing team without replacing it", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const card = await createLegend(page, "05-jade-dragon");
  await expect(page.locator("#rare-awakening")).toBeVisible();
  await expect(page.locator("#rare-awakening strong")).toHaveText("天穹断裂");
  expect(
    await page
      .locator("#rare-awakening")
      .evaluate((el) => getComputedStyle(el).pointerEvents),
  ).toBe("none");
  await expect(page.locator("#card-primary-stats b")).toHaveText(
    Object.values(card.character.stats).map(String),
  );
  await expect(page.locator("#rule-label")).toHaveText("PHOTO-V3");
  await expect(page.locator("#card-mini-moves .rare-card-move")).toContainText(
    "天穹断裂",
  );
  await page.locator("#add-team-button").click();
  await expect(page.locator(".party-card")).toHaveCount(1);
  await expect(page.locator(".party-card")).toContainText(card.name);
  await expect(page.locator("#rare-awakening")).not.toBeVisible();
});

test("turning off effects dismisses the rare awakening immediately and normal photos do not trigger it", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await createLegend(page, "10-shadow-reaper");
  await expect(page.locator("#rare-awakening")).toBeVisible();
  await page.locator("#motion-toggle").click();
  await expect(page.locator("#rare-awakening")).not.toBeVisible();
  await page.locator("#motion-toggle").click();
  await page.locator("#photo-input").setInputFiles({
    name: "normal.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      encode({
        width: 8,
        height: 8,
        channels: 3,
        data: new Uint8Array(8 * 8 * 3).fill(127),
      }),
    ),
  });
  await expect(page.locator("#card-name")).toHaveText("normal");
  await expect(page.locator("#rare-awakening")).not.toBeVisible();
});

test("a real CPU knockout match presents FINAL BREAK before victory, with the three-card result lineup", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await createLegend(page, "05-jade-dragon");
  for (let i = 0; i < 3; i++) {
    if (i) await page.locator('.view-nav [data-view="creator"]').click();
    await page.locator("#add-team-button").click();
  }
  await page.locator(".test-settings summary").click();
  await page.locator("#battle-seed").fill("12345");
  await page.locator('[data-action="start-cpu"]').click();
  await page.evaluate(() => {
    window.finishes = [];
    new MutationObserver(() => {
      const cut = document.querySelector(".finisher-cut");
      if (cut && !window.finishes.length)
        window.finishes.push({
          text: cut.textContent,
          resultAlreadyVisible: !!document.querySelector(".result-banner"),
        });
    }).observe(document.getElementById("battle-app"), { childList: true });
  });
  for (let turn = 0; turn < 10; turn++) {
    if (await page.locator(".result-banner").count()) break;
    await expect(page.locator(".battle-move:enabled").first()).toBeVisible({
      timeout: 20000,
    });
    const rare = page.locator(".battle-move.rare-skill");
    if (await rare.isEnabled()) await rare.click();
    else await page.locator(".battle-move").nth(1).click();
    await expect
      .poll(
        async () =>
          await page.locator(".result-banner, .battle-move:enabled").count(),
        { timeout: 22000 },
      )
      .toBeGreaterThan(0);
  }
  await expect(page.locator(".result-banner")).toContainText("VICTORY");
  await expect(page.locator(".result-lineup img")).toHaveCount(3);
  await expect(page.locator(".result-lineup .is-active")).toHaveCount(1);
  const finishes = await page.evaluate(() => window.finishes);
  expect(finishes).toHaveLength(1);
  expect(finishes[0].text).toContain("FINAL BREAK");
  expect(finishes[0].resultAlreadyVisible).toBe(false);
});

test("game has no card catalogue or automatic strong-card requests", async ({
  page,
}) => {
  const packRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/strong-cards/"))
      packRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("#download-button")).toBeEnabled();
  await expect(page.locator("#vault-dialog, [data-open-vault]")).toHaveCount(0);
  await page.locator('.view-nav [data-view="creator"]').click();
  await expect(page.getByText("伝説のカード図鑑")).toHaveCount(0);
  expect(packRequests).toEqual([]);
});
