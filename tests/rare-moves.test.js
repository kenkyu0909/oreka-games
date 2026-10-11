import test from "node:test";
import assert from "node:assert/strict";
import { RARE_MOVE_LIBRARY, RARE_RATE } from "../src/rare-moves.js";
import { MOVE_LIBRARY, moveTags } from "../src/moves.js";
import { generateCharacter, analyzePixels } from "../src/game.js";
import { makeCpuTeam, seededRandom } from "../src/battle/presets.js";
import {
  normalizeTeam,
  wireTeam,
  PROTOCOL_VERSION,
} from "../src/battle/protocol.js";
import {
  createBattle,
  resolveTurn,
  estimateMoveDamage,
  publicState,
  validateAction,
  recoveryAmount,
} from "../src/battle/engine.js";
import { chooseCpuAction } from "../src/battle/cpu.js";
const move = (index) => ({ type: "move", index });
const play = (state) => resolveTurn(state, [move(3), move(0)]);
const keys = Object.keys(makeCpuTeam(1)[0].character.features);
const fixtures = new Map();
const random = seededRandom(72919);
const records = [];
for (let i = 0; i < 12000; i++) {
  const features = Object.fromEntries(
    keys.map((k) => [k, Math.floor(random() * 1001)]),
  );
  const c = generateCharacter(features);
  records.push(c);
  if (c.moves[3].rarity) fixtures.set(c.moves[3].id, c);
}
function withCharacter(c) {
  const card = structuredClone(makeCpuTeam(1)[0]);
  card.character = structuredClone(c);
  return card;
}
function battle(id, seed = 76543) {
  const card = withCharacter(fixtures.get(id));
  const s = createBattle([[card, card, card], makeCpuTeam(12345)], seed);
  for (const [side, team] of s.teams.entries())
    for (const f of team) {
      Object.assign(f.card.character.stats, {
        hp: 400,
        attack: 100,
        specialAttack: 100,
        defense: 200,
        specialDefense: 200,
        speed: side === 0 ? 250 : 15,
        critical: 1,
        resistance: 1,
        recovery: 40,
        piercing: 1,
      });
      f.hp = 400;
      f.card.character.attribute = "wind";
    }
  const quiet = structuredClone(MOVE_LIBRARY.find((m) => m.id === "quicken"));
  s.teams[1][0].card.character.moves[0] = quiet;
  s.teams[1][0].pp[0] = quiet.pp;
  return s;
}

