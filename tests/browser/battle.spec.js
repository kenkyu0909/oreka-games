import { test, expect } from "@playwright/test";
import { encode } from "fast-png";

async function openLobby(page) {
  await page.goto("/#battle");
  await expect(page.locator("#battle-app")).toBeVisible();
}
async function samples(page) {
  await page.locator('[data-action="samples"]').click();
  await expect(page.locator(".party-card")).toHaveCount(3);
  await expect(
    page.locator('[data-action="start-cpu"], [data-action="create-room"]'),
  ).toBeEnabled();
}

test("photo creation → add to team → reorder/remove; no photo upload for solo mode", async ({
  page,
}) => {
  const errors = [],
    requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request));
  await page.goto("/");
  await page.locator('.view-nav [data-view="creator"]').click();
  await expect(page.locator("#add-team-button")).toBeEnabled();
  const pixels = new Uint8Array(
    Array.from({ length: 64 }, () => [190, 60, 25, 255]).flat(),
  );
  await page.locator("#photo-input").setInputFiles({
    name: "my-photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      encode({ width: 8, height: 8, channels: 4, data: pixels }),
    ),
  });
  await expect(page.locator("#card-name")).toHaveText("my-photo");
  await page.locator("#name-input").fill("<img src=x>");
  await page.locator("#add-team-button").click();
  await expect(page.locator(".party-card")).toHaveCount(1);
  await expect(page.locator(".party-card h4")).toHaveText("<img src=x>");
  await expect(page.locator(".party-card h4 img")).toHaveCount(0);
  await samples(page);
  const second = await page.locator(".party-card h4").nth(1).textContent();
  await page.locator('[data-action="lead"]').nth(1).click();
  await expect(page.locator(".party-card h4").first()).toHaveText(second);
  await page.locator('[data-action="remove"]').first().click();
  await expect(page.locator(".party-card")).toHaveCount(2);
  await expect(page.locator('[data-action="start-cpu"]')).toBeDisabled();
  expect(errors).toEqual([]);
  expect(
    requests.some(
      (r) => r.method() === "POST" || r.resourceType() === "websocket",
    ),
  ).toBe(false);
});

