import { test, expect, devices } from "@playwright/test";
import jsQR from "jsqr";
import { encode } from "fast-png";
import { motionOff } from "./motion.js";

const origin = "https://3000-mobile-check.e2b.app";
// Serve the real build at a secure test origin without making external requests.
async function securePreview(page, previewOrigin = origin) {
  await page.route(`${previewOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `http://127.0.0.1:3000${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
  await page.goto(`${previewOrigin}/?debug=private#home`);
}
async function scanQr(page) {
  await expect(page.locator("#mobile-qr")).toBeVisible();
  const pixels = await page.locator("#mobile-qr").evaluate((canvas) => ({
    w: canvas.width,
    h: canvas.height,
    data: Array.from(
      canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
        .data,
    ),
  }));
  return jsQR(new Uint8ClampedArray(pixels.data), pixels.w, pixels.h)?.data;
}

test("HTTPS preview QR really decodes to the public entry URL; copy/share keep private data out", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (value) => {
          window.copiedLink = value;
        },
      },
    });
    Object.defineProperty(navigator, "share", {
      value: async (value) => {
        window.sharedLink = value;
      },
    });
  });
  await securePreview(page);
  expect(await page.evaluate(() => isSecureContext)).toBe(true);
  await expect(page.locator("#upload-button")).toBeEnabled();
  await page.locator("#mobile-guide-button").click();
  await expect(page.locator("#mobile-guide")).toBeVisible();
  expect(await scanQr(page)).toBe(`${origin}/`);
  await expect(page.locator("#mobile-preview-notice")).toContainText(
    "起動中だけ使える公開URL",
  );
  await page.locator("#mobile-copy").click();
  await expect(page.locator("#mobile-link-status")).toContainText(
    "コピーしました",
  );
  expect(await page.evaluate(() => window.copiedLink)).toBe(`${origin}/`);
  await page.locator("#mobile-share").click();
  expect((await page.evaluate(() => window.sharedLink)).url).toBe(`${origin}/`);
  expect(
    requests.filter((u) => u.startsWith("http") && !u.startsWith(origin)),
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.locator("#mobile-guide-button")).toBeFocused();
});

test("local preview warns instead of presenting a useless localhost QR", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#mobile-guide-button").click();
  await expect(page.locator("#mobile-link-status")).toContainText("このPC専用");
  await expect(page.locator("#mobile-copy")).toBeDisabled();
  await expect(page.locator("#mobile-qr")).toBeHidden();
  await expect(page.locator("#mobile-share")).toBeHidden();
  await page.locator("#mobile-guide-close").click();
  await expect(page.locator("#mobile-guide-button")).toBeFocused();
});

test("blocked clipboard selects the URL for manual copy; absent Web Share has a safe fallback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new DOMException("blocked", "NotAllowedError");
        },
      },
    });
    Object.defineProperty(navigator, "share", { value: undefined });
  });
  await securePreview(page);
  await page.locator("#mobile-guide-button").click();
  expect(await scanQr(page)).toBe(`${origin}/`);
  await expect(page.locator("#mobile-share")).toBeHidden();
  await page.locator("#mobile-copy").click();
  await expect(page.locator("#mobile-link-status")).toContainText(
    "手動でコピー",
  );
  await expect(page.locator("#mobile-link-url")).toBeFocused();
  expect(
    await page
      .locator("#mobile-link-url")
      .evaluate((el) => [el.selectionStart, el.selectionEnd]),
  ).toEqual([0, `${origin}/`.length]);
});

test("native share cancellation and permission failure are reported without claiming success", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let count = 0;
    Object.defineProperty(navigator, "share", {
      value: async () => {
        throw new DOMException(
          "test",
          ++count === 1 ? "AbortError" : "NotAllowedError",
        );
      },
    });
  });
  await securePreview(page);
  await page.locator("#mobile-guide-button").click();
  await scanQr(page);
  await page.locator("#mobile-share").click();
  await expect(page.locator("#mobile-link-status")).toContainText("キャンセル");
  await page.locator("#mobile-share").click();
  await expect(page.locator("#mobile-link-status")).toContainText(
    "共有できませんでした",
  );
});

for (const device of ["iPhone 13", "Pixel 7"]) {
  test(`${device}: touch-only photo selection, CPU move/switch and rotation remain usable`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      ...devices[device],
    });
    await motionOff(context);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.goto("/");
      await page.locator("#mobile-guide-button").tap();
      await expect(page.locator("#mobile-guide")).toBeVisible();
      await page.locator("#mobile-guide-close").tap();
      for (const id of ["sound-toggle"]) {
        const box = await page.locator(`#${id}`).boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await page.locator('.view-nav [data-view="creator"]').tap();
      await expect(page.locator("#upload-button")).toBeEnabled();
      expect(
        await page
          .locator("#name-input")
          .evaluate((el) => getComputedStyle(el).fontSize),
      ).toBe("16px");
      const chooser = page.waitForEvent("filechooser");
      await page.locator("#upload-button").tap();
      await (
        await chooser
      ).setFiles({
        name: "スマホ写真.png",
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
      await expect(page.locator("#card-name")).toHaveText("スマホ写真");
      await page.locator("#generate-button").tap();
      await expect(page.locator("#card-mini-moves > span")).toHaveCount(4, {
        timeout: 20000,
      });
      await page.locator("#add-team-button").tap();
      await expect(page.locator(".party-card")).toHaveCount(1);
      await page.locator('[data-action="samples"]').tap();
      await page.locator(".test-settings summary").tap();
      await page.locator("#battle-seed").fill("12345");
      await page.locator('[data-action="start-cpu"]').tap();
      await expect(page.locator(".battle-move")).toHaveCount(4);
      for (const button of await page.locator(".battle-move").all()) {
        const rect = await button.boundingBox();
        expect(rect.height).toBeGreaterThanOrEqual(44);
      }
      await page.locator(".battle-move").first().tap();
      await expect(page.locator(".turn-indicator b")).toHaveText("2");
      await page.setViewportSize({ width: 844, height: 390 });
      await page.locator('[data-command="switch"]').scrollIntoViewIfNeeded();
      await page.locator('[data-command="switch"]').tap();
      await page.locator(".bench-card").nth(1).scrollIntoViewIfNeeded();
      await page.locator(".bench-card").nth(1).tap();
      await expect(page.locator(".turn-indicator b")).toHaveText("3");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test("HTTP on a non-local host explains HTTPS instead of a cryptic photo decoder failure", async ({
  page,
}) => {
  await securePreview(page, "http://phone-preview.example.test");
  await page.locator("#mobile-guide-button").click();
  await expect(page.locator("#mobile-link-status")).toContainText(
    "HTTPSが必要",
  );
  await expect(page.locator("#mobile-copy")).toBeDisabled();
  await expect(page.locator("#mobile-qr")).toBeHidden();
  await page.locator("#mobile-guide-close").click();
  await page.locator('.view-nav [data-view="creator"]').click();
  // 写真がない状態では自動生成しないので、明示的にサンプルを要求して判定を出す。
  await page.locator("#sample-button").click();
  await expect(page.locator("#status")).toContainText("HTTPS接続が必要");
});
