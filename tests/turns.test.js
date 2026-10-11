import test from "node:test";
import assert from "node:assert/strict";
import {
  createSequentialBattle as createBattle,
  resolveAction,
  availableActions,
  publicState,
  activeFighter,
} from "../src/battle/engine.js";
import { makeCpuTeam, seededRandom } from "../src/battle/presets.js";
import { chooseCpuAction } from "../src/battle/cpu.js";
function battle(seed = 123) {
  const teams = [makeCpuTeam(22), makeCpuTeam(42)];
  for (let side = 0; side < 2; side++)
    for (const card of teams[side])
      Object.assign(card.character.stats, {
        hp: 400,
        attack: 35,
        specialAttack: 35,
        defense: 180,
        specialDefense: 180,
        speed: side ? 40 : 100,
      });
  return createBattle(teams, seed);
}
test("v2: one action resolves immediately; only current actor can choose", () => {
  const state = battle(),
    before = structuredClone(state);
  assert.equal(state.version, "battle-v2");
  assert.equal(state.actor, 0);
  assert.deepEqual(availableActions(state, 1), []);
  assert.throws(
    () => resolveAction(state, 1, { type: "move", index: 0 }),
    /手番/,
  );
  const next = resolveAction(state, 0, { type: "move", index: 0 });
  assert.equal(next.actor, 1);
  assert.equal(next.turn, 1);
  assert.equal(next.sequence, 1);
  assert.equal(next.log.filter((e) => e.kind === "move").length, 1);
  assert.equal(next.teams[0][0].hp, 400);
  assert.ok(next.teams[1][0].hp < 400);
  assert.equal(next.teams[0][0].pp[0], 19);
  assert.equal(next.teams[1][0].pp[0], 20);
  assert.deepEqual(state, before);
  const last = resolveAction(next, 1, { type: "move", index: 0 });
  assert.equal(last.turn, 2);
  assert.equal(last.actor, 0);
  assert.equal(last.actionNumber, 2);
});
test("v2: switching spends only its own hand; initiative is fixed within a round", () => {
  let state = battle();
  state.teams[0][1].card.character.stats.speed = 1;
  state.teams[0][0].defenseStage = 3;
  state = resolveAction(state, 0, { type: "switch", index: 1 });
  assert.equal(state.actor, 1);
  assert.equal(state.active[0], 1);
  assert.equal(state.teams[0][0].defenseStage, 0);
  state = resolveAction(state, 1, { type: "move", index: 0 });
  assert.equal(state.actor, 1);
  assert.equal(state.turn, 2);
});
test("v2: KO cancels unspent hand, free replacement then recalculates initiative", () => {
  let state = battle();
  state.teams[1][0].hp = 1;
  state = resolveAction(state, 0, { type: "move", index: 0 });
  assert.equal(state.phase, "replace");
  assert.equal(state.actor, 1);
  assert.equal(state.turn, 2);
  assert.equal(state.actionNumber, 1);
  assert.equal(state.teams[1][0].pp[0], 20);
  assert.deepEqual(availableActions(state, 0), []);
  state = resolveAction(state, 1, { type: "switch", index: 1 });
  assert.equal(state.phase, "select");
  assert.equal(state.actor, 0);
  assert.equal(state.actionNumber, 1);
});
test("v2: status ticks once per round, not per hand; slow changes next initiative", () => {
  let state = battle();
  const f = activeFighter(state, 0);
  f.status = "poison";
  f.statusTurns = 3;
  state = resolveAction(state, 0, { type: "move", index: 0 });
  assert.equal(activeFighter(state, 0).hp, 400);
  assert.equal(activeFighter(state, 0).statusTurns, 3);
  state = resolveAction(state, 1, { type: "move", index: 0 });
  assert.equal(activeFighter(state, 0).statusTurns, 2);
  assert.equal(
    state.log.filter((e) => e.kind === "damage" && e.amount === 40).length,
    1,
  );
  state = battle();
  state.teams[0][0].status = "slow";
  state.teams[0][0].statusTurns = 3;
  state.teams[1][0].card.character.stats.speed = 70;
  state = resolveAction(state, 0, { type: "move", index: 0 });
  state = resolveAction(state, 1, { type: "move", index: 0 });
  assert.equal(state.actor, 1);
});
test("v2: simultaneous end-status KO has sequential free replacements without double ticks", () => {
  let state = battle();
  for (const team of state.teams) {
    team[0].hp = 1;
    team[0].status = "poison";
    team[0].statusTurns = 3;
  }
  state = resolveAction(state, 0, { type: "switch", index: 1 });
  state.teams[0][1].hp = 1;
  state.teams[0][1].status = "poison";
  state.teams[0][1].statusTurns = 3;
  // Switch opponent too so neither dies to a move; both poison ticks occur at round end.
  state.teams[1][1].hp = 1;
  state.teams[1][1].status = "poison";
  state.teams[1][1].statusTurns = 3;
  state = resolveAction(state, 1, { type: "switch", index: 1 });
  assert.equal(state.actor, 0);
  assert.equal(state.phase, "replace");
  const logs = state.log.filter((e) => e.kind === "damage").length;
  state = resolveAction(state, 0, { type: "switch", index: 2 });
  assert.equal(state.actor, 1);
  state = resolveAction(state, 1, { type: "switch", index: 2 });
  assert.equal(state.phase, "select");
  assert.equal(state.log.filter((e) => e.kind === "damage").length, logs);
  assert.equal(state.turn, 2);
});
test("v2: 60-round cap terminates a switch-only battle after exactly 120 hands", () => {
  let state = battle();
  while (state.phase !== "finished")
    state = resolveAction(state, state.actor, {
      type: "switch",
      index: state.active[state.actor] === 0 ? 1 : 0,
    });
  assert.equal(state.reason, "turn-limit");
  assert.equal(state.turn, 60);
  assert.equal(state.actionNumber, 120);
  assert.equal(state.actor, null);
});
test("v2: seeded CPU replay is identical and 30 matches finish with valid state", () => {
  function play(seed) {
    let state = createBattle([makeCpuTeam(seed), makeCpuTeam(seed + 10)], seed);
    let count = 0;
    while (state.phase !== "finished") {
      const side = state.actor;
      const action = chooseCpuAction(
        publicState(state),
        side,
        "normal",
        seededRandom(seed + state.sequence),
      );
      assert.ok(action);
      state = resolveAction(state, side, action);
      assert.ok(++count < 150);
      for (const team of state.teams)
        for (const f of team) {
          assert.ok(f.hp >= 0 && f.hp <= f.card.character.stats.hp);
          assert.ok(f.pp.every((p) => p >= 0));
        }
    }
    return state;
  }
  assert.deepEqual(play(7), play(7));
  for (let seed = 1; seed <= 30; seed++) assert.ok(play(seed).turn <= 60);
});
test("v2: illegal indexes and finished requests are immutable failures", () => {
  const state = battle(),
    before = structuredClone(state);
  for (const action of [
    null,
    { type: "wait" },
    { type: "move", index: -1 },
    { type: "switch", index: 0 },
  ])
    assert.throws(() => resolveAction(state, 0, action));
  assert.deepEqual(state, before);
  state.phase = "finished";
  assert.throws(() => resolveAction(state, 0, { type: "move", index: 0 }));
});
