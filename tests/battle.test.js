import test from "node:test";
import assert from "node:assert/strict";
import { generateCharacter, assignMoves } from "../src/game.js";
import {
  createLegacyBattle as createBattle,
  resolveTurn,
  activeFighter,
  availableActions,
  validateAction,
  estimateDamage,
  effectiveness,
  recoveryAmount,
  finishBattle,
  publicState,
  speed,
  MAX_TURNS,
} from "../src/battle/engine.js";
import { chooseCpuAction } from "../src/battle/cpu.js";
import { makeCpuTeam, seededRandom } from "../src/battle/presets.js";
import { normalizeTeam } from "../src/battle/protocol.js";

export function card(
  name = "test",
  stats = {},
  attribute = "earth",
  level = 6,
) {
  const character = generateCharacter({
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
  });
  character.stats = {
    hp: 240,
    attack: 100,
    defense: 100,
    specialAttack: 100,
    specialDefense: 100,
    speed: 60,
    critical: 20,
    resistance: 80,
    recovery: 30,
    piercing: 20,
    ...stats,
  };
  character.attribute = attribute;
  character.level = level;
  character.moves = assignMoves(attribute, character.stats, level);
  return {
    name,
    character,
    image: "data:image/png;base64,aGVsbG8=",
    finish: { id: "normal" },
    fingerprint: "a".repeat(64),
  };
}
function team(prefix = "A", stats = {}) {
  return Array.from({ length: 3 }, (_, i) => card(prefix + i, stats));
}
function battle(seed = 123456) {
  return createBattle([team(), team("B")], seed);
}
const move = (index) => ({ type: "move", index }),
  swap = (index) => ({ type: "switch", index });

