import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import {
  createGameServer,
  ACTION_TIMEOUT,
  RECONNECT_GRACE,
  ROOM_TTL,
  FINISHED_TTL,
} from "../server/index.js";
import { generateCharacter, analyzePixels, FINISHES } from "../src/game.js";
import { wireTeam } from "../src/battle/protocol.js";

const features = {
  brightness: 500,
  saturation: 500,
  contrast: 300,
  detail: 300,
  symmetry: 500,
  diversity: 400,
  red: 340,
  green: 330,
  blue: 330,
  resolution: 200,
  portrait: 500,
};
function team() {
  return wireTeam(
    Array.from({ length: 3 }, (_, i) => ({
      name: `card-${i}`,
      character: generateCharacter(features),
      finish: FINISHES[0],
      image: "data:image/png;base64,aGVsbG8=",
      fingerprint: "b".repeat(64),
    })),
  );
}
async function setup(t) {
  let time = 100000;
  const app = createGameServer({ now: () => time, maintenanceInterval: 60000 });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const port = app.server.address().port;
  t.after(() => app.close());
  return {
    app,
    url: `ws://127.0.0.1:${port}/socket`,
    http: `http://127.0.0.1:${port}`,
    advance(ms) {
      time += ms;
      app.maintain();
    },
  };
}
async function client(url) {
  const socket = new WebSocket(url),
    messages = [],
    waiters = [];
  socket.on("error", () => {});
  socket.on("message", (raw) => {
    const value = JSON.parse(raw);
    const index = waiters.findIndex((w) => w.predicate(value));
    if (index >= 0) {
      const [w] = waiters.splice(index, 1);
      clearTimeout(w.timer);
      w.resolve(value);
    } else messages.push(value);
  });
  await once(socket, "open");
  return {
    socket,
    send(message) {
      socket.send(JSON.stringify(message));
    },
    next(type, predicate = () => true) {
      const matches = (value) => value.type === type && predicate(value),
        index = messages.findIndex(matches);
      if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { predicate: matches, resolve, timer: null };
        w.timer = setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error(`Timed out waiting for ${type}`));
        }, 4000);
        waiters.push(w);
      });
    },
  };
}
async function pair(env, firstTeam = team(), secondTeam = team()) {
  const a = await client(env.url),
    b = await client(env.url);
  a.send({ type: "create", team: firstTeam });
  const sessionA = await a.next("session");
  await a.next("state");
  b.send({ type: "join", team: secondTeam, code: sessionA.code });
  const sessionB = await b.next("session");
  const sa = await a.next("state", (s) => !!s.battle),
    sb = await b.next("state", (s) => !!s.battle);
  return { a, b, sessionA, sessionB, sa, sb };
}
const choose = (sequence = 0, index = 0) => ({
  type: "choose",
  sequence,
  action: { type: "move", index },
});

