import test from "node:test";
import assert from "node:assert/strict";
import {
  makeCpuTeam,
  makeStrongCpuTeam,
  withMetalSlime,
} from "../src/battle/presets.js";
import {
  METAL_SLIME_CHANCE,
  METAL_SLIME_HIT_FACTOR,
  METAL_SLIME_NAME,
  metalSlimeCard,
} from "../src/battle/metal-slime.js";
import {
  createBattle,
  moveAccuracy,
  resolveTurn,
} from "../src/battle/engine.js";

const slime = () => metalSlimeCard();
const isSlime = (card) => card.character?.metalSlime === true;

test("a rare metal slime joins CPU teams about one battle in three", () => {
  let encounters = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const base = makeCpuTeam(seed);
    const team = withMetalSlime(base, seed);
    assert.equal(team.length, 3);
    const slimes = team.filter(isSlime);
    assert.ok(slimes.length <= 1);
    if (slimes.length) {
      encounters++;
      assert.equal(slimes[0].name, METAL_SLIME_NAME);
      assert.deepEqual(
        team.map((card) => card.fingerprint),
        withMetalSlime(makeCpuTeam(seed), seed).map((card) => card.fingerprint),
      );
    }
  }
  const rate = encounters / 600;
  assert.ok(rate > 0.25 && rate < 0.42, `encounter rate ${rate}`);
  assert.ok(Math.abs(rate - METAL_SLIME_CHANCE) < 0.06);
});

test("the metal slime also appears in the strongest CPU roster", () => {
  let found = false;
  for (let seed = 1; seed <= 200 && !found; seed++) {
    const team = withMetalSlime(makeStrongCpuTeam(seed), seed);
    found = team.some(isSlime);
    if (found) {
      assert.equal(team.filter(isSlime).length, 1);
      assert.equal(team.length, 3);
    }
  }
  assert.ok(found);
});

test("the metal slime has extreme speed, tiny HP, and keeps its fixed moves", () => {
  const card = slime();
  const stats = card.character.stats;
  assert.ok(stats.hp <= 10);
  assert.equal(stats.speed, 250);
  assert.equal(card.character.metalSlime, true);
  const state = createBattle(
    [makeCpuTeam(1), [card, ...makeCpuTeam(2).slice(0, 2)]],
    7,
  );
  assert.deepEqual(
    state.teams[1][0].card.character.moves.map((move) => move.id),
    card.character.moves.map((move) => move.id),
  );
  assert.equal(state.teams[1][0].hp, stats.hp);
});

test("while the metal slime is active, the opponent's accuracy is heavily cut", () => {
  const attacker = makeCpuTeam(1);
  const state = createBattle(
    [attacker, [slime(), ...makeCpuTeam(2).slice(0, 2)]],
    7,
  );
  const move = { accuracy: 100, power: 10 };
  assert.equal(moveAccuracy(state, 0, move), 35);
  assert.equal(moveAccuracy(state, 0, { accuracy: 100, target: "self" }), 100);
  assert.equal(
    moveAccuracy(state, 0, { accuracy: 80, power: 10 }),
    80 * METAL_SLIME_HIT_FACTOR,
  );
  // 100%命中の技でも、白銀スライム相手なら外れることがある。
  let evasions = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const battle = createBattle(
      [makeCpuTeam(1), [slime(), ...makeCpuTeam(2).slice(0, 2)]],
      seed,
    );
    const index = battle.teams[0][0].card.character.moves.findIndex(
      (candidate) => candidate.power > 0,
    );
    assert.ok(index >= 0);
    const next = resolveTurn(battle, [
      { type: "move", index },
      { type: "move", index: 0 },
    ]);
    if (next.log.some((event) => event.text?.includes("かわした"))) evasions++;
  }
  assert.ok(evasions > 10, `evasions ${evasions}`);
  assert.ok(evasions < 80, `evasions ${evasions}`);
});
