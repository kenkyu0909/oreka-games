import { readFile } from "node:fs/promises";
import { decode } from "fast-png";
import { RARE_MOVE_LIBRARY } from "../../src/rare-moves.js";
import { MOVE_LIBRARY } from "../../src/moves.js";
import { test, expect } from "@playwright/test";
import { motionOff } from "./motion.js";

async function quickBattle(page, reduced = false) {
  if (reduced) await motionOff(page);
  await page.goto("/");
  await expect(page.locator("#home-screen")).toBeVisible();
  // ホームからは編成へ。サンプルは自動で入らず、編成画面で明示的にセットする。
  await page.locator('[data-home-action="duel"]').click();
  await expect(page.locator(".match-panel")).toBeVisible();
  await page.locator('[data-action="samples"]').click();
  await expect(page.locator(".party-card")).toHaveCount(3);
  await page.locator('[data-action="start-cpu"]').click();
  await expect(page.locator(".fighter")).toHaveCount(2);
  await expect(page.locator('[data-action="move"]').first()).toBeEnabled({
    timeout: 20000,
  });
}

async function assertControlsFit(page) {
  const problems = await page.evaluate(() => {
    const nav = document.querySelector(".view-nav").getBoundingClientRect();
    const header = document
      .querySelector(".site-header")
      .getBoundingClientRect();
    const lower = nav.top > innerHeight / 2 ? nav.top : innerHeight - 30;
    return [
      ...document.querySelectorAll(
        ".battle-move, .bench-card, .duel-card, .command-toolbar button, .battle-message, .battle-top-tools button",
      ),
    ]
      .filter((el) => el.getClientRects().length)
      .flatMap((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.x + r.width / 2,
          r.y + r.height / 2,
        );
        const covered = hit && hit !== el && !el.contains(hit);
        return r.left < 0 ||
          r.right > innerWidth + 1 ||
          r.top < header.bottom ||
          r.bottom > lower + 1 ||
          covered
          ? [el.className || el.textContent]
          : [];
      });
  });
  expect(problems).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <= innerHeight &&
        document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

// On short phones, readable cards/copy take precedence over shrinking everything.
async function assertControlsReachable(page) {
  for (const item of await page
    .locator(
      ".battle-move, .bench-card, .duel-card, .command-toolbar button, .battle-top-tools button",
    )
    .all()) {
    await item.scrollIntoViewIfNeeded();
    const clear = await item.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return (
        r.left >= 0 &&
        r.right <= innerWidth + 1 &&
        (el === hit || el.contains(hit))
      );
    });
    expect(clear).toBe(true);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

for (const size of [
  { width: 390, height: 844 },
  { width: 320, height: 740 },
  { width: 360, height: 640 },
]) {
  test(`${size.width}×${size.height}: cards and readable moves remain reachable without clipping`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await quickBattle(page, true);
    await expect(page.locator(".battle-move")).toHaveCount(4);
    for (const button of await page.locator(".battle-move").all()) {
      const name = await button.locator(".move-button-heading b").textContent();
      const move = [...MOVE_LIBRARY, ...RARE_MOVE_LIBRARY].find(
        (m) => m.name === name,
      );
      expect(move).toBeTruthy();
      await expect(button.locator(".move-base-power")).toHaveText(
        `威力 ${move.power ?? "—"}${move.hits ? `×${move.hits}` : ""}`,
      );
      const label = await button.locator(".move-base-power").boundingBox();
      const box = await button.boundingBox();
      expect(label.x).toBeGreaterThanOrEqual(box.x);
      expect(label.y + label.height).toBeLessThanOrEqual(box.y + box.height);
    }
    await expect(page.locator(".arcade-crest")).toHaveCount(2);
    await expect(
      page.locator(".arcade-card-rail, .duel-card-footer"),
    ).toHaveCount(0);
    const minimumHeight =
      size.width === 390 ? 235 : size.width === 320 ? 180 : 210;
    for (const card of await page.locator(".duel-card").all()) {
      expect((await card.boundingBox()).height).toBeGreaterThanOrEqual(
        minimumHeight,
      );
    }
    await (size.height >= 800
      ? assertControlsFit(page)
      : assertControlsReachable(page));
    await page.locator('[data-command="switch"]').click();
    await expect(page.locator(".bench-card")).toHaveCount(3);
    await (size.height >= 800
      ? assertControlsFit(page)
      : assertControlsReachable(page));
    await page.locator(".bench-card").nth(1).click();
    await expect(page.locator(".turn-indicator b")).toHaveText("2", {
      timeout: 15000,
    });
    await (size.height >= 800
      ? assertControlsFit(page)
      : assertControlsReachable(page));
  });
}