test("room creation/join sends private session tokens, shared state and no seed", async (t) => {
  const env = await setup(t);
  const { a, b, sessionA, sessionB, sa, sb } = await pair(env);
  assert.match(sessionA.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(sessionA.code, sessionB.code);
  assert.notEqual(sessionA.token, sessionB.token);
  assert.equal(sa.side, 0);
  assert.equal(sb.side, 1);
  assert.deepEqual(sa.battle, sb.battle);
  assert.equal("seed" in sa.battle, false);
  assert.equal("token" in sa, false);
  assert.deepEqual(sa.connected, [true, true]);
  assert.equal(sa.deadline, 100000 + ACTION_TIMEOUT);
});
test("both commitments required; pending choices are private and duplicates cannot replay", async (t) => {
  const env = await setup(t);
  const { a, b, sa } = await pair(env);
  a.send(choose());
  const waiting = await b.next("state", (s) => s.ready[0]);
  assert.deepEqual(waiting.ready, [true, false]);
  assert.deepEqual(waiting.battle, sa.battle);
  assert.equal("pending" in waiting, false);
  assert.equal("action" in waiting, false);
  a.send(choose());
  assert.match((await a.next("error")).message, /すでに/);
  b.send(choose());
  const next = await a.next("state", (s) => s.battle.sequence === 1);
  await b.next("state", (s) => s.battle.sequence === 1);
  assert.equal(next.battle.turn, 2);
  assert.equal(next.battle.log.filter((e) => e.kind === "move").length, 2);
  assert.deepEqual(next.ready, [false, false]);
  a.send(choose(0));
  assert.match((await a.next("error")).message, /更新/);
});
test("unauthed third party cannot act or join a full room, and rooms are isolated", async (t) => {
  const env = await setup(t);
  const { sessionA } = await pair(env);
  const other = await client(env.url);
  other.send(choose());
  assert.match((await other.next("error")).message, /入り直/);
  other.send({ type: "join", code: sessionA.code, team: team() });
  assert.match((await other.next("error")).message, /満員/);
  other.send({ type: "create", team: team() });
  const second = await other.next("session");
  assert.notEqual(second.code, sessionA.code);
  assert.equal(env.app.rooms.size, 2);
});
test("resume requires token and retains a private committed choice", async (t) => {
  const env = await setup(t);
  const { a, b, sessionA, sa } = await pair(env);
  a.send(choose());
  await b.next("state", (s) => s.ready[0]);
  a.socket.close();
  await once(a.socket, "close");
  await b.next("state", (s) => !s.connected[0]);
  const wrong = await client(env.url);
  wrong.send({ type: "resume", code: sessionA.code, token: "not-a-token" });
  await wrong.next("expired");
  const replacement = await client(env.url);
  replacement.send({
    type: "resume",
    code: sessionA.code,
    token: sessionA.token,
  });
  await replacement.next("session");
  const resumed = await replacement.next("state");
  assert.equal(resumed.ready[0], true);
  assert.equal(resumed.battle.sequence, 0);
  assert.deepEqual(resumed.connected, [true, true]);
});
test("server owns turn validation and HP/PP; surrender is final", async (t) => {
  const env = await setup(t);
  const { a, b } = await pair(env);
  a.send({ ...choose(), action: { type: "move", index: 900, damage: 999999 } });
  assert.match((await a.next("error")).message, /選べない/);
  a.send({ type: "surrender" });
  const end = await b.next("state", (s) => s.battle.phase === "finished");
  assert.equal(end.battle.winner, 1);
  assert.equal(end.battle.reason, "surrender");
  b.send(choose());
  assert.match((await b.next("error")).message, /対戦中では/);
});
test("120-second deadline awards the committed player; neither choosing is a draw", async (t) => {
  const env = await setup(t);
  const { a, b } = await pair(env);
  a.send(choose());
  await b.next("state", (s) => s.ready[0]);
  env.advance(ACTION_TIMEOUT + 1);
  const ended = await b.next("state", (s) => s.battle.phase === "finished");
  assert.equal(ended.battle.winner, 0);
  assert.equal(ended.battle.reason, "timeout");
  const other = await pair(env);
  env.advance(ACTION_TIMEOUT + 1);
  const draw = await other.b.next(
    "state",
    (s) => s.battle.phase === "finished",
  );
  assert.equal(draw.battle.winner, "draw");
});
test("disconnect pauses turn deadline then forfeits after 90 seconds", async (t) => {
  const env = await setup(t);
  const { a, b } = await pair(env);
  a.socket.close();
  await once(a.socket, "close");
  const paused = await b.next("state", (s) => !s.connected[0]);
  assert.equal(paused.deadline, null);
  env.advance(RECONNECT_GRACE + 1);
  const ended = await b.next("state", (s) => s.battle.phase === "finished");
  assert.equal(ended.battle.winner, 1);
  assert.equal(ended.battle.reason, "disconnect");
});
test("lobby and finished room TTLs purge photo and session data", async (t) => {
  const env = await setup(t);
  const a = await client(env.url);
  a.send({ type: "create", team: team() });
  await a.next("session");
  await a.next("state");
  env.advance(ROOM_TTL + 1);
  await a.next("expired");
  assert.equal(env.app.rooms.size, 0);
  const pair2 = await pair(env);
  pair2.a.send({ type: "surrender" });
  await pair2.b.next("state", (s) => s.battle.phase === "finished");
  env.advance(FINISHED_TTL + 1);
  await pair2.b.next("expired");
  assert.equal(env.app.rooms.size, 0);
});
test("invalid team/photo/version requests do not allocate a room", async (t) => {
  const env = await setup(t);
  const a = await client(env.url);
  a.send({ type: "create", team: [] });
  await a.next("error");
  assert.equal(env.app.rooms.size, 0);
  const invalid = team();
  invalid[0].character.features.brightness = 100000;
  a.send({ type: "create", team: invalid });
  await a.next("error");
  assert.equal(env.app.rooms.size, 0);
  const unsafe = team();
  unsafe[0].image = "data:image/svg+xml;base64,PHN2Zz4=";
  a.send({ type: "create", team: unsafe });
  await a.next("error");
  assert.equal(env.app.rooms.size, 0);
});
test("malformed JSON gets an error; nonmatching browser origins are rejected", async (t) => {
  const env = await setup(t),
    a = await client(env.url);
  a.socket.send("{");
  await a.next("error");
  const foreign = new WebSocket(env.url, { origin: "https://evil.example" });
  const rejected = await new Promise((resolve) => {
    foreign.on("error", (error) => resolve(error.message));
  });
  assert.match(rejected, /403/);
  const health = await fetch(`${env.http}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const wrongMethod = await fetch(env.http, { method: "POST" });
  assert.equal(wrongMethod.status, 405);
});

test("server reconstructs a photo-v3 rare and resolves it only after both commitments", async (t) => {
  const env = await setup(t);
  const rareTeam = team();
  const features = analyzePixels(
    new Uint8Array(Array.from({ length: 4096 }, () => [70, 230, 190]).flat()),
    8,
    8,
  );
  rareTeam.forEach((card) => (card.character = generateCharacter(features)));
  rareTeam[0].character.moves[3].power = 99999;
  const { a, b, sa } = await pair(env, rareTeam);
  assert.equal(sa.battle.teams[0][0].card.character.moves[3].id, "sky-rend");
  assert.equal(sa.battle.teams[0][0].card.character.moves[3].power, 125);
  a.send(choose(0, 3));
  const waiting = await b.next("state", (s) => s.ready[0]);
  assert.equal(waiting.battle.teams[0][0].pp[3], 3);
  b.send({ type: "choose", sequence: 0, action: { type: "switch", index: 1 } });
  const out = await a.next("state", (s) => s.battle.sequence === 1);
  assert.equal(out.battle.teams[0][0].pp[3], 2);
  assert.ok(
    out.battle.log.some(
      (e) => e.kind === "move" && e.rarity === "rare" && e.name === "天穹断裂",
    ),
  );
  assert.ok(
    out.battle.teams[1][1].hp < out.battle.teams[1][1].card.character.stats.hp,
  );
});