test("twenty distinct rare skills cover all six attributes plus neutral; frozen canonical metadata", () => {
  assert.equal(RARE_MOVE_LIBRARY.length, 20);
  assert.equal(
    new Set([...MOVE_LIBRARY, ...RARE_MOVE_LIBRARY].map((m) => m.id)).size,
    68,
  );
  for (const attr of ["fire", "water", "wind", "earth", "light", "dark"])
    assert.equal(
      RARE_MOVE_LIBRARY.filter((m) => m.attribute === attr).length,
      3,
    );
  assert.equal(RARE_MOVE_LIBRARY.filter((m) => m.attribute === null).length, 2);
  for (const m of RARE_MOVE_LIBRARY) {
    assert.equal(m.rarity, "rare");
    assert.ok(Object.isFrozen(m));
    assert.ok(m.pp === 2 || m.pp === 3);
    assert.ok(moveTags(m).includes("レア"));
    if (m.stages) assert.ok(Object.isFrozen(m.stages));
  }
});
test("photo-v3 gate is about 5%, all 20 rares reachable, max one fourth-slot rare, two attacks retained", () => {
  assert.equal(RARE_RATE, 0.05);
  assert.equal(fixtures.size, 20);
  let count = 0;
  for (const c of records) {
    const old = generateCharacter(c.features, "photo-v2");
    assert.deepEqual(c.stats, old.stats);
    assert.equal(c.level, old.level);
    assert.equal(c.attribute, old.attribute);
    assert.deepEqual(c.moves.slice(0, 3), old.moves.slice(0, 3));
    assert.equal(new Set(c.moves.map((m) => m.id)).size, 4);
    assert.ok(c.moves.filter((m) => m.power).length >= 2);
    const rare = c.moves.filter((m) => m.rarity);
    assert.ok(rare.length <= 1);
    if (rare.length) {
      count++;
      assert.equal(c.moves[3].rarity, "rare");
    } else assert.deepEqual(c.moves, old.moves);
  }
  assert.ok(count > 510 && count < 690, `observed ${count}/12000`);
});
test("same pixels always give the same rare and finish changes do not reroll; v2 golden stays unchanged", () => {
  const features = analyzePixels(
    new Uint8Array(Array.from({ length: 4096 }, () => [70, 230, 190]).flat()),
    8,
    8,
  );
  const c = generateCharacter(features);
  assert.equal(c.version, "photo-v3");
  assert.equal(c.moves[3].id, "sky-rend");
  for (let i = 0; i < 8; i++)
    assert.deepEqual(
      generateCharacter(Object.fromEntries(Object.entries(features).reverse())),
      c,
    );
  assert.equal(
    generateCharacter(features, "photo-v2").moves.some((m) => m.rarity),
    false,
  );
  const card = withCharacter(c),
    a = createBattle([[card, card, card], makeCpuTeam(1)], 1);
  card.finish = { id: "prism" };
  const b = createBattle([[card, card, card], makeCpuTeam(1)], 1);
  assert.deepEqual(a.teams[0][0].card.character, b.teams[0][0].card.character);
});
test("protocol 5 canonicalizes rare metadata and mixed v1/v2/v3 without accepting injected rare skills", () => {
  assert.equal(PROTOCOL_VERSION, 5);
  const c = fixtures.get("sky-rend");
  const cards = ["photo-v1", "photo-v2", "photo-v3"].map((version) =>
    withCharacter(generateCharacter(c.features, version)),
  );
  const input = wireTeam(cards);
  input.forEach((card) => {
    card.image = "data:image/png;base64,AA==";
    card.fingerprint = "a".repeat(64);
    card.character.moves = [
      { id: "worldbreaker", power: 999999, rarity: "rare" },
    ];
  });
  const clean = normalizeTeam(input);
  clean.forEach((card, i) =>
    assert.deepEqual(card.character, cards[i].character),
  );
  assert.equal(
    clean[1].character.moves.some((m) => m.rarity),
    false,
  );
  assert.equal(clean[2].character.moves[3].id, "sky-rend");
  assert.deepEqual(
    createBattle([clean, clean], 1).teams[0][2].card.character.moves,
    clean[2].character.moves,
  );
});
test("all twenty rare moves execute deterministically, consume one PP, and correctly target their effects", () => {
  for (const m of RARE_MOVE_LIBRARY) {
    const s = battle(m.id),
      f = s.teams[0][0];
    f.hp = 150;
    if (m.cleanse) {
      f.status = "seal";
      f.statusTurns = 3;
    }
    const before = structuredClone(s),
      out = play(s);
    assert.deepEqual(s, before);
    assert.deepEqual(out, play(s));
    assert.equal(out.teams[0][0].pp[3], m.pp - 1, m.id);
    assert.equal(
      out.log.find((e) => e.kind === "move" && e.side === 0).rarity,
      "rare",
    );
    const end = out.log.findIndex((e) => e.kind === "move" && e.side === 1);
    const hits = out.log
      .slice(0, end)
      .filter((e) => e.kind === "damage" && e.side === 1);
    if (m.power) {
      assert.equal(hits.length, m.hits || 1, m.id);
      const actual = hits.reduce((v, e) => v + e.amount, 0);
      if (m.drain)
        assert.equal(
          out.teams[0][0].hp,
          Math.min(400, 150 + Math.floor(actual * m.drain * 0.95)),
          m.id,
        );
      if (m.recoil)
        assert.equal(
          out.teams[0][0].hp,
          150 - Math.ceil(actual * m.recoil),
          m.id,
        );
      const own = s.teams[0][0],
        enemy = s.teams[1][0];
      assert.ok(
        estimateMoveDamage(own, enemy, m) >
          estimateMoveDamage(own, enemy, {
            ...m,
            power: 55,
            hits: 1,
            ignoreDefense: 0,
          }),
        m.id,
      );
    }
    if (m.cleanse) assert.equal(out.teams[0][0].status, null, m.id);
    if (m.healScale)
      assert.equal(
        out.teams[0][0].hp,
        Math.min(400, 150 + Math.floor(recoveryAmount(f) * m.healScale)),
        m.id,
      );
    if (m.stages)
      for (const [key, delta] of Object.entries(m.stages))
        assert.equal(
          out.teams[m.target === "self" ? 0 : 1][0][key],
          delta,
          m.id,
        );
  }
});
test("rare triple-hit drain stops at KO and counts actual damage, not theoretical overkill", () => {
  const s = battle("leviathan-torrent");
  s.teams[0][0].hp = 100;
  s.teams[1][0].hp = 10;
  const out = play(s),
    hits = out.log.filter((e) => e.kind === "damage" && e.side === 1);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].amount, 10);
  assert.equal(out.teams[0][0].hp, 103);
  assert.equal(out.teams[1][0].pp[0], s.teams[1][0].pp[0]);
});
test("priority rare recovery removes seal before healing and saves a slower injured fighter", () => {
  const s = battle("miracle-dawn");
  s.teams[0][0].hp = 10;
  s.teams[0][0].status = "seal";
  s.teams[0][0].statusTurns = 3;
  s.teams[0][0].card.character.stats.speed = 15;
  s.teams[1][0].card.character.stats.speed = 250;
  s.teams[1][0].card.character.moves[0] = structuredClone(
    RARE_MOVE_LIBRARY.find((m) => m.id === "sky-rend"),
  );
  const out = play(s);
  assert.deepEqual(
    out.log.filter((e) => e.kind === "move").map((e) => e.side),
    [0, 1],
  );
  assert.ok(out.teams[0][0].hp > 10);
  assert.equal(out.teams[0][0].status, null);
  assert.equal(
    chooseCpuAction(publicState(s), 0, "normal", () => 0.5).index,
    3,
  );
});
test("rare double-hit recoil applies even after KO and can end in a draw", () => {
  const s = battle("eclipse-execution");
  s.teams[0][0].hp = 1;
  s.teams[1][0].hp = 1;
  for (const team of s.teams) team.slice(1).forEach((f) => (f.hp = 0));
  const out = play(s);
  assert.equal(out.winner, "draw");
  assert.equal(out.phase, "finished");
  assert.equal(
    out.log.filter((e) => e.kind === "damage" && e.side === 1).length,
    1,
  );
});
test("rare status attacks respect resistance instead of guaranteeing poison, burn or slow", () => {
  for (const id of ["inferno-crown", "absolute-tide", "abyssal-plague"]) {
    let low = 0,
      high = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const s = battle(id, seed * 7129);
      if (play(s).teams[1][0].status) low++;
      s.teams[1][0].card.character.stats.resistance = 100;
      if (play(s).teams[1][0].status) high++;
    }
    assert.ok(low > high + 10, `${id}: ${low}/${high}`);
  }
});
test("60 games with rare holders finish legally across all CPU levels", () => {
  const pool = [...fixtures.values()];
  for (const difficulty of ["easy", "normal", "hard"])
    for (let seed = 1; seed <= 20; seed++) {
      const team = [0, 1, 2].map((i) =>
        withCharacter(pool[(seed + i) % pool.length]),
      );
      let s = createBattle([team, [...team].reverse()], seed * 37),
        steps = 0;
      const rnd = seededRandom(seed);
      while (s.phase !== "finished" && steps++ < 125) {
        const pub = publicState(s),
          actions = [0, 1].map((i) => chooseCpuAction(pub, i, difficulty, rnd));
        assert.ok(actions.every((a, i) => validateAction(s, i, a)));
        s = resolveTurn(s, actions);
        for (const row of s.teams)
          for (const f of row) {
            assert.ok(f.hp >= 0 && f.hp <= f.card.character.stats.hp);
            assert.ok(f.pp.every((p) => p >= 0));
          }
      }
      assert.equal(s.phase, "finished");
      assert.ok(s.turn <= 60);
    }
});