test("latest action, skip, own skills; battle has no public abilities or opponent move sheet", async ({
  page,
}) => {
  await quickBattle(page);
  await expect(page.locator("#battle-log-list")).toHaveCount(0);
  await page.locator('[data-action="move"]').first().click();
  await expect(page.locator(".is-resolving")).toBeVisible();
  await expect(page.locator('[data-action="move"]').first()).toBeDisabled();
  await page.locator('[data-action="skip-animation"]').click();
  await expect(page.locator(".turn-indicator b")).toHaveText("2", {
    timeout: 15000,
  });
  await expect(page.locator('[data-action="move"]').first()).toBeEnabled({
    timeout: 20000,
  });
  await expect(page.locator(".is-resolving")).toHaveCount(0);
  const latest = await page.locator("#latest-event").textContent();
  await page.locator('[data-action="history"]').click();
  await expect(page.locator("#battle-sheet")).toBeVisible();
  await expect(page.locator("#battle-log-list")).toContainText(latest);
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-action="history"]')).toBeFocused();
  await page.locator('[data-action="moves"]').click();
  await expect(page.locator(".sheet-moves .move-item")).toHaveCount(4);
  await page.locator('[data-action="close-sheet"]').click();
  await expect(page.locator('[data-action="inspect"]')).toHaveCount(0);
  await expect(page.locator(".duel-card-stats,.sheet-stats")).toHaveCount(0);
  await expect(page.locator(".battle-move")).not.toContainText([
    "目安",
    "目安",
    "目安",
    "目安",
  ]);
  await page.locator(".opponent .duel-card").click();
  await expect(page.locator("#battle-sheet")).toHaveCount(0);
  await expect(page.locator("#latest-event")).toHaveText(latest);
  // Leaving an in-flight presentation must not lock the battle on return.
  await page.locator('[data-action="move"]').first().click();
  await expect(page.locator(".is-resolving")).toBeVisible();
  await page.locator('.view-nav [data-view="home"]').click();
  await page.locator('.view-nav [data-view="battle"]').click();
  await expect(page.locator(".turn-indicator b")).toHaveText("3", {
    timeout: 15000,
  });
  await expect(page.locator('[data-action="move"]').first()).toBeEnabled({
    timeout: 20000,
  });
});

