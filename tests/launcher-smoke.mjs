// Integration check: runs the actual .bat on Windows, the same Node helper elsewhere.
// Run separately from npm test: first-run coverage deliberately reinstalls node_modules.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const portProbe = createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const env = { ...process.env, PORT: String(port), REFRAME_NO_BROWSER: "1" };
await rm(new URL("../node_modules/.reframe-install-key", import.meta.url), {
  force: true,
});

function launch(batch = true) {
  const windows = batch && process.platform === "win32";
  const child = spawn(
    windows ? process.env.ComSpec || "cmd.exe" : process.execPath,
    windows
      ? ["/d", "/v:off", "/s", "/c", "start-game.bat"]
      : ["scripts/launch-game.mjs"],
    { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let log = "";
  child.stdout.on("data", (data) => {
    log += data;
    process.stdout.write(data);
  });
  child.stderr.on("data", (data) => {
    log += data;
    process.stderr.write(data);
  });
  const exited = once(child, "exit");
  return { child, exited, log: () => log };
}
async function waitReady(app) {
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    if (app.child.exitCode !== null)
      throw new Error("Launcher exited early: " + app.log());
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error("Launcher timeout: " + app.log());
}
async function stop(app) {
  if (app.child.exitCode !== null) return;
  if (process.platform === "win32") {
    const killer = spawn(
      "taskkill.exe",
      ["/PID", String(app.child.pid), "/T", "/F"],
      { stdio: "ignore" },
    );
    await once(killer, "exit");
  } else app.child.kill("SIGTERM");
  await app.exited;
}
for (let attempt = 0; attempt < 2; attempt++) {
  const app = launch();
  try {
    await waitReady(app);
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(html, /RE:FRAME/);
    const manifest = await (
      await fetch(`http://127.0.0.1:${port}/strong-cards/manifest.json`)
    ).json();
    assert.equal(manifest.cards.length, 10);
    assert.match(app.log(), attempt === 0 ? /初回・更新後/ : /準備済み/);
    if (attempt === 1) {
      const duplicate = launch(false);
      const [code] = await duplicate.exited;
      assert.notEqual(code, 0);
      assert.match(duplicate.log(), /ポートが使用中/);
    }
  } finally {
    await stop(app);
  }
}
console.log(
  "Launcher smoke passed: first install, cached restart, page + vault serving, port collision, shutdown.",
);
