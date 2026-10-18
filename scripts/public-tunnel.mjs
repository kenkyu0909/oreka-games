// cloudflared Quick Tunnel (trycloudflare.com) を起動し、別回線のスマホから
// 届くHTTPS公開URLを取得する。アカウント不要・DB不要。
// Built-in imports only: npm ci 前でも動く必要がある。
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export function wantsPublicTunnel(argv = process.argv, env = process.env) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  return (
    args.includes("--public") ||
    args.includes("--online") ||
    env.PUBLIC === "1" ||
    env.REFRAME_PUBLIC === "1"
  );
}

const TUNNEL_URL_PATTERN = /https:\/\/[A-Za-z0-9-]+\.trycloudflare\.com\/?/i;

export function extractTunnelUrl(text) {
  const match = String(text || "").match(TUNNEL_URL_PATTERN);
  return match ? match[0].replace(/\/?$/, "/") : null;
}

// npx.cmd を直接 spawn すると Windows + 新しめの Node で EINVAL になるため、
// npx 経路は `node npx-cli.js ...` を優先する（.cmd/shell 不要で確実に動く）。
function resolveNpxCli() {
  const candidates = [];
  try {
    const nodeDir = path.dirname(process.execPath);
    candidates.push(
      path.join(nodeDir, "node_modules", "npm", "bin", "npx-cli.js"),
      path.join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
    );
    // npm のグローバル prefix 配下（npx.ps1 と同じ解決順）
    const prefix = process.env.npm_config_prefix;
    if (prefix)
      candidates.push(path.join(prefix, "node_modules", "npm", "bin", "npx-cli.js"));
  } catch {
    /* ignore */
  }
  for (const file of candidates) {
    try {
      if (file && existsSync(file)) return file;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function spawnTunnelOnce(port, useNpx, platform) {
  const target = `http://127.0.0.1:${port}`;
  if (!useNpx) {
    return spawn("cloudflared", ["tunnel", "--url", target, "--no-autoupdate"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  }
  const npxCli = resolveNpxCli();
  if (npxCli) {
    return spawn(
      process.execPath,
      [npxCli, "--yes", "cloudflared", "tunnel", "--url", target, "--no-autoupdate"],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
  }
  // 最終手段: cmd 経由（.cmd を直接 spawn しない）
  if (platform === "win32") {
    const comspec = process.env.ComSpec || "cmd.exe";
    return spawn(
      comspec,
      ["/d", "/s", "/c", `npx.cmd --yes cloudflared tunnel --url ${target} --no-autoupdate`],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
  }
  return spawn(
    "npx",
    ["--yes", "cloudflared", "tunnel", "--url", target, "--no-autoupdate"],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
}

// 公開URLが見つかるまで待つ。見つからなければnullで諦めてローカル継続。
export function startPublicTunnel(port, options = {}) {
  const {
    // npx 初回は cloudflared のダウンロードで1分超えがあるため余裕を持たせる
    timeoutMs = 180000,
    npxTimeoutMs = 240000,
    platform = process.platform,
    spawner = spawnTunnelOnce,
  } = options;
  let proc = null;
  let settled = false;
  let timer = null;
  let onExit = null;

  const urlPromise = new Promise((resolve) => {
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };
    const armTimer = (ms) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => finish(null), ms);
      timer.unref?.();
    };
    // URL を含まない出力で確定させないこと（従来は初回チャンクで null 確定していた）
    const watch = (chunk) => {
      const url = extractTunnelUrl(chunk.toString());
      if (url) finish(url);
    };
    const useNpxFallback = { done: false };
    function fallbackToNpx() {
      if (settled) return false;
      try {
        proc = spawner(port, true, platform);
      } catch {
        finish(null);
        return false;
      }
      attach(proc);
      if (onExit) onExit(proc);
      // npx はダウンロード分だけ長めに待つ
      armTimer(Math.max(npxTimeoutMs, timeoutMs));
      return true;
    }
    function attach(child) {
      child.stdout?.on("data", watch);
      child.stderr?.on("data", watch);
      child.once("error", () => {
        // cloudflared未インストール時はnpx経由へフォールバック
        if (!useNpxFallback.done) {
          useNpxFallback.done = true;
          if (fallbackToNpx()) return;
        }
        if (!settled && useNpxFallback.done && proc === child) finish(null);
      });
      child.once("exit", (code) => {
        // URL確定前の異常終了だけ失敗扱い。確定後はトンネル維持が別途管理される
        if (!settled && code !== 0 && proc === child) {
          if (!useNpxFallback.done) {
            useNpxFallback.done = true;
            if (fallbackToNpx()) return;
          }
          finish(null);
        }
      });
    }
    try {
      proc = spawner(port, false, platform);
    } catch {
      try {
        useNpxFallback.done = true;
        proc = spawner(port, true, platform);
        attach(proc);
        if (onExit) onExit(proc);
        armTimer(Math.max(npxTimeoutMs, timeoutMs));
        return;
      } catch {
        finish(null);
        return;
      }
    }
    attach(proc);
    if (onExit) onExit(proc);
    armTimer(timeoutMs);
  });

  return {
    get proc() {
      return proc;
    },
    urlPromise,
    onProcess(callback) {
      onExit = callback;
      if (proc) callback(proc);
    },
    async stop() {
      if (proc && !proc.killed) {
        await new Promise((resolve) => {
          proc.once("exit", () => resolve());
          proc.kill();
          setTimeout(resolve, 3000).unref?.();
        });
      }
    },
  };
}
