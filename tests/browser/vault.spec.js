import { test, expect, devices } from "@playwright/test";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { encode } from "fast-png";
const root = new URL("../../", import.meta.url);
const manifest = JSON.parse(
  fs.readFileSync(new URL("public/strong-cards/manifest.json", root), "utf8"),
);
async function openVault(page) {
  await page.goto("/");
  await expect(page.locator(".hero-vault-hit")).toBeEnabled();
  await page.locator(".hero-vault-hit").click();
  await expect(page.locator(".vault-tile")).toHaveCount(10);
}
async function createLegend(page, id) {
  await openVault(page);
  await page.locator(`[data-vault-card="${id}"]`).click();
  await page.locator("#vault-create").click();
  const card = manifest.cards.find((c) => c.id === id);
  await expect(page.locator("#card-name")).toHaveText(card.name, {
    timeout: 20000,
  });
  await expect(page.locator("#add-team-button")).toBeEnabled();
  return card;
}

test("vault loads only lightweight art, filters six attributes, saves the exact original and restores focus", async ({
  page,
}, testInfo) => {
  const originals = [];
  page.on("request", (request) => {
    if (request.url().includes("/originals/")) originals.push(request.url());
  });
  await openVault(page);
  expect(originals).toEqual([]);
  await page.locator('[data-vault-filter="water"]').click();
  await expect(page.locator(".vault-tile")).toHaveCount(2);
  await expect(page.locator(".vault-stats > div")).toHaveCount(10);
  await expect(page.locator(".vault-moves li")).toHaveCount(4);
  await expect(page.locator(".vault-moves .rare")).toHaveCount(1);
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".vault-actions a").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("03-ocean-leviathan.png");
  const file = testInfo.outputPath("original.png");
  await download.saveAs(file);
  expect(createHash("sha256").update(fs.readFileSync(file)).digest("hex")).toBe(
    manifest.cards[2].sha256,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#vault-dialog")).not.toBeVisible();
  await expect(page.locator(".hero-vault-hit")).toBeFocused();
});

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

test("failed manifest and corrupted PNG are actionable and retryable, never applied as a card", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/strong-cards/manifest.json", (route) =>
    fail
      ? route.fulfill({ status: 503, body: "unavailable" })
      : route.continue(),
  );
  await page.goto("/");
  await expect(page.locator(".hero-vault-hit")).toBeEnabled();
  const originalName = await page.locator("#card-name").textContent();
  await page.locator(".hero-vault-hit").click();
  await expect(page.locator("#vault-status")).toContainText(
    "図鑑を読み込めません",
  );
  await page.locator("#vault-close").click();
  fail = false;
  await page.locator(".hero-vault-hit").click();
  await expect(page.locator(".vault-tile")).toHaveCount(10);
  const card = manifest.cards[0];
  const bad = Buffer.from(
    fs.readFileSync(new URL("public/strong-cards/" + card.file, root)),
  );
  bad[100] ^= 1;
  await page.route("**/" + card.file, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: bad }),
  );
  await page.locator("#vault-create").click();
  await expect(page.locator("#vault-status")).toContainText("原本の照合に失敗");
  await expect(page.locator("#vault-create")).toBeEnabled();
  await expect(page.locator("#card-name")).toHaveText(originalName);
  await page.unroute("**/" + card.file);
  await page.locator("#vault-create").click();
  await expect(page.locator("#card-name")).toHaveText(card.name, {
    timeout: 20000,
  });
});

test("closing during an image fetch cancels the import without navigating or changing the current card", async ({
  page,
}) => {
  await openVault(page);
  const originalName = await page.locator("#card-name").textContent();
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route("**/originals/*.png", async (route) => {
    await gate;
    await route.abort().catch(() => {});
  });
  await page.locator("#vault-create").click();
  await expect(page.locator("#vault-create")).toBeDisabled();
  await page.locator("#vault-close").click();
  release();
  await expect(page.locator("body")).toHaveAttribute("data-view", "home");
  await expect(page.locator("#card-name")).toHaveText(originalName);
  await page.locator(".hero-vault-hit").click();
  await expect(page.locator("#vault-create")).toBeEnabled();
});

test("320px touch vault has accessible controls, scrolls to create and tolerates orientation changes", async ({
  browser,
}) => {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: 320, height: 740 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:3000/");
    await expect(page.locator(".hero-vault-hit")).toBeEnabled();
    await page.locator(".hero-vault-hit").tap();
    await expect(page.locator(".vault-tile")).toHaveCount(10);
    await page.locator('[data-vault-filter="light"]').tap();
    await expect(page.locator(".vault-tile")).toHaveCount(1);
    for (const size of [
      { width: 320, height: 740 },
      { width: 740, height: 320 },
    ]) {
      await page.setViewportSize(size);
      const bounds = await page.locator("#vault-dialog").boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height);
      await page.locator("#vault-create").scrollIntoViewIfNeeded();
      const accessible = await page.locator("#vault-create").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        );
      });
      expect(accessible).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 740 });
    await page.locator("#vault-create").tap();
    await expect(page.locator("#card-name")).toHaveText(
      manifest.cards[8].name,
      { timeout: 20000 },
    );
    await expect(page.locator("#rare-awakening")).not.toBeVisible();
    await expect(page.locator("#status")).toContainText("創世の光槍");
  } finally {
    await context.close();
  }
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
  await page
    .locator("#photo-input")
    .setInputFiles({
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
