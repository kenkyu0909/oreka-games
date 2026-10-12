import { test, expect, devices } from "@playwright/test";
import { encode } from "fast-png";
import { existsSync, readFileSync } from "node:fs";

test("published build does not contain the spoiler pack or a catalogue entry", async ({
  page,
}) => {
  expect(existsSync("dist/strong-cards")).toBe(false);
  const html = readFileSync("dist/index.html", "utf8");
  expect(html).not.toContain("vault-dialog");
  expect(html).not.toContain("strong-cards");
  const requests = [],
    errors = [];
  page.on("request", (r) => {
    if (r.url().startsWith("http")) requests.push(new URL(r.url()).pathname);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#download-button")).toBeEnabled();
  await expect(page.locator(".hero-art img")).toHaveJSProperty(
    "complete",
    true,
  );
  expect(
    await page.locator(".hero-art img").evaluate((img) => img.naturalWidth),
  ).toBeGreaterThan(0);
  await expect(page.locator("#vault-dialog, [data-open-vault]")).toHaveCount(0);
  expect(requests.every((path) => path.startsWith("/oreka-games/"))).toBe(true);
  expect(errors).toEqual([]);
});

for (const device of ["iPhone 13", "Pixel 7"]) {
  test(`${device}: subdirectory build supports photo creation, team selection and CPU moves`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      ...devices[device],
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.goto("http://127.0.0.1:4173/oreka-games/#creator");
      await expect(page.locator("#photo-input")).toBeAttached();
      await expect(page.locator("#add-team-button")).toBeEnabled();
      await page
        .locator("#photo-input")
        .setInputFiles({
          name: "スマホの写真.png",
          mimeType: "image/png",
          buffer: Buffer.from(
            encode({
              width: 8,
              height: 8,
              channels: 3,
              data: new Uint8Array(8 * 8 * 3).fill(140),
            }),
          ),
        });
      await expect(page.locator("#card-name")).toHaveText("スマホの写真");
      await expect(page.locator("#add-team-button")).toBeEnabled();
      await page.locator("#add-team-button").tap();
      await expect(page.locator(".party-card")).toHaveCount(1);
      await page.locator('[data-action="samples"]').tap();
      await expect(page.locator(".party-card")).toHaveCount(3);
      await page.locator('[data-action="start-cpu"]').tap();
      await expect(page.locator(".battle-move")).toHaveCount(4);
      await page.locator(".battle-move").first().tap();
      await expect(page.locator(".turn-indicator b")).toHaveText("2", {
        timeout: 15000,
      });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test("Pages gives an honest online notice and never reconnects a stale room", async ({
  page,
}) => {
  const sockets = [];
  page.on("websocket", (ws) => sockets.push(ws.url()));
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "oreka-room-session-v1",
      JSON.stringify({ code: "ABCDEF", token: "old-token" }),
    ),
  );
  await page.goto("./");
  await page.locator('[data-home-action="online"]').click();
  await expect(page.locator(".match-panel")).toContainText(
    "Node.js対戦サーバー",
  );
  await expect(
    page.locator('[data-action="create-room"], [data-action="join-room"]'),
  ).toHaveCount(0);
  await page.locator('.view-nav [data-view="home"]').click();
  await page.locator("#mobile-guide-button").click();
  await expect(page.locator("#mobile-preview-notice")).toContainText(
    "GitHub Pages",
  );
  expect(sockets).toEqual([]);
});