test("audio opt-in persists; motion off suppresses attack animations", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await quickBattle(page, true);
  await expect(page.locator("#sound-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator("body")).toHaveAttribute("data-motion", "off");
  await page.locator("#sound-toggle").click();
  await expect(page.locator("#sound-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator('[data-action="move"]').first().click();
  await expect(page.locator(".turn-indicator b")).toHaveText("2", {
    timeout: 15000,
  });
  await expect(page.locator(".is-resolving")).toHaveCount(0);
  expect(
    await page
      .locator(".own .duel-card")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.locator('[data-action="options"]').click();
  await page.locator('[data-action="sound"]').click();
  await expect(page.locator('[data-action="sound"]')).toBeFocused();
  await expect(page.locator('[data-action="sound"]')).toContainText("OFF");
  await page.locator('[data-action="sound"]').click();
  await page.locator('[data-action="surrender"]').click();
  await page.locator('[data-action="confirm-exit"]').click();
  await expect(page.locator(".result-banner")).toBeVisible();
  await page.reload();
  await expect(page.locator("#sound-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("body")).toHaveAttribute("data-motion", "off");
  expect(errors).toEqual([]);
});

test("short-height fallback keeps battle controls reachable by scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await quickBattle(page, true);
  await page.locator(".battle-move").first().click();
  await expect(page.locator(".turn-indicator b")).toHaveText("2", {
    timeout: 15000,
  });
  await page.locator('[data-action="options"]').click();
  await expect(page.locator("#battle-sheet")).toBeVisible();
  await page.locator('[data-action="surrender"]').click();
  await page.locator('[data-action="cancel-exit"]').click();
  await page.locator(".battle-move").first().click();
  await expect(page.locator(".turn-indicator b")).toHaveText("3", {
    timeout: 15000,
  });
});

test("presentation and audio do not change seeded HP, PP or the battle log", async ({
  page,
}) => {
  await page.goto("/#battle");
  await page.locator('[data-action="samples"]').click();
  await expect(page.locator(".party-card")).toHaveCount(3);
  await page.locator(".test-settings summary").click();
  await page.locator("#battle-seed").fill("12345");
  await page.locator('[data-action="start-cpu"]').click();
  await page.locator("#sound-toggle").click();
  async function playAndReadLog() {
    await expect(page.locator('[data-action="move"]').first()).toBeEnabled({
      timeout: 20000,
    });
    await page.locator(".battle-move").first().click();
    await expect(page.locator(".turn-indicator b")).toHaveText("2", {
      timeout: 20000,
    });
    await page.locator('[data-action="history"]').click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator('[data-action="download-log"]').click();
    const download = await downloadPromise;
    const data = JSON.parse(await readFile(await download.path(), "utf8"));
    await page.locator('[data-action="close-sheet"]').click();
    return data;
  }
  const animated = await playAndReadLog();
  await page.locator('[data-action="options"]').click();
  await page.locator('[data-action="surrender"]').click();
  await page.locator('[data-action="confirm-exit"]').click();
  await page.locator('[data-action="rematch"]').click();
  await page.locator("#sound-toggle").click();
  await page.locator("#fast-battle").check();
  const fast = await playAndReadLog();
  expect(fast).toEqual(animated);
});

test("mobile home and creator cards do not cover text or controls", async ({
  page,
}) => {
  await motionOff(page);
  for (const size of [
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/");
    const home = await page.evaluate(() => {
      const card = document.querySelector(".hero-card").getBoundingClientRect();
      const description = document.querySelector(".home-description");
      const copy =
        getComputedStyle(description).display === "none"
          ? document.querySelector(".home-copy h1")
          : description;
      return {
        cardTop: card.top,
        cardBottom: card.bottom,
        copyBottom: copy.getBoundingClientRect().bottom,
        actionTop: document
          .querySelector(".home-primary")
          .getBoundingClientRect().top,
      };
    });
    expect(home.cardTop).toBeGreaterThanOrEqual(home.copyBottom);
    expect(home.cardBottom).toBeLessThanOrEqual(home.actionTop);
    await page.locator('.view-nav [data-view="creator"]').click();
    // 空のカードでは配置が変わるので、サンプルを1枚つくってから測る。
    await page.locator("#sample-button").click();
    await expect(page.locator("#add-team-button")).toBeEnabled({
      timeout: 15000,
    });
    const creator = await page.evaluate(() => {
      const card = document
        .querySelector("#card-shell")
        .getBoundingClientRect();
      return {
        cardTop: card.top,
        cardBottom: card.bottom,
        uploadBottom: document
          .querySelector(".upload-zone .primary-button")
          .getBoundingClientRect().bottom,
        detailTop: document
          .querySelector("#creator-details-button")
          .getBoundingClientRect().top,
      };
    });
    expect(creator.cardTop).toBeGreaterThanOrEqual(creator.uploadBottom);
    expect(creator.cardBottom).toBeLessThanOrEqual(creator.detailTop);
    await page.locator("#creator-details-button").click();
    await expect(page.locator("#creator-details")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#creator-details-button")).toBeFocused();
  }
});

test("an attack visibly stages charge → projectile → impact; HP changes only at impact", async ({
  page,
}) => {
  await page.goto("/#battle");
  await page.locator('[data-action="samples"]').click();
  await expect(page.locator(".party-card")).toHaveCount(3);
  await page.locator(".test-settings summary").click();
  await page.locator("#battle-seed").fill("12345");
  await page.locator('[data-action="start-cpu"]').click();

  await page.evaluate(() => {
    window.attackFrames = [];
    new MutationObserver(() => {
      const stage = document.querySelector(".arena-stage");
      const kind = stage?.dataset.effect;
      if (!["charge", "strike", "damage"].includes(kind)) return;
      if (window.attackFrames.at(-1)?.kind === kind) return;
      const actors = document.querySelectorAll(".effect-charge,.effect-strike");
      window.attackFrames.push({
        kind,
        actorCount: actors.length,
        attacker: document.querySelector(".effect-charge,.effect-strike")
          ?.dataset.side,
        victim: document.querySelector(".effect-damage")?.dataset.side,
        ownHp: document.querySelector(".own .fighter-hp b").textContent,
        enemyHp: document.querySelector(".opponent .fighter-hp b").textContent,
        cutinWidth:
          document.querySelector(".skill-cutin")?.getBoundingClientRect()
            .width || 0,
        projectile: !!document.querySelector(".vfx-flight"),
        popup: !!document.querySelector(".damage-popup"),
      });
    }).observe(document.querySelector("#battle-app"), { childList: true });
  });
  await page.locator(".battle-move").first().click();
  await expect
    .poll(() => page.evaluate(() => window.attackFrames.length), {
      timeout: 15000,
    })
    .toBeGreaterThanOrEqual(3);
  const frames = await page.evaluate(() => window.attackFrames.slice(0, 3));
  expect(frames.map((f) => f.kind)).toEqual(["charge", "strike", "damage"]);
  expect(frames[0].cutinWidth).toBeGreaterThan(200);
  expect(frames[0].actorCount).toBe(1);
  expect(frames[1].actorCount).toBe(1);
  expect(frames[1].projectile).toBe(true);
  expect(frames[2].popup).toBe(true);
  const victim = frames[0].attacker === "0" ? "enemyHp" : "ownHp";
  const attacker = frames[0].attacker === "0" ? "ownHp" : "enemyHp";
  expect(frames[0][victim]).toBe(frames[1][victim]);
  expect(Number(frames[2][victim])).toBeLessThan(Number(frames[1][victim]));
  expect(frames[0][attacker]).toBe(frames[2][attacker]);
});

test("sound opt-in creates real audio nodes, while mute creates none even during attacks", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.toneStarts = 0;
    window.AudioContext = class extends Native {
      createOscillator() {
        const node = super.createOscillator(),
          start = node.start.bind(node);
        node.start = (...args) => {
          window.toneStarts++;
          return start(...args);
        };
        return node;
      }
    };
  });
  await quickBattle(page, true);
  expect(await page.evaluate(() => window.toneStarts)).toBe(0);
  await page.locator("#sound-toggle").click();
  await expect
    .poll(() => page.evaluate(() => window.toneStarts))
    .toBeGreaterThan(0);
  const initial = await page.evaluate(() => window.toneStarts);
  await page.locator(".battle-move").first().click();
  await expect
    .poll(() => page.evaluate(() => window.toneStarts))
    .toBeGreaterThan(initial + 1);
  await page.locator("#sound-toggle").click();
  const muted = await page.evaluate(() => window.toneStarts);
  await expect(page.locator(".battle-move").first()).toBeEnabled();
  await page.locator(".battle-move").first().click();
  await expect(page.locator(".turn-indicator b")).toHaveText("3", {
    timeout: 15000,
  });
  expect(await page.evaluate(() => window.toneStarts)).toBe(muted);
});

test("arcade paper card preserves ten abilities in creator and exports a full PNG", async ({
  page,
}, testInfo) => {
  await motionOff(page);
  await page.goto("/#creator");
  await page.locator("#sample-button").click();
  await expect(page.locator("#download-button")).toBeEnabled({
    timeout: 15000,
  });
  await expect(page.locator("#card-primary-stats > div")).toHaveCount(10);
  await expect(page.locator("#card-mini-moves > span")).toHaveCount(4);
  await page.locator("#name-input").fill("テストの守護者");
  const promise = page.waitForEvent("download");
  await page.locator("#download-button").click();
  const download = await promise;
  expect(download.suggestedFilename()).toMatch(/reframe-.*\.png/);
  const output = testInfo.outputPath("card.png");
  await download.saveAs(output);
  const image = decode(await readFile(output));
  expect([image.width, image.height]).toEqual([900, 1420]);
  // Paper region below the picture stays light, instead of the previous dark card.
  const i = (845 * image.width + 450) * image.channels;
  expect(image.data[i]).toBeGreaterThan(180);
  expect(image.data[i + 1]).toBeGreaterThan(180);
});