test("battle initialization clones teams, restores HP and initializes four PP pools", () => {
  const teams = [team(), team("B")];
  const state = createBattle(teams, 4);
  assert.equal(state.teams[0][0].hp, 240);
  assert.deepEqual(state.teams[0][0].pp, [20, 8, 10, 5]);
  state.teams[0][0].card.name = "mutated";
  assert.equal(teams[0][0].name, "A0");
  assert.throws(() => createBattle([team(), []]));
});
test("seed and actions replay identically without mutating prior state", () => {
  const state = battle();
  const snapshot = structuredClone(state);
  const a = resolveTurn(state, [move(0), move(1)]),
    b = resolveTurn(state, [move(0), move(1)]);
  assert.deepEqual(a, b);
  assert.deepEqual(state, snapshot);
  assert.notEqual(a.seed, state.seed);
});
test("fast attack acts first, KO cancels slower move without charging PP", () => {
  const state = createBattle(
    [
      team("fast", { attack: 250, speed: 250 }),
      team("slow", { hp: 1, speed: 15 }),
    ],
    8,
  );
  const next = resolveTurn(state, [move(0), move(0)]);
  assert.equal(next.teams[1][0].hp, 0);
  assert.equal(next.teams[1][0].pp[0], 20);
  assert.equal(next.teams[0][0].pp[0], 19);
  assert.equal(next.phase, "replace");
  assert.equal(next.teams[0][0].hp, 240);
});
test("equal speed uses seeded tie-break and both sides can act first", () => {
  const first = new Set();
  for (const seed of [1, 123456, 8765, 50000, 987654321]) {
    const next = resolveTurn(battle(seed), [move(0), move(0)]);
    first.add(
      next.log.find((e) => e.text.includes("の 岩の一撃")).text.includes("A0")
        ? "A"
        : "B",
    );
  }
  assert.equal(first.size, 2);
});
test("voluntary switch happens before a faster enemy attack and clears boosts", () => {
  const state = battle();
  state.teams[0][0].defenseStage = 4;
  state.teams[1][0].card.character.stats.speed = 250;
  const next = resolveTurn(state, [swap(1), move(0)]);
  assert.equal(next.active[0], 1);
  assert.equal(next.teams[0][0].hp, 240);
  assert.ok(next.teams[0][1].hp < 240);
  assert.equal(next.teams[0][0].defenseStage, 0);
});
test("forced replacement is free and does not advance turn or spend PP", () => {
  const state = battle();
  state.phase = "replace";
  state.teams[0][0].hp = 0;
  assert.deepEqual(availableActions(state, 1), [{ type: "wait" }]);
  const next = resolveTurn(state, [swap(2), { type: "wait" }]);
  assert.equal(next.turn, 1);
  assert.equal(next.sequence, 1);
  assert.equal(next.phase, "select");
  assert.equal(next.active[0], 2);
  assert.deepEqual(next.teams[1][0].pp, [20, 8, 10, 5]);
});
test("both players choose forced replacements simultaneously", () => {
  const state = battle();
  state.phase = "replace";
  state.teams[0][0].hp = state.teams[1][0].hp = 0;
  assert.equal(validateAction(state, 1, { type: "wait" }), false);
  const next = resolveTurn(state, [swap(1), swap(2)]);
  assert.deepEqual(next.active, [1, 2]);
});
test("rejects illegal indexes, dead targets, exhausted moves, and finished actions atomically", () => {
  const state = battle();
  state.teams[0][1].hp = 0;
  state.teams[0][0].pp[0] = 0;
  for (const action of [
    swap(0),
    swap(1),
    swap(3),
    move(0),
    move(-1),
    move("2"),
    { type: "wait" },
    { type: "struggle" },
    null,
  ])
    assert.equal(validateAction(state, 0, action), false);
  const snapshot = structuredClone(state);
  assert.throws(() => resolveTurn(state, [move(0), move(1)]));
  assert.deepEqual(state, snapshot);
  assert.deepEqual(availableActions(finishBattle(state, 0), 0), []);
});
test("level only changes conditional attacks, never basic damage", () => {
  const state = battle(),
    a = activeFighter(state, 0),
    d = activeFighter(state, 1),
    basic = a.card.character.moves[0];
  const amount = estimateDamage(a, d, basic);
  a.card.character.level = 1;
  d.card.character.level = 12;
  assert.equal(estimateDamage(a, d, basic), amount);
  const underdog = assignMoves("earth", a.card.character.stats, 1)[2];
  const boosted = estimateDamage(a, d, underdog);
  d.card.character.level = 1;
  assert.ok(boosted > estimateDamage(a, d, underdog));
});
test("attribute chart, piercing, defense stages and burn modify damage", () => {
  assert.equal(effectiveness("water", "fire"), 1.5);
  assert.equal(effectiveness("fire", "water"), 0.67);
  assert.equal(effectiveness(null, "earth"), 1);
  const state = battle(),
    a = activeFighter(state, 0),
    d = activeFighter(state, 1),
    basic = a.card.character.moves[0];
  const base = estimateDamage(a, d, basic);
  a.card.character.stats.piercing = 100;
  assert.ok(estimateDamage(a, d, basic) > base);
  const capped = estimateDamage(a, d, basic);
  a.card.character.stats.piercing = 1000;
  assert.equal(estimateDamage(a, d, basic), capped);
  d.defenseStage = 4;
  assert.ok(estimateDamage(a, d, basic) < base);
  assert.ok(estimateDamage(a, d, basic, true) > base);
  d.defenseStage = 0;
  a.status = "burn";
  assert.ok(estimateDamage(a, d, basic) < capped);
});
test("recover uses recovery ability, caps at max HP, and consumes PP", () => {
  const state = createBattle(
    [team("healer", { recovery: 100, resistance: 1 }), team("B")],
    9,
  );
  state.teams[0][0].hp = 230;
  const next = resolveTurn(state, [move(3), move(3)]);
  assert.equal(next.teams[0][0].hp, 240);
  assert.equal(next.teams[0][0].pp[3], 4);
  assert.equal(recoveryAmount(next.teams[0][0]), Math.floor(240 * 0.43));
});
test("seal blocks recovery and status durations expire, bench durations pause", () => {
  const state = createBattle(
    [team("healer", { recovery: 100, resistance: 1 }), team("B")],
    9,
  );
  state.teams[0][0].hp = 100;
  state.teams[0][0].status = "seal";
  state.teams[0][0].statusTurns = 1;
  const next = resolveTurn(state, [move(3), move(3)]);
  assert.equal(next.teams[0][0].hp, 100);
  assert.equal(next.teams[0][0].status, null);
  const paused = battle();
  paused.teams[0][1].status = "poison";
  paused.teams[0][1].statusTurns = 3;
  const result = resolveTurn(paused, [move(3), move(3)]);
  assert.equal(result.teams[0][1].statusTurns, 3);
  assert.equal(result.teams[0][1].hp, 240);
});
test("burn and poison tick only for active living fighters, slow halves speed", () => {
  const state = battle();
  state.teams[0][0].status = "poison";
  state.teams[0][0].statusTurns = 3;
  state.teams[1][0].status = "burn";
  state.teams[1][0].statusTurns = 3;
  const next = resolveTurn(state, [move(3), move(3)]);
  assert.equal(next.teams[0][0].hp, 216);
  assert.equal(next.teams[1][0].hp, 225);
  assert.equal(next.teams[0][0].statusTurns, 2);
  next.teams[0][0].status = "slow";
  assert.equal(speed(next.teams[0][0]), 30);
});
test("defense boosts cap at six stages", () => {
  let state = battle();
  state.teams[0][0].defenseStage = state.teams[0][0].specialDefenseStage = 6;
  state = resolveTurn(state, [move(3), move(3)]);
  assert.equal(state.teams[0][0].defenseStage, 6);
});
test("all PP exhausted exposes Struggle, recoil can end with simultaneous draw", () => {
  const state = battle();
  for (const side of [0, 1]) {
    state.teams[side][0].hp = 1;
    state.teams[side][1].hp = state.teams[side][2].hp = 0;
    state.teams[side][0].pp = [0, 0, 0, 0];
  }
  assert.deepEqual(availableActions(state, 0), [{ type: "struggle" }]);
  const next = resolveTurn(state, [{ type: "struggle" }, { type: "struggle" }]);
  assert.equal(next.phase, "finished");
  assert.equal(next.winner, "draw");
});
test("60-turn cap scores remaining creatures then HP ratios", () => {
  let state = battle();
  for (let i = 0; i < MAX_TURNS; i++)
    state = resolveTurn(state, [
      swap(state.active[0] === 0 ? 1 : 0),
      swap(state.active[1] === 0 ? 1 : 0),
    ]);
  assert.equal(state.phase, "finished");
  assert.equal(state.winner, "draw");
  assert.equal(state.reason, "turn-limit");
  const near = battle();
  near.turn = 60;
  near.teams[0][0].hp = 1;
  assert.equal(resolveTurn(near, [swap(1), swap(1)]).winner, 1);
});
test("surrender is terminal and public snapshots never expose random seed", () => {
  const state = battle(),
    next = finishBattle(state, 1, "surrender");
  assert.equal(next.winner, 1);
  assert.equal(state.phase, "select");
  assert.equal(finishBattle(next, 0), next);
  assert.equal("seed" in publicState(next), false);
});
test("CPU policies return legal actions, never read hidden seed or player input", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    const state = battle();
    const view = publicState(state);
    const action = chooseCpuAction(view, 1, difficulty, () => 0.4);
    assert.equal(validateAction(state, 1, action), true);
    state.seed = 999;
    assert.deepEqual(
      chooseCpuAction(publicState(state), 1, difficulty, () => 0.4),
      action,
    );
  }
});
test("30 CPU simulations finish with valid HP/PP and at most 60 turns", () => {
  for (const difficulty of ["easy", "normal", "hard"])
    for (let seed = 1; seed <= 10; seed++) {
      let state = createBattle(
          [makeCpuTeam(seed), makeCpuTeam(seed + 100)],
          seed,
        ),
        steps = 0;
      const random = seededRandom(seed);
      while (state.phase !== "finished" && steps++ < 125) {
        const actions = [0, 1].map((side) =>
          chooseCpuAction(publicState(state), side, difficulty, random),
        );
        assert.ok(actions.every((a, s) => validateAction(state, s, a)));
        state = resolveTurn(state, actions);
        for (const team of state.teams)
          for (const f of team) {
            assert.ok(f.hp >= 0 && f.hp <= f.card.character.stats.hp);
            assert.ok(f.pp.every((p) => Number.isInteger(p) && p >= 0));
          }
      }
      assert.equal(state.phase, "finished");
      assert.ok(state.turn <= 60);
    }
});
test("team protocol rederives abilities and moves and rejects unsafe input", () => {
  const input = team();
  input[0].character.stats.hp = 999999;
  input[0].character.moves = [{ id: "injected" }];
  const normalized = normalizeTeam(input);
  assert.ok(normalized[0].character.stats.hp <= 400);
  assert.equal(normalized[0].character.moves.length, 4);
  for (const alteration of [
    (t) => t.pop(),
    (t) => (t[0].character.features.brightness = NaN),
    (t) => (t[0].character.features.red = -1),
    (t) => (t[0].character.version = "unknown"),
    (t) => (t[0].image = "javascript:alert(1)"),
    (t) => (t[0].image = "data:image/svg+xml;base64,PHN2Zz4="),
    (t) => (t[0].fingerprint = "bad"),
  ]) {
    const copy = structuredClone(input);
    alteration(copy);
    assert.throws(() => normalizeTeam(copy));
  }
});

test("wave secondary effects use the correct element and high resistance reduces incidence", () => {
  const expected = {
    earth: "poison",
    water: "slow",
    fire: "burn",
    wind: "slow",
    light: "seal",
    dark: "poison",
  };
  for (const [attribute, status] of Object.entries(expected)) {
    let low = 0,
      high = 0;
    for (let seed = 20; seed < 100; seed++) {
      for (const resistance of [0, 100]) {
        const state = createBattle(
          [
            team("A", { speed: 250 }),
            team("B", { hp: 400, specialDefense: 250, resistance }),
          ],
          seed * 171799,
        );
        const c = state.teams[0][0].card.character;
        c.attribute = attribute;
        c.moves = assignMoves(attribute, c.stats, c.level);
        const next = resolveTurn(state, [move(1), move(3)]);
        const applied = next.teams[1][0].status;
        if (applied) {
          assert.equal(applied, status);
          resistance === 0 ? low++ : high++;
        }
      }
    }
    assert.ok(low > 0);
    assert.ok(high > 0);
    assert.ok(high < low);
  }
});
