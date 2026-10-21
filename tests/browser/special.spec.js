import { test, expect } from "@playwright/test";
import { encode } from "fast-png";

// カード名を入れてチームに1枚追加する。名前は生成後に変えられるので、
// 特殊カードの判定もその場で切り替わる必要がある。
async function addCard(page, name) {
  await page.locator("#name-input").fill(name);
  await expect(page.locator("#card-name")).toHaveText(name);
  await page.locator("#add-team-button").click();
}

async function openCreator(page) {
  await page.goto("/");
  await page.locator('.view-nav [data-view="creator"]').click();
  // デフォルトのカードは無いので、名前を変えて試すためのサンプルを1枚つくる。
  await expect(page.locator("#add-team-button")).toBeDisabled();
  await page.locator("#sample-button").click();
  await expect(page.locator("#add-team-button")).toBeEnabled({ timeout: 15000 });
}

const photoPixels = () =>
  new Uint8Array(
    Array.from({ length: 64 }, () => [120, 40, 60, 255]).flat(),
  );

test("special card: 生成時に必殺技演出、バトル中は写真と技名のフラッシュ", async ({
  page,
}) => {
  const errors = [],
    voice = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/audio/gandora-x.wav")) voice.push(request.url());
  });
  // 音声は ♪ トグルに従う。ここではオンの状態から始める。
  await page.addInitScript(() => {
    localStorage.setItem(
      "reframe-ui-preferences",
      JSON.stringify({ sound: true }),
    );
  });

  // 写真を選び、名前を入れて生成する。必殺技演出はこの生成時に流れる。
  await page.goto("/#creator");
  await expect(page.locator("#upload-button")).toBeEnabled();
  await page.locator("#photo-input").setInputFiles({
    name: "gandora.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      encode({
        width: 8,
        height: 8,
        channels: 4,
        data: photoPixels(),
      }),
    ),
  });
  await page.locator("#name-input").fill("破壊竜ガンドラG");
  await expect(page.locator("#card-name")).toHaveText("破壊竜ガンドラG");
  await page.locator("#generate-button").click();

  const cutin = page.locator("#battle-cutin");
  await expect(cutin).toBeVisible({ timeout: 20000 });
  await expect(cutin.locator(".cutin-name")).toHaveText("破壊竜ガンドラG");
  await expect(cutin.locator(".cutin-move")).toHaveText(
    "デストロイ・ギガ・レイズ",
  );
  // カットインは操作を奪わない。
  await expect(cutin).toHaveCSS("pointer-events", "none");
  // 登録された音声ファイルを取りに行く。
  await expect.poll(() => voice.length, { timeout: 5000 }).toBeGreaterThan(0);
  await expect(cutin).toBeHidden({ timeout: 6000 });

  // 4枠目が特殊技として並び、後攻であることが分かる。
  await expect(page.locator("#card-mini-moves")).toContainText(
    "デストロイ・ギガ・レイズ",
  );
  await expect(page.locator("#card-type")).toContainText("特殊カード");
  await expect(page.locator("#moves-list .special-move")).toHaveCount(1);
  await expect(page.locator("#moves-list .special-badge")).toHaveCount(1);
  await expect(page.locator("#moves-list .special-move")).toContainText("後攻");
  await expect(page.locator("#moves-list .special-move")).toContainText("破壊");
  await expect(page.locator("#moves-list .special-move")).toContainText("PP 1");

  // 名前を戻すと通常のカードに戻る（特殊技は消える）。
  await page.locator("#name-input").fill("ただの切り札");
  await expect(page.locator("#card-mini-moves")).not.toContainText(
    "デストロイ・ギガ・レイズ",
  );
  await expect(page.locator("#card-type")).not.toContainText("特殊カード");

  // 特殊カードを1枚、通常カードを2枚。
  await addCard(page, "破壊竜ガンドラG");
  await page.locator('.view-nav [data-view="creator"]').click();
  await addCard(page, "ふつうの一枚");
  await page.locator('.view-nav [data-view="creator"]').click();
  await addCard(page, "つぎの一枚");
  await page.locator('.view-nav [data-view="battle"]').click();
  await expect(page.locator(".party-card")).toHaveCount(3);

  await page.locator('[data-action="start-cpu"]').click();
  // 登場時ではなく、技を撃った瞬間に写真と技名だけがフラッシュする。
  const flash = page.locator("#special-flash");
  await expect(flash).toBeHidden();
  const special = page.locator(".battle-move.special-skill");
  await expect(special).toContainText("デストロイ・ギガ・レイズ");
  await expect(special).toContainText("特殊");
  await expect(special).toContainText("通常技より後に行動");
  await expect(special).toContainText("PP 1/1");

  await page.evaluate(() => {
    window.__destroySeen = false;
    new MutationObserver(() => {
      if (document.querySelector("#battle-app .vfx-destroy"))
        window.__destroySeen = true;
    }).observe(document.getElementById("battle-app"), {
      childList: true,
      subtree: true,
    });
  });
  await special.click();
  await expect(flash).toBeVisible({ timeout: 15000 });
  await expect(flash.locator(".flash-name")).toHaveText(
    "デストロイ・ギガ・レイズ",
  );
  await expect(flash.locator(".flash-card")).toHaveText("破壊竜ガンドラG");
  expect(await flash.locator("img").getAttribute("src")).toMatch(
    /^(blob|data):/,
  );
  await expect(flash).toHaveCSS("pointer-events", "none");

  // 控え2枚と相手の場の1枚が破壊され、吸収した分がHUDに出る。
  await expect(page.locator(".fighter.own .roster-chip.is-out")).toHaveCount(2, {
    timeout: 25000,
  });
  await expect(page.locator(".fighter.own .fighter-boost")).toBeVisible();
  await expect(page.locator(".fighter.own .fighter-boost")).toContainText("ATK");
  await expect(page.locator(".fighter.own .fighter-boost")).toContainText("MAT");
  expect(await page.evaluate(() => window.__destroySeen)).toBe(true);

  expect(errors).toEqual([]);
});

test("special card: 効果音がオフなら音声は取りに行かない", async ({ page }) => {
  const voice = [];
  page.on("request", (request) => {
    if (request.url().includes("/audio/gandora-x.wav")) voice.push(request.url());
  });
  await openCreator(page);
  await addCard(page, "破壊竜ガンドラG");
  for (const name of ["ふつうの一枚", "つぎの一枚"]) {
    await page.locator('.view-nav [data-view="creator"]').click();
    await addCard(page, name);
  }
  await page.locator('.view-nav [data-view="battle"]').click();
  await page.locator('[data-action="start-cpu"]').click();
  await page.locator(".battle-move.special-skill").click();
  await expect(page.locator("#special-flash")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(900);
  expect(voice).toEqual([]);
});
