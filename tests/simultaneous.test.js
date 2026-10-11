import test from "node:test";
import assert from "node:assert/strict";
import {
  createBattle,
  resolveTurn,
  availableActions,
  activeFighter,
  publicState,
} from "../src/battle/engine.js";
import { makeCpuTeam, seededRandom } from "../src/battle/presets.js";
import { chooseCpuAction } from "../src/battle/cpu.js";
function battle() {
  const teams = [makeCpuTeam(22), makeCpuTeam(42)];
  for (const side of [0, 1])
    for (const card of teams[side])
      Object.assign(card.character.stats, {
        hp: 400,
        attack: 35,
        specialAttack: 35,
        defense: 180,
        specialDefense: 180,
        speed: side ? 200 : 50,
      });
  teams.flat().forEach((card) => (card.character.version = "photo-v1"));
  return createBattle(teams, 12345);
}
const move = { type: "move", index: 0 };
test("simultaneous allows both players to choose but rejects partial turns without mutation", () => {
  const state = battle(),
    before = structuredClone(state);
  assert.equal(state.version, "battle-v4");
  assert.equal("actor" in state, false);
  for (const side of [0, 1])
    assert.ok(availableActions(state, side).some((a) => a.type === "move"));
  for (const actions of [[move], [move, null], [null, move]])
    assert.throws(() => resolveTurn(state, actions));
  assert.deepEqual(state, before);
});
test("simultaneous resolves both moves in speed order regardless of player index", () => {
  let state = battle();
  state = resolveTurn(state, [move, move]);
  assert.deepEqual(
    state.log.filter((e) => e.kind === "move").map((e) => e.side),
    [1, 0],
  );
  assert.equal(state.turn, 2);
  assert.equal(state.sequence, 1);
  for (const side of [0, 1]) assert.equal(activeFighter(state, side).pp[0], 19);
});
test("simultaneous uses slow-adjusted speed and a reproducible tie break", () => {
  const state = battle();
  state.teams[1][0].status = "slow";
  state.teams[1][0].statusTurns = 3;
  state.teams[0][0].card.character.stats.speed = 150;
  assert.equal(
    resolveTurn(state, [move, move]).log.find((e) => e.kind === "move").side,
    0,
  );
  state.teams[0][0].card.character.stats.speed = 100;
  assert.deepEqual(
    resolveTurn(state, [move, move]),
    resolveTurn(state, [move, move]),
  );
});
test("simultaneous switches before attacks and a KO cancels the slower committed move without spending PP", () => {
  let state = battle();
  state = resolveTurn(state, [{ type: "switch", index: 1 }, move]);
  assert.equal(state.log.find((e) => e.kind === "switch").side, 0);
  assert.ok(state.teams[0][1].hp < 400);
  assert.equal(state.teams[0][0].hp, 400);
  state = battle();
  state.teams[0][0].hp = 1;
  state = resolveTurn(state, [move, move]);
  assert.equal(state.phase, "replace");
  assert.equal(state.teams[0][0].pp[0], 20);
  assert.deepEqual(
    state.log.filter((e) => e.kind === "move").map((e) => e.side),
    [1],
  );
  state = resolveTurn(state, [{ type: "switch", index: 1 }, { type: "wait" }]);
  assert.equal(state.phase, "select");
  assert.equal(state.turn, 2);
});
test("simultaneous CPU policies receive only the pre-turn snapshot and 30 matches terminate legally", () => {
  for (let seed = 1; seed <= 30; seed++) {
    let state = createBattle([makeCpuTeam(seed), makeCpuTeam(seed + 30)], seed),
      count = 0;
    while (state.phase !== "finished") {
      const snapshot = publicState(state);
      assert.equal("seed" in snapshot, false);
      assert.equal("pending" in snapshot, false);
      const actions = [0, 1].map((side) =>
        chooseCpuAction(
          snapshot,
          side,
          "normal",
          seededRandom(seed + side + state.sequence),
        ),
      );
      state = resolveTurn(state, actions);
      assert.ok(++count < 75);
      for (const team of state.teams)
        for (const f of team) {
          assert.ok(f.hp >= 0 && f.hp <= f.card.character.stats.hp);
          assert.ok(f.pp.every((p) => p >= 0));
        }
    }
    assert.ok(state.turn <= 60);
  }
});
