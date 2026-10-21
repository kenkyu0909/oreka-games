import test from "node:test";
import assert from "node:assert/strict";
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  DETAIL_FEATURE_KEYS,
} from "../src/features.js";
import { FEATURES } from "../src/game.js";
import { FEATURE_KEYS as PROTOCOL_FEATURE_KEYS } from "../src/battle/protocol.js";
import { createRandom, xorshiftStep } from "../src/random.js";
import { nextRandom } from "../src/battle/engine.js";
import { seededRandom } from "../src/battle/presets.js";
import { MOVE_LIBRARY } from "../src/moves.js";
import { RARE_MOVE_LIBRARY } from "../src/rare-moves.js";

test("feature keys and labels have a single canonical definition", () => {
  assert.equal(FEATURE_KEYS.length, 11);
  assert.equal(new Set(FEATURE_KEYS).size, FEATURE_KEYS.length);
  assert.deepEqual(PROTOCOL_FEATURE_KEYS, FEATURE_KEYS);
  assert.deepEqual(
    FEATURES.map(([key]) => key),
    [...DETAIL_FEATURE_KEYS],
  );
  for (const key of FEATURE_KEYS)
    assert.equal(typeof FEATURE_LABELS[key], "string", key);
});

test("shared xorshift preserves the battle and card-generation sequence", () => {
  // 既知の先頭値を固定し、戦闘・CPU編成・技抽選の再現性を守る。
  const known = createRandom(1);
  assert.deepEqual(
    [known(), known(), known()].map((value) => Math.round(value * 1e6)),
    [63, 15747, 616404],
  );

  const state = { seed: 12345 };
  const random = createRandom(12345);
  for (let index = 0; index < 32; index++)
    assert.equal(nextRandom(state), random());
  let expected = 12345;
  for (let index = 0; index < 32; index++)
    expected = xorshiftStep(expected);
  assert.equal(state.seed, expected);

  const preset = seededRandom(9876);
  const shared = createRandom(9876);
  for (let index = 0; index < 8; index++)
    assert.equal(preset(), shared());
});

test("every move has its own description", () => {
  const seen = new Map();
  for (const move of [...MOVE_LIBRARY, ...RARE_MOVE_LIBRARY]) {
    assert.equal(
      seen.has(move.text),
      false,
      `${move.id} repeats the description of ${seen.get(move.text)}`,
    );
    seen.set(move.text, move.id);
  }
});