async function cpu(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openLobby(page);
  await samples(page);
  await page.locator(".test-settings summary").click();
  await page.locator("#battle-seed").fill("12345");
  await page.locator('[data-action="start-cpu"]').click();
  await expect(page.locator(".battle-move").first()).toBeEnabled();
}
test("CPU auto finishes, logs export and deterministic rematch restores its opening hand", async ({
  page,
}) => {
  // Fast playback still separates actions; allow the full 60-turn limit to play.
  test.setTimeout(210000);
  await cpu(page);
  const initialHp = await page.locator(".own .fighter-hp").textContent();
  const initialMove = await page.locator(".battle-move").first().textContent();
  await page.locator("#fast-battle").check();
  await page.locator('[data-action="auto"]').click();
  await expect(page.locator(".result-banner")).toBeVisible({ timeout: 180000 });
  const promise = page.waitForEvent("download");
  await page.locator('[data-action="download-log"]').click();
  expect((await promise).suggestedFilename()).toMatch(
    /reframe-battle-.*\.json/,
  );
  await page.locator('[data-action="rematch"]').click();
  await expect(page.locator(".battle-move").first()).toBeEnabled();
  await expect(page.locator(".own .fighter-hp")).toHaveText(initialHp);
  await expect(page.locator(".battle-move").first()).toHaveText(initialMove);
  await page.locator('[data-action="options"]').click();
  await page.locator('[data-action="surrender"]').click();
  await page.locator('[data-action="cancel-exit"]').click();
  await expect(page.locator('[data-action="options"]')).toBeFocused();
  await page.locator('[data-action="options"]').click();
  await page.locator('[data-action="surrender"]').click();
  await page.locator('[data-action="confirm-exit"]').click();
  await expect(page.locator(".result-banner")).toContainText("DEFEAT");
  await page.locator('[data-action="back-lobby"]').click();
  await expect(page.locator(".party-card")).toHaveCount(3);
});
test("CPU turns resolve both choices and switching spends one turn", async ({
  page,
}) => {
  await cpu(page);
  await expect(page.locator(".turn-ribbon")).toContainText("SELECT ACTION");
  const pp = Number(
    (await page.locator(".battle-move").first().textContent()).match(
      /PP (\d+)/,
    )[1],
  );
  await page.locator(".battle-move").first().click();
  await expect(page.locator(".turn-indicator b")).toHaveText("2");
  await expect(page.locator(".battle-move").first()).toContainText(
    `PP ${pp - 1}/${pp}`,
  );
  await expect(page.locator(".battle-move").first()).toBeEnabled();
  await page.locator('[data-command="switch"]').click();
  const name = await page
    .locator(".bench-card")
    .nth(1)
    .locator("div span")
    .textContent();
  await page.locator(".bench-card").nth(1).click();
  await expect(page.locator(".own .fighter-hud-name")).toHaveText(name);
  await expect(page.locator(".battle-move").first()).toContainText(
    /PP (\d+)\/\1(?:\D|$)/,
  );
});
async function onlinePair(browser, secondAnimated = false) {
  const c1 = await browser.newContext({ reducedMotion: "reduce" }),
    c2 = await browser.newContext({
      reducedMotion: secondAnimated ? "no-preference" : "reduce",
    });
  const p1 = await c1.newPage(),
    p2 = await c2.newPage();
  await openLobby(p1);
  await samples(p1);
  await p1.locator('[data-mode="online"]').click();
  await p1.locator('[data-action="create-room"]').click();
  const code = await p1.locator(".room-code").textContent();
  await p2.goto(`/?room=${code}`);
  await samples(p2);
  if (secondAnimated) {
    const speeds = (
      await p2
        .locator(".party-card-info p span:nth-child(3) b")
        .allTextContents()
    ).map(Number);
    const fastest = speeds.indexOf(Math.max(...speeds));
    if (fastest !== 0)
      await p2.locator('[data-action="lead"]').nth(fastest).click();
  }
  await p2.locator('[data-action="join-room"]').click();
  await expect(p1.locator(".fighter")).toHaveCount(2);
  await expect(p2.locator(".fighter")).toHaveCount(2);
  return { c1, c2, p1, p2 };
}
test("online waits for both choices, preserves a commitment on reload and synchronizes surrender", async ({
  browser,
}) => {
  const { c1, c2, p1, p2 } = await onlinePair(browser);
  try {
    for (const p of [p1, p2]) p.on("dialog", (d) => d.accept());
    const hp = await p1.locator(".own .fighter-hp").textContent();
    await p1.locator(".battle-move").first().click();
    await expect(p1.locator(".turn-ribbon")).toContainText("LOCKED IN");
    await expect(p1.locator(".battle-move").first()).toBeDisabled();
    await expect(p2.locator(".battle-move").first()).toBeEnabled();
    await expect(p1.locator(".arena-stage")).toHaveAttribute(
      "data-sequence",
      "0",
    );
    await expect(p1.locator(".own .fighter-hp")).toHaveText(hp);
    await p1.reload();
    await expect(p1.locator(".turn-ribbon")).toContainText("LOCKED IN");
    await p2.locator(".battle-move").first().click();
    for (const p of [p1, p2]) {
      await expect(p.locator(".turn-indicator b")).toHaveText("2");
      await expect(p.locator(".battle-move").first()).toBeEnabled();
    }
    await expect(p1.locator(".opponent .fighter-hp")).toHaveText(
      await p2.locator(".own .fighter-hp").textContent(),
    );
    await p1.locator('[data-action="options"]').click();
    await p1.locator('[data-action="surrender"]').click();
    await p1.locator('[data-action="confirm-exit"]').click();
    await expect(p1.locator(".result-banner")).toContainText("DEFEAT");
    await expect(p2.locator(".result-banner")).toContainText("VICTORY");
  } finally {
    await c1.close();
    await c2.close();
  }
});
// 先制技は素早さに関係なく先に動く。速度順の再生を確かめるテストでは、
// 両者に先制でない技を選ばせて順序を決定的にする。
async function nonPriorityIndex(page) {
  const moves = page.locator(".battle-move");
  const count = await moves.count();
  for (let i = 0; i < count; i += 1) {
    const label = (await moves.nth(i).getAttribute("aria-label")) || "";
    if (!label.includes("先制")) return i;
  }
  return 0;
}
test("online replays attacks in speed order, accepts next-turn readiness without restarting animation", async ({
  browser,
}) => {
  const { c1, c2, p1, p2 } = await onlinePair(browser, true);
  try {
    await p2.evaluate(() => {
      window.charges = [];
      let last = "";
      new MutationObserver(() => {
        const phase = document.querySelector(".arena-stage")?.dataset.effect;
        const side = document.querySelector(".effect-charge")?.dataset.side;
        const key = phase + ":" + side;
        if (phase === "charge" && key !== last)
          window.charges.push(Number(side));
        last = key;
      }).observe(document.querySelector("#battle-app"), { childList: true });
    });
    await p1.locator(".battle-move").nth(await nonPriorityIndex(p1)).click();
    await p2.locator(".battle-move").nth(await nonPriorityIndex(p2)).click();
    await expect(p1.locator(".turn-indicator b")).toHaveText("2");
    await expect(p2.locator(".is-resolving")).toBeVisible();
    await p1.locator(".battle-move").first().click();
    await expect(p1.locator(".turn-ribbon")).toContainText("LOCKED IN");
    await expect(p2.locator(".arena-stage")).toHaveAttribute(
      "data-sequence",
      "1",
      { timeout: 20000 },
    );
    expect(await p2.evaluate(() => window.charges)).toEqual([1, 0]);
    await expect(p2.locator(".battle-move").first()).toBeEnabled();
    await expect(p2.locator(".own .fighter-hp")).toHaveText(
      await p1.locator(".opponent .fighter-hp").textContent(),
    );
    await p2.locator(".battle-move").first().click();
    await expect(p2.locator(".is-resolving")).toBeVisible();
    await p1.locator('[data-action="options"]').click();
    await p1.locator('[data-action="surrender"]').click();
    await p1.locator('[data-action="confirm-exit"]').click();
    await expect(p2.locator(".result-banner")).toContainText("VICTORY");
    await p2.locator('[data-action="back-lobby"]').click();
    await p2.waitForTimeout(1200);
    await expect(p2.locator(".fighter")).toHaveCount(0);
  } finally {
    await c1.close();
    await c2.close();
  }
});
test("invalid room code preserves party", async ({ page }) => {
  await openLobby(page);
  await samples(page);
  await page.locator('[data-mode="online"]').click();
  await page.locator("#room-code-input").fill("bad");
  await page.locator('[data-action="join-room"]').click();
  await expect(page.locator("#battle-notice")).toContainText("6文字");
  await expect(page.locator(".party-card")).toHaveCount(3);
});

test("stopping autoplay does not choose a move or advance the turn", async ({
  page,
}) => {
  await cpu(page);
  await page.locator('[data-action="auto"]').click();
  await page.locator('[data-action="auto"]').click();
  await page.waitForTimeout(900);
  await expect(page.locator(".turn-indicator b")).toHaveText("1");
  await expect(page.locator(".battle-move").first()).toBeEnabled();
  await page.locator(".battle-move").first().click();
  await expect(page.locator(".turn-indicator b")).toHaveText("2");
});
