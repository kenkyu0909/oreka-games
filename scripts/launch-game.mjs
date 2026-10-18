// Shared by start-game.bat and the cross-platform launcher smoke test.
// Built-in imports only: this must run even before npm ci has installed anything.
import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  supportedNode,
  localPort,
  dependencyKey,
  npmInvocation,
} from "./launcher-utils.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const marker = path.join(root, "node_modules", ".reframe-install-key");
let game;
let publicTunnel = null;

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
function runNpm(task) {
  const { command, args, windowsVerbatimArguments } = npmInvocation(
    task,
    process.platform,
    process.env.ComSpec,
  );
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      windowsVerbatimArguments,
    });
    child.once("error", (error) =>
      reject(
        new Error(
          `npmを起動できません。Node.jsをnpm付きでインストールし直してください。\n${error.message}`,
        ),
      ),
    );
    child.once("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${task === "install" ? "依存パッケージの準備" : "ゲーム画面のビルド"}に失敗しました（${signal || code}）。上のエラーを確認してください。`,
            ),
          ),
    );
  });
}
async function checkPort(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(port, "0.0.0.0", () =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );
  });
}
function openBrowser(url) {
  if (process.platform !== "win32" || process.env.REFRAME_NO_BROWSER === "1")
    return;
  const executable = path.win32.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "rundll32.exe",
  );
  const child = spawn(executable, ["url.dll,FileProtocolHandler", url], {
    stdio: "ignore",
    windowsHide: true,
  });
  let warned = false;
  const warn = () => {
    if (!warned)
      console.log(
        `ブラウザを自動で開けませんでした。手動で ${url} を開いてください。`,
      );
    warned = true;
  };
  child.once("error", warn);
  child.once("exit", (code) => {
    if (code !== 0) warn();
  });
  child.unref();
}
async function main() {
  const { wantsPublicTunnel, startPublicTunnel } = await import(
    "./public-tunnel.mjs"
  );
  const publicMode = wantsPublicTunnel(process.argv, process.env);
  console.log(
    publicMode
      ? "\nRE:FRAME — 公開対戦モード（別回線のスマホ対応）\n"
      : "\nRE:FRAME — ローカル起動\n",
  );
  if (!supportedNode(process.versions.node))
    throw new Error(
      `Node.js ${process.versions.node} は未対応です。Node.js 22.12以上（24 LTS推奨）をインストールしてください。https://nodejs.org/ja`,
    );
  const port = localPort(process.env.PORT);
  // Do not kill an existing server or silently connect the browser to another app.
  await checkPort(port);
  const lock = await readFile(path.join(root, "package-lock.json"));
  const key = dependencyKey(
    lock,
    process.versions.node,
    process.platform,
    process.arch,
  );
  const previous = await readFile(marker, "utf8").catch(() => "");
  const complete = (
    await Promise.all(
      [
        "vite/bin/vite.js",
        "ws/package.json",
        "fast-png/package.json",
        "jpeg-js/package.json",
        "qrcode/package.json",
        "@fontsource/rajdhani/package.json",
      ].map((file) => exists(path.join(root, "node_modules", file))),
    )
  ).every(Boolean);
  if (key !== previous || !complete) {
    console.log(
      "[1/3] 初回・更新後の準備中です。インターネット接続が必要です。",
    );
    await runNpm("install");
    await writeFile(marker, key);
  } else console.log("[1/3] 準備済みのパッケージを使います。");
  console.log("[2/3] 最新のゲーム画面をビルドしています…");
  await runNpm("build");
  console.log("[3/3] 対戦サーバーを起動しています…");
  const { createGameServer } = await import("../server/index.js");
  game = createGameServer();
  await new Promise((resolve, reject) => {
    game.server.once("error", reject);
    game.server.listen(port, "0.0.0.0", resolve);
  });
  const url = `http://localhost:${port}`;
  let tunnel = null;
  let publicUrl = process.env.PUBLIC_URL || null;
  if (publicMode && !publicUrl) {
    console.log(
      "[公開] cloudflaredでHTTPS公開URLを発行しています（初回は取得に1分ほどかかる場合があります）…",
    );
    tunnel = startPublicTunnel(port);
    const forwardErrors = (child) => {
      child.once("error", (error) => {
        const cmd = child.spawnfile || "";
        if (
          error?.code === "ENOENT" &&
          String(cmd).toLowerCase().includes("cloudflared")
        ) {
          console.log(
            "[公開] cloudflaredが見つからないため、npx経由で取得を試みます（初回はダウンロードで1〜2分かかります）…",
          );
        } else {
          console.log(`[公開] トンネル起動の確認: ${error.message}`);
        }
      });
    };
    tunnel.onProcess(forwardErrors);
    publicUrl = await tunnel.urlPromise;
    if (publicUrl) {
      game.setPublicUrl(publicUrl);
      process.env.PUBLIC_URL = publicUrl;
    } else {
      console.log(
        "[公開] 公開URLを取得できませんでした。ローカル起動として続けます。\n" +
          "  ・インターネット接続を確認してください。\n" +
          "  ・cloudflaredが必要です。https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ から入手するか、npxが使える状態で再実行してください。",
      );
      await tunnel.stop().catch(() => {});
      tunnel = null;
    }
  } else if (publicUrl) {
    game.setPublicUrl(publicUrl);
  }
  publicTunnel = tunnel;
  if (publicUrl) {
    console.log(
      `\n起動しました！\n・PC: ${url}\n・別回線スマホ用（HTTPS公開）: ${publicUrl}\n` +
        `スマホのカメラでPC画面のQR（「スマホで遊ぶ」）を読み取ってください。QRにはこの公開URLが入ります。\n` +
        `PCとスマホは同じ合言葉ルームに入れば対戦できます。双方とも公開URL側を開くのが確実です。\n` +
        `このウィンドウは開いたままにしてください。終了は Ctrl+C。\n`,
    );
  } else {
    console.log(
      `\n起動しました！ ${url}\nこのウィンドウは開いたままにしてください。終了は Ctrl+C。\n※別回線のスマホと対戦する場合は start-public-battle.bat（または node scripts\\launch-game.mjs --public）で起動してください。\n`,
    );
  }
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.log("\nサーバーを停止しています…");
    if (tunnel) await tunnel.stop().catch(() => {});
    await game.close();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  openBrowser(url);
}
main().catch(async (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      "\n同じポートが使用中です。すでに開いているゲームの起動ウィンドウを閉じてから、もう一度試してください。\n他のアプリが使用中なら、PORTを変更できます（README参照）。",
    );
  } else if (error.code === "EACCES") {
    console.error(
      "\nポートまたはファイルへのアクセスが拒否されました。書き込み可能なフォルダへ配置し、READMEのトラブル対処を確認してください。",
    );
  } else console.error(`\n起動できませんでした：${error.message}`);
  if (publicTunnel) await publicTunnel.stop().catch(() => {});
  if (game) await game.close().catch(() => {});
  process.exitCode = 1;
});
