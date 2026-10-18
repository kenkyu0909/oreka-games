import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveShareTarget } from "../src/mobile-link.js";
import {
  wantsPublicTunnel,
  extractTunnelUrl,
} from "../scripts/public-tunnel.mjs";
import { createGameServer } from "../server/index.js";

test("localhost stays unshareable without a tunnel, but uses the public URL when present", () => {
  const local = resolveShareTarget("http://localhost:3000/", "/", null);
  assert.equal(local.shareable, false);
  assert.equal(local.reason, "local");

  const via = resolveShareTarget(
    "http://localhost:3000/",
    "/",
    "https://demo-abc123.trycloudflare.com/",
  );
  assert.equal(via.shareable, true);
  assert.equal(via.viaPublic, true);
  assert.equal(via.url, "https://demo-abc123.trycloudflare.com/");
});

test("already-shareable HTTPS entry ignores the tunnel URL; bad tunnel URLs are ignored", () => {
  const direct = resolveShareTarget(
    "https://demo-abc123.trycloudflare.com/",
    "/",
    "https://other-xyz.trycloudflare.com/",
  );
  assert.equal(direct.url, "https://demo-abc123.trycloudflare.com/");
  assert.equal(direct.viaPublic, false);

  for (const bad of [
    null,
    "",
    "not a url",
    "http://192.168.1.10/",
    "http://localhost:3000/",
  ]) {
    const fallback = resolveShareTarget("http://localhost:3000/", "/", bad);
    assert.equal(fallback.shareable, false);
  }
});

test("tunnel URL extraction and --public flag detection", () => {
  assert.equal(
    extractTunnelUrl(
      "2026-10-12T00:00:00Z INF | https://demo-abc123.trycloudflare.com |",
    ),
    "https://demo-abc123.trycloudflare.com/",
  );
  assert.equal(extractTunnelUrl("no url here"), null);
  assert.equal(
    wantsPublicTunnel(["node", "launch-game.mjs", "--public"], {}),
    true,
  );
  assert.equal(wantsPublicTunnel(["node", "launch-game.mjs"], {}), false);
  assert.equal(
    wantsPublicTunnel(["node", "launch-game.mjs"], { PUBLIC: "1" }),
    true,
  );
});

test("server exposes /public-url and accepts the tunnel host as a valid origin", async (t) => {
  const publicUrl = "https://demo-abc123.trycloudflare.com/";
  const app = createGameServer({
    now: Date.now,
    maintenanceInterval: 60000,
    publicUrl,
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const port = app.server.address().port;
  t.after(() => app.close());

  const info = await (
    await fetch(`http://127.0.0.1:${port}/public-url`)
  ).json();
  assert.equal(info.publicUrl, publicUrl);
  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(health.publicUrl, publicUrl);

  // 無効な公開URLは破棄される
  app.setPublicUrl("http://localhost:3000/");
  assert.equal(app.getPublicUrl(), null);
  const cleared = await (
    await fetch(`http://127.0.0.1:${port}/public-url`)
  ).json();
  assert.equal(cleared.publicUrl, null);
});

test("public battle launcher exists and forwards args without delayed expansion", () => {
  const bat = readFileSync(
    new URL("../start-public-battle.bat", import.meta.url),
    "utf8",
  );
  assert.match(bat, /DisableDelayedExpansion/);
  assert.match(bat, /launch-game\.mjs --public/);
  const main = readFileSync(
    new URL("../start-game.bat", import.meta.url),
    "utf8",
  );
  assert.match(main, /launch-game\.mjs %\*/);
});
