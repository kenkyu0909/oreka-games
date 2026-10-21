import test from "node:test";
import assert from "node:assert/strict";
import { makeCpuTeam, makeStrongCpuTeam } from "../src/battle/presets.js";
import { STRONG_CARDS } from "../src/battle/strong-roster.js";
import { chooseCpuAction } from "../src/battle/cpu.js";
import { createBattle, publicState } from "../src/battle/engine.js";

test("strongest CPU roster exposes the ten strong cards", () => {
  assert.equal(STRONG_CARDS.length, 10);
  assert.equal(new Set(STRONG_CARDS.map((card) => card.id)).size, 10);
  for (const card of STRONG_CARDS) {
    assert.ok(card.name);
    assert.ok(card.preview);
    assert.equal(card.character.version, "photo-v3");
    assert.equal(card.character.moves.length, 4);
    assert.equal(card.attribute, card.character.attribute);
  }
});

test("strongest CPU team is deterministic, unique, and keeps the strong stats/moves", () => {
  for (const seed of [1, 2, 12345, 4294967295]) {
    const team = makeStrongCpuTeam(seed);
    assert.equal(team.length, 3);
    assert.equal(new Set(team.map((card) => card.fingerprint)).size, 3);
    assert.deepEqual(
      team.map((card) => card.name),
      makeStrongCpuTeam(seed).map((card) => card.name),
    );
    for (const card of team) {
      const matched = STRONG_CARDS.find(
        (strong) => strong.name === card.name,
      );
      assert.ok(matched);
      assert.deepEqual(card.character.stats, matched.character.stats);
      assert.deepEqual(
        card.character.moves.map((move) => move.id),
        matched.character.moves.map((move) => move.id),
      );
      assert.ok(card.image);
    }
  }
});

test("strongest CPU still returns legal battle actions", () => {
  const state = createBattle([makeCpuTeam(3), makeStrongCpuTeam(7)], 7);
  const action = chooseCpuAction(publicState(state), 1, "strongest", () => 0.5);
  assert.ok(action);
  assert.ok(["move", "switch", "struggle"].includes(action.type));
});
