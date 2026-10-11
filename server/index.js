import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes, randomInt } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import {
  normalizeTeam,
  isRoomCode,
  PROTOCOL_VERSION,
} from "../src/battle/protocol.js";
import {
  createBattle,
  resolveTurn,
  activeFighter,
  validateAction,
  finishBattle,
  publicState,
} from "../src/battle/engine.js";

const defaultDist = fileURLToPath(new URL("../dist/", import.meta.url));
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_TTL = 10 * 60_000;
export const FINISHED_TTL = 5 * 60_000;
export const RECONNECT_GRACE = 90_000;
export const ACTION_TIMEOUT = 120_000;

export function createGameServer({
  distDir = defaultDist,
  now = Date.now,
  maxRooms = 100,
  maintenanceInterval = 1000,
} = {}) {
  const rooms = new Map();
  const send = (ws, value) => {
    if (ws?.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 2_000_000) ws.close(1013, "slow connection");
      else ws.send(JSON.stringify(value));
    }
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'",
    );
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://local").pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (pathname === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION }));
      return;
    }
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = path.resolve(distDir, relative);
    if (!filePath.startsWith(path.resolve(distDir) + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const body = await readFile(filePath);
      res.setHeader(
        "Content-Type",
        MIME[path.extname(filePath)] || "application/octet-stream",
      );
      res.setHeader(
        "Cache-Control",
        pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
      res.writeHead(200);
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("ページがありません。先に npm run build を実行してください。");
    }
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 450000,
    perMessageDeflate: false,
  });
  server.on("upgrade", (req, socket, head) => {
    let allowed = false;
    try {
      const host = new URL(`http://${req.headers.host}`).hostname;
      allowed =
        new URL(req.url, "http://local").pathname === "/socket" &&
        (!req.headers.origin || new URL(req.headers.origin).hostname === host);
    } catch {
      /* invalid host/origin */
    }
    if (!allowed || wss.clients.size >= 220) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });
  const connected = (room) =>
    room.players.map(
      (p) => !!p.socket && p.socket.readyState === WebSocket.OPEN,
    );
  function broadcast(room) {
    room.players.forEach((player, side) =>
      send(player.socket, {
        type: "state",
        serverTime: now(),
        code: room.code,
        side,
        battle: room.battle ? publicState(room.battle) : null,
        ready: room.pending.map(Boolean),
        connected: connected(room),
        deadline: room.deadline,
        reconnectUntil: room.players.map((p) =>
          p.disconnectedAt == null ? null : p.disconnectedAt + RECONNECT_GRACE,
        ),
      }),
    );
  }
  function refreshDeadline(room) {
    room.pending = [null, null];
    if (room.battle?.phase === "replace") {
      for (const side of [0, 1])
        if (activeFighter(room.battle, side).hp > 0)
          room.pending[side] = { type: "wait" };
    }
    room.deadline =
      room.battle &&
      room.battle.phase !== "finished" &&
      connected(room).every(Boolean)
        ? now() + ACTION_TIMEOUT
        : null;
    if (room.battle?.phase === "finished" && room.finishedAt == null)
      room.finishedAt = now();
  }
  function finishRoom(room, winner, reason) {
    if (room.battle && room.battle.phase !== "finished") {
      room.battle = finishBattle(room.battle, winner, reason);
      refreshDeadline(room);
      broadcast(room);
    }
  }
  function deleteRoom(room, message) {
    if (!rooms.has(room.code)) return;
    rooms.delete(room.code);
    for (const player of room.players) {
      if (player.socket) {
        send(player.socket, { type: "expired", message });
        player.socket.roomCode = null;
      }
      player.team = null;
      player.token = null;
    }
  }
  function membership(ws) {
    const room = rooms.get(ws.roomCode);
    const side = room?.players.findIndex((p) => p.socket === ws) ?? -1;
    if (!room || side < 0) throw new Error("部屋に入り直してください。");
    return { room, side };
  }
  function attach(ws, room, side) {
    const player = room.players[side];
    const previous = player.socket;
    player.socket = ws;
    player.disconnectedAt = null;
    ws.roomCode = room.code;
    if (previous && previous !== ws) {
      previous.roomCode = null;
      send(previous, { type: "replaced", message: "別の接続で復帰しました。" });
      previous.close(1000);
    }
    room.updatedAt = now();
    if (
      room.battle &&
      room.battle.phase !== "finished" &&
      connected(room).every(Boolean)
    )
      room.deadline = now() + ACTION_TIMEOUT;
    send(ws, { type: "session", code: room.code, token: player.token, side });
  }
  wss.on("connection", (ws, req) => {
    ws.alive = true;
    ws.roomCode = null;
    ws.rateStart = now();
    ws.rateCount = 0;
    ws.connectedAt = now();
    ws.on("pong", () => {
      ws.alive = true;
    });
    ws.on("error", () => {});
    ws.on("message", (bytes, binary) => {
      try {
        if (now() - ws.rateStart > 10000) {
          ws.rateStart = now();
          ws.rateCount = 0;
        }
        if (++ws.rateCount > 40) {
          ws.close(1008, "rate limited");
          return;
        }
        if (binary) throw new Error("テキスト形式の通信が必要です。");
        const message = JSON.parse(bytes.toString());
        if (
          !message ||
          typeof message !== "object" ||
          typeof message.type !== "string"
        )
          throw new Error("通信形式が不正です。");
        if (["create", "join", "resume"].includes(message.type) && ws.roomCode)
          throw new Error("先に現在の部屋を退出してください。");
        if (message.type === "create") {
          if (rooms.size >= maxRooms)
            throw new Error("部屋が満員です。しばらくしてからお試しください。");
          const team = normalizeTeam(message.team);
          let code;
          do {
            code = Array.from(
              { length: 6 },
              () => ALPHABET[randomInt(ALPHABET.length)],
            ).join("");
          } while (rooms.has(code));
          const room = {
            code,
            createdAt: now(),
            updatedAt: now(),
            finishedAt: null,
            players: [
              {
                team,
                token: randomBytes(24).toString("base64url"),
                socket: null,
                disconnectedAt: null,
              },
            ],
            pending: [null, null],
            battle: null,
            deadline: null,
          };
          rooms.set(code, room);
          attach(ws, room, 0);
          broadcast(room);
        } else if (message.type === "join") {
          if (!isRoomCode(message.code))
            throw new Error("合言葉は英数字6文字です。");
          const room = rooms.get(message.code);
          if (!room)
            throw new Error(
              "部屋が見つかりません。合言葉と有効期限を確認してください。",
            );
          if (room.players.length !== 1 || room.battle)
            throw new Error("この部屋は満員、または終了しています。");
          if (!connected(room)[0])
            throw new Error("部屋を作った人の再接続を待ってください。");
          const team = normalizeTeam(message.team);
          room.players.push({
            team,
            token: randomBytes(24).toString("base64url"),
            socket: null,
            disconnectedAt: null,
          });
          attach(ws, room, 1);
          room.battle = createBattle(
            room.players.map((p) => p.team),
            randomInt(1, 0xffffffff),
          );
          refreshDeadline(room);
          broadcast(room);
        } else if (message.type === "resume") {
          if (!isRoomCode(message.code) || typeof message.token !== "string")
            throw new Error("復帰情報が不正です。");
          const room = rooms.get(message.code);
          const side =
            room?.players.findIndex((p) => p.token === message.token) ?? -1;
          if (!room || side < 0) {
            send(ws, {
              type: "expired",
              message: "部屋の有効期限が切れたか、復帰情報が一致しません。",
            });
            return;
          }
          const player = room.players[side];
          if (
            player.disconnectedAt != null &&
            now() - player.disconnectedAt >= RECONNECT_GRACE &&
            room.battle?.phase !== "finished"
          ) {
            send(ws, { type: "expired", message: "復帰期限を過ぎています。" });
            return;
          }
          attach(ws, room, side);
          broadcast(room);
        } else if (message.type === "choose") {
          const { room, side } = membership(ws);
          if (!room.battle || room.battle.phase === "finished")
            throw new Error("対戦中ではありません。");
          if (!connected(room).every(Boolean))
            throw new Error("相手の再接続を待ってください。");
          if (room.deadline != null && now() >= room.deadline) {
            maintain();
            return;
          }
          if (message.sequence !== room.battle.sequence)
            throw new Error(
              "ターンが更新されました。最新の画面で選んでください。",
            );
          if (room.pending[side])
            throw new Error("すでに行動を確定しています。");
          if (!validateAction(room.battle, side, message.action))
            throw new Error("選べない行動です。");
          room.pending[side] = {
            type: message.action.type,
            ...(Number.isInteger(message.action.index)
              ? { index: message.action.index }
              : {}),
          };
          room.updatedAt = now();
          if (room.pending.every(Boolean)) {
            room.battle = resolveTurn(room.battle, room.pending);
            refreshDeadline(room);
          }
          broadcast(room);
        } else if (message.type === "surrender" || message.type === "leave") {
          const { room, side } = membership(ws);
          if (room.battle)
            finishRoom(
              room,
              1 - side,
              message.type === "leave" ? "left" : "surrender",
            );
          if (message.type === "leave" || !room.battle) {
            const player = room.players[side];
            player.socket = null;
            player.token = null;
            player.disconnectedAt = now();
            ws.roomCode = null;
            send(ws, { type: "left" });
            if (!room.battle || room.players.every((p) => !p.socket))
              deleteRoom(room, "部屋を終了しました。");
            else broadcast(room);
          }
        } else throw new Error("未対応の通信です。");
      } catch (error) {
        send(ws, {
          type: "error",
          message:
            error instanceof SyntaxError
              ? "通信を読み取れませんでした。"
              : error.message,
        });
      }
    });
    ws.on("close", () => {
      const room = rooms.get(ws.roomCode);
      const player = room?.players.find((p) => p.socket === ws);
      if (player) {
        player.socket = null;
        player.disconnectedAt = now();
        room.deadline = null;
        broadcast(room);
      }
    });
  });
  let lastHeartbeat = now();
  function maintain() {
    const time = now();
    for (const room of rooms.values()) {
      if (!room.battle && time - room.createdAt >= ROOM_TTL) {
        deleteRoom(room, "待機時間が10分を過ぎたため、部屋を終了しました。");
        continue;
      }
      if (room.finishedAt != null && time - room.finishedAt >= FINISHED_TTL) {
        deleteRoom(
          room,
          "対戦終了から5分経過したため、部屋の写真・状態を破棄しました。",
        );
        continue;
      }
      const expired = room.players.map(
        (p) =>
          p.disconnectedAt != null &&
          time - p.disconnectedAt >= RECONNECT_GRACE,
      );
      if (expired.some(Boolean)) {
        if (!room.battle) {
          deleteRoom(room, "接続が戻らなかったため、部屋を終了しました。");
          continue;
        }
        finishRoom(
          room,
          expired.every(Boolean) ? "draw" : expired[0] ? 1 : 0,
          "disconnect",
        );
      }
      if (
        room.deadline != null &&
        time >= room.deadline &&
        room.battle?.phase !== "finished"
      ) {
        finishRoom(
          room,
          room.pending[0] && !room.pending[1]
            ? 0
            : room.pending[1] && !room.pending[0]
              ? 1
              : "draw",
          "timeout",
        );
      }
    }
    if (time - lastHeartbeat >= 15000) {
      lastHeartbeat = time;
      for (const ws of wss.clients) {
        if (!ws.alive || (!ws.roomCode && time - ws.connectedAt > 120000))
          ws.terminate();
        else {
          ws.alive = false;
          ws.ping();
        }
      }
    }
  }
  const interval = setInterval(maintain, maintenanceInterval);
  interval.unref();
  async function close() {
    clearInterval(interval);
    for (const ws of wss.clients) ws.terminate();
    rooms.clear();
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  }
  return { server, wss, rooms, maintain, close };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const app = createGameServer();
  const port = Number(process.env.PORT || 3000);
  app.server.listen(port, "0.0.0.0", () =>
    console.log(`RE:FRAME battle server listening on 0.0.0.0:${port}`),
  );
  process.on("SIGTERM", async () => {
    await app.close();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    await app.close();
    process.exit(0);
  });
}
