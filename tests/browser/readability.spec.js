import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function start(page) {
  await page.goto("/#battle");
  await page.locator('[data-action="samples"]').click();
  await expect(page.locator(".party-card")).toHaveCount(3);
  await page.locator(".test-settings summary").click();
  await page.locator("#battle-seed").fill("12345");
  await page.locator('[data-action="start-cpu"]').click();
  await expect(page.locator(".battle-move").first()).toBeEnabled();
}
for (const [width, height, minimum] of [
  [1366, 768, 400],
  [1920, 1080, 670],
]) {
  test(`${width}×${height}: substantially larger cards and untruncated move explanations`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await start(page);
    for (const card of await page.locator(".duel-card").all())
      expect((await card.boundingBox()).height).toBeGreaterThanOrEqual(minimum);
    for (const button of await page.locator(".battle-move").all()) {
      await expect(button.locator(".move-explanation")).not.toBeEmpty();
      await expect(button.locator(".move-button-meta")).toContainText("命中");
      const fits = await button.evaluate((b) => {
        const r = b.getBoundingClientRect(),
          p = b.querySelector(".move-explanation").getBoundingClientRect();
        return (
          p.top >= r.top && p.bottom <= r.bottom && r.bottom < innerHeight - 30
        );
      });
      expect(fits).toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
  });
}
for (const mode of ["normal", "reduced", "fast"]) {
  test(`${mode}: announces each actor, applies hits in order, and separates opposing actions`, async ({
    page,
  }) => {
    await page.emulateMedia({
      reducedMotion: mode === "reduced" ? "reduce" : "no-preference",
    });
    await start(page);
    if (mode === "fast") await page.locator("#fast-battle").check();
    await page.evaluate(() => {
      window.playbackFrames = [];
      new MutationObserver(() => {
        const stage = document.querySelector(".arena-stage");
        if (!stage?.classList.contains("is-resolving")) return;
        window.playbackFrames.push({
          number: Number(stage.dataset.actionNumber),
          phase: stage.dataset.phase,
          effect: stage.dataset.effect,
          actor: stage.dataset.actor,
          title: stage.querySelector(".turn-ribbon b").textContent,
          hp: [0, 1].map((s) =>
            Number(
              stage.querySelector(`.fighter[data-side="${s}"] .fighter-hp b`)
                .textContent,
            ),
          ),
          active: stage.querySelectorAll(".is-acting").length,
          cut: !!stage.querySelector(".skill-cutin,.vfx-flight"),
          time: performance.now(),
        });
      }).observe(document.getElementById("battle-app"), { childList: true });
    });
    await page.locator(".battle-move").first().click();
    await expect(page.locator(".turn-indicator b")).toHaveText("2", {
      timeout: 20000,
    });
    const frames = await page.evaluate(() => window.playbackFrames);
    const charges = frames.filter((f) => f.effect === "charge");
    expect(charges).toHaveLength(2);
    expect(charges.map((f) => f.number)).toEqual([1, 2]);
    expect(charges[0].actor).not.toBe(charges[1].actor);
    expect(charges[0].title).toContain("先攻");
    expect(charges[1].title).toContain("後攻");
    expect(charges[1].time - charges[0].time).toBeGreaterThan(500);
    expect(
      frames.some(
        (f) => f.phase === "handoff" && f.actor === "both" && f.active === 0,
      ),
    ).toBe(true);
    for (const f of frames) expect(f.active).toBeLessThanOrEqual(1);
    if (mode !== "normal") expect(frames.some((f) => f.cut)).toBe(false);
    await page.locator('[data-action="history"]').click();
    const promise = page.waitForEvent("download");
    await page.locator('[data-action="download-log"]').click();
    const log = JSON.parse(
      await readFile(await (await promise).path(), "utf8"),
    ).log;
    const actions = log.filter((e) => e.kind === "move");
    expect(charges.map((f) => f.actor)).toEqual(
      actions.map((e) => (e.side === 0 ? "own" : "opponent")),
    );
    const damageFrames = frames.filter((f) => f.effect === "damage");
    const hits = log.filter((e) => e.kind === "damage");
    expect(damageFrames).toHaveLength(hits.length);
    for (let i = 0; i < hits.length; i++)
      expect(damageFrames[i].hp[hits[i].side]).toBe(hits[i].hp);
    const firstHit = damageFrames.find((f) => f.number === 1);
    expect(firstHit).toBeTruthy();
    // The slower action has not been applied to the faster card's HP yet.
    const firstSide = actions[0].side;
    expect(firstHit.hp[firstSide]).toBe(charges[0].hp[firstSide]);
  });
}
test("turning effects off mid-action keeps ordered playback; explicit skip still exits cleanly", async ({
  page,
}) => {
  await start(page);
  await page.locator(".battle-move").first().click();
  await expect(page.locator(".is-resolving")).toBeVisible();
  await page.locator("#motion-toggle").click();
  await expect(page.locator(".is-resolving")).toBeVisible();
  await expect(page.locator(".skill-cutin,.vfx-flight")).toHaveCount(0);
  await expect(page.locator(".battle-move").first()).toBeDisabled();
  // Keyboard activation also works while the render snapshots are advancing.
  await page.locator('[data-action="skip-animation"]').press("Enter");
  await expect(page.locator(".is-resolving")).toHaveCount(0);
  await expect(page.locator(".turn-indicator b")).toHaveText("2");
  await expect(page.locator(".battle-move").first()).toBeEnabled();
});
