import test from "node:test";
import assert from "node:assert/strict";
import { makeCpuTeam, makeStrongCpuTeam } from "../src/battle/presets.js";
import { STRONG_CARDS } from "../src/battle/strong-roster.js";
import { chooseCpuAction } from "../src/battle/cpu.js";
import { createBattle, publicState } from "../src/battle/engine.js";
import { characterForCard } from "../src/game.js";
import { normalizeTeam } from "../src/battle/protocol.js";

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

test("the ten CPU-only cards drop to 1/10 stats only on the player side", () => {
  for (const card of STRONG_CARDS) {
    const player = characterForCard(
      card.name,
      card.character.features,
      card.character.version,
    );
    assert.equal(player.strongCpuOnly, true);
    assert.equal(player.level, card.character.level);
    assert.equal(player.attribute, card.character.attribute);
    assert.deepEqual(
      player.moves.map((move) => move.id),
      card.character.moves.map((move) => move.id),
    );
    for (const [key, value] of Object.entries(card.character.stats)) {
      assert.equal(player.stats[key], Math.max(1, Math.round(value / 10)));
    }
    // 図鑑の照合などCPU側の原本は、補正なしの能力のまま。
    const cpu = characterForCard(
      card.name,
      card.character.features,
      card.character.version,
      { cpu: true },
    );
    assert.equal(cpu.strongCpuOnly, undefined);
    assert.deepEqual(cpu.stats, card.character.stats);
  }
});

test("renaming and the online protocol keep the strong-card nerf", () => {
  const card = STRONG_CARDS[0];
  const copy = {
    name: "名前を変えても同じ",
    image: "data:image/png;base64,iVBORw0KGgo=",
    fingerprint: "a".repeat(64),
    finish: { id: "normal" },
    character: {
      version: card.character.version,
      features: card.character.features,
    },
  };
  const clean = normalizeTeam([copy, copy, copy]);
  for (const entry of clean) {
    assert.equal(entry.character.strongCpuOnly, true);
    assert.equal(
      entry.character.stats.hp,
      Math.max(1, Math.round(card.character.stats.hp / 10)),
    );
    assert.deepEqual(
      entry.character.moves.map((move) => move.id),
      card.character.moves.map((move) => move.id),
    );
  }
});
