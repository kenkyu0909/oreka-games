import test from "node:test";
import assert from "node:assert/strict";
import { MOVE_LIBRARY } from "../src/moves.js";
import { RARE_MOVE_LIBRARY } from "../src/rare-moves.js";
import { moveSummary, moveCaution } from "../src/move-description.js";

const moves = [...MOVE_LIBRARY, ...RARE_MOVE_LIBRARY];
test("all 68 moves explain their real effects without dropping risks or conditions", () => {
  assert.equal(moves.length, 68);
  for (const move of moves) {
    const text = moveSummary(move);
    assert.ok(text.length > 3, move.id);
    assert.doesNotMatch(text, /undefined|NaN/, move.id);
    if (move.hits) assert.ok(text.includes(`${move.hits}回攻撃`), move.id);
    if (move.recoil)
      assert.ok(
        text.includes(`${Math.round(move.recoil * 100)}%を反動で受ける`),
        move.id,
      );
    if (move.drain) assert.match(text, /基準にHP回復/);
    if (move.status) assert.match(text, /狙う/);
    if (move.status) assert.match(moveCaution(move), /耐性で下がります/);
    if (move.stages)
      assert.ok(
        text.includes(move.target === "enemy" ? "相手の" : "自分の"),
        move.id,
      );
    if (move.condition) assert.match(text, /なら威力/);
    if (move.cleanse) assert.match(text, /状態異常を治す/);
    if (move.healScale)
      assert.match(moveSummary(move, 42), /自分のHPを最大42回復/);
    if (move.priority) assert.match(moveCaution(move), /交代は先制技より先/);
  }
});
test("old generation move copy is not reinterpreted using modern rules", () => {
  const legacy = { id: "ward", text: "自分の防御を上げる。" };
  assert.equal(moveSummary(legacy), legacy.text);
});
