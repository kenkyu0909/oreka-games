import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { validateVault } from "../src/vault-data.js";
import { decodeImage, sampleImage } from "../src/decode.js";
import { analyzePixels, generateCharacter } from "../src/game.js";
import { isFinalKnockout } from "../src/battle/highlights.js";
const root = new URL("../public/strong-cards/", import.meta.url);
const manifest = JSON.parse(
  fs.readFileSync(new URL("manifest.json", root), "utf8"),
);

test("vault covers six attributes and ten different rare moves without changing canonical rules", () => {
  const cards = validateVault(manifest);
  assert.equal(new Set(cards.map((c) => c.attribute)).size, 6);
  assert.equal(new Set(cards.map((c) => c.character.moves[3].id)).size, 10);
  for (const c of cards) {
    assert.equal(
      c.character.moves.filter((m) => m.rarity === "rare").length,
      1,
    );
    assert.equal(new Set(c.character.moves.map((m) => m.id)).size, 4);
    assert.ok(c.character.stats.hp >= 200);
    assert.ok(c.character.stats.speed >= 225);
    assert.ok(c.character.stats.specialAttack >= 175);
    assert.equal(c.character.attribute, c.attribute);
  }
});
test("all ten saved PNGs reproduce the exact hash, features, abilities and four moves through the actual decoder", () => {
  for (const card of manifest.cards) {
    const bytes = fs.readFileSync(new URL(card.file, root));
    assert.equal(bytes.length, card.bytes, card.id);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      card.sha256,
      card.id,
    );
    const image = decodeImage(bytes);
    assert.deepEqual([image.width, image.height], [4000, 6000]);
    const actual = generateCharacter(
      analyzePixels(sampleImage(image), image.width, image.height),
    );
    assert.deepEqual(actual, card.character, card.id);
    const preview = decodeImage(fs.readFileSync(new URL(card.preview, root)));
    assert.deepEqual([preview.width, preview.height], [360, 540]);
  }
});
test("vault rejects incompatible rules, altered stats, invalid features and unsafe image paths", () => {
  for (const mutate of [
    (m) => (m.rule = "photo-v2"),
    (m) => m.cards[0].character.stats.hp++,
    (m) => (m.cards[0].file = "https://other.example/picture.png"),
    (m) => (m.cards[0].preview = "../private.png"),
    (m) => (m.cards[0].character.features.brightness = -1),
    (m) => (m.cards[0].bytes = 13 * 1024 * 1024),
    (m) => (m.cards[0].sha256 = "oops"),
    (m) => (m.cards[1] = m.cards[0]),
    (m) => (m.cards[0] = null),
  ]) {
    const m = structuredClone(manifest);
    mutate(m);
    assert.throws(() => validateVault(m));
  }
});
test("finisher appears only on the last knockout of a knockout-decided battle", () => {
  const state = {
    phase: "finished",
    reason: "knockout",
    winner: 0,
    teams: [
      [{ hp: 20 }, { hp: 0 }, { hp: 0 }],
      [{ hp: 0 }, { hp: 0 }, { hp: 0 }],
    ],
  };
  const events = [
    { kind: "damage", side: 1 },
    { kind: "knockout", side: 1 },
    { text: "done" },
  ];
  const before = JSON.stringify(state);
  assert.equal(isFinalKnockout(state, events, 0), false);
  assert.equal(isFinalKnockout(state, events, 1), true);
  assert.equal(
    isFinalKnockout({ ...state, phase: "choose" }, events, 1),
    false,
  );
  assert.equal(
    isFinalKnockout({ ...state, reason: "surrender" }, events, 1),
    false,
  );
  assert.equal(
    isFinalKnockout({ ...state, reason: "turn-limit" }, events, 1),
    false,
  );
  assert.equal(isFinalKnockout({ ...state, winner: 1 }, events, 1), false);
  assert.equal(JSON.stringify(state), before);
});
test("double knockout draws get one finisher, not two false victories", () => {
  const state = {
    phase: "finished",
    reason: "knockout",
    winner: "draw",
    teams: [[{ hp: 0 }], [{ hp: 0 }]],
  };
  const events = [
    { kind: "knockout", side: 1 },
    { kind: "damage", side: 0 },
    { kind: "knockout", side: 0 },
  ];
  assert.equal(isFinalKnockout(state, events, 0), false);
  assert.equal(isFinalKnockout(state, events, 2), true);
});
