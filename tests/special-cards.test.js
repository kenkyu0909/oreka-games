import test from "node:test";
import assert from "node:assert/strict";
import { characterForCard, movesForCharacter } from "../src/game.js";
import { specialCardFor } from "../src/special-cards.js";
import { moveTags } from "../src/moves.js";
import { moveSummary } from "../src/move-description.js";
import { normalizeTeam, wireTeam } from "../src/battle/protocol.js";
import {
  createBattle,
  resolveTurn,
  activeFighter,
  availableActions,
  estimateDamage,
  speed,
} from "../src/battle/engine.js";

const NAME = "破壊竜ガンドラG";
const FEATURES = {
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
};
function card(name, stats = {}) {
  const character = characterForCard(name, { ...FEATURES });
  Object.assign(character.stats, stats);
  return {
    name,
    character,
    image: "data:image/png;base64,AA==",
    fingerprint: "a".repeat(64),
    finish: { id: "normal", label: "ノーマル", short: "NORMAL" },
  };
}
const move = (side) => ({ type: "move", index: side });

test("special card: 名前で4枠目が固定技になり、能力値は写真のまま", () => {
  const gandora = characterForCard(NAME, FEATURES);
  assert.equal(gandora.special, "gandora-x");
  assert.equal(gandora.moves.length, 4);
  assert.equal(gandora.moves[3].id, "destroy-giga-raze");
  assert.equal(gandora.moves[3].name, "デストロイ・ギガ・レイズ");
  assert.equal(gandora.moves[3].priority, -1);
  assert.equal(gandora.moves[3].pp, 1);
  assert.equal(gandora.moves[3].accuracy, 100);

  const plain = characterForCard("ふつうのカード", FEATURES);
  assert.equal(plain.special, undefined);
  assert.deepEqual(gandora.stats, plain.stats);
  assert.equal(gandora.level, plain.level);
  for (let i = 0; i < 3; i++)
    assert.equal(gandora.moves[i].id, plain.moves[i].id);

  // 名前の表記ゆれ（前後・全角の空白、全角英字、大文字小文字）を吸収する。
  assert.equal(characterForCard("　破壊竜ガンドラｇ　", FEATURES).special, "gandora-x");
  assert.equal(specialCardFor("破壊竜ガンドラG")?.id, "gandora-x");
  assert.equal(specialCardFor("破壊竜ガンドラ"), null);

  // 名前を普通の名前に戻すと、特殊技も印も外れる。
  const reverted = characterForCard("ふつうのカード", FEATURES);
  assert.equal(reverted.special, undefined);
  assert.equal(reverted.moves[3].id, plain.moves[3].id);
  // 対戦で使う技は名前から作り直しても同じ。
  assert.equal(movesForCharacter(gandora)[3].id, "destroy-giga-raze");
});

test("special card: オンラインでも名前だけで同じ技を再現できる", () => {
  const wire = wireTeam([card(NAME), card("a"), card("b")]);
  // 送るのは生成ルールと特徴値だけ。能力や技は受け取った側で作り直す。
  assert.deepEqual(Object.keys(wire[0].character).sort(), [
    "features",
    "version",
  ]);
  const restored = normalizeTeam(wire);
  assert.equal(restored[0].character.special, "gandora-x");
  assert.equal(restored[0].character.moves[3].id, "destroy-giga-raze");
  assert.equal(restored[0].name, NAME);
});

test("special card: 確定後攻 — 素早さで勝っていても通常技の後に行動する", () => {
  const fast = card(NAME, { speed: 250 });
  const slow = card("おそいカード", { speed: 1 });
  const state = createBattle(
    [
      [fast, card("a"), card("b")],
      [slow, card("c"), card("d")],
    ],
    12345,
  );
  assert.ok(speed(activeFighter(state, 0)) > speed(activeFighter(state, 1)));
  const next = resolveTurn(state, [move(3), move(0)]);
  const order = next.log.filter((e) => e.kind === "move").map((e) => e.side);
  assert.deepEqual(order, [1, 0]);
});

test("special card: 自分の控えと相手の場を破壊し、攻撃と特攻の合計を吸収する", () => {
  const mine = [
    card(NAME, { hp: 400, attack: 10, specialAttack: 20 }),
    card("控え1", { hp: 300, attack: 111, specialAttack: 222 }),
    card("控え2", { hp: 300, attack: 50, specialAttack: 60 }),
  ];
  const foes = [
    card("相手先発", { hp: 350, attack: 200, specialAttack: 150 }),
    card("相手控え1", { hp: 300 }),
    card("相手控え2", { hp: 300 }),
  ];
  const state = createBattle([mine, foes], 7);
  const base = structuredClone(state);
  const attacker = activeFighter(state, 0);
  const damageBefore = estimateDamage(
    attacker,
    activeFighter(state, 1),
    attacker.card.character.moves[0],
  );

  const next = resolveTurn(state, [move(3), move(0)]);
  // 破壊はHPを0にする。ダメージではないので、残りHPに関係なく場から消える。
  assert.equal(next.teams[0][1].hp, 0);
  assert.equal(next.teams[0][2].hp, 0);
  assert.equal(next.teams[1][0].hp, 0);
  assert.equal(next.teams[1][1].hp, 300);
  assert.equal(next.teams[0][0].hp > 0, true);

  const gained =
    111 + 222 + (50 + 60) + (200 + 150); /* = 793 */
  const boosted = activeFighter(next, 0);
  assert.equal(boosted.attackBonus, gained);
  assert.equal(boosted.specialAttackBonus, gained);
  // 吸収した分は攻撃にも反映される（技そのものは威力を持たない）。
  const damageAfter = estimateDamage(
    boosted,
    activeFighter(next, 1),
    boosted.card.character.moves[0],
  );
  assert.ok(damageAfter > damageBefore);

  // 技は1回きり。使った後は選べない。
  assert.equal(boosted.pp[3], 0);
  assert.ok(!availableActions(next, 0).some((a) => a.type === "move" && a.index === 3));
  // 相手は場のカードを失ったので補充になる。
  assert.equal(next.phase, "replace");
  assert.deepEqual(
    availableActions(next, 1).filter((a) => a.type === "switch").map((a) => a.index),
    [1, 2],
  );
  // 元の状態は変更しない。
  assert.equal(activeFighter(base, 1).hp, 350);
  assert.equal(activeFighter(base, 0).attackBonus, 0);
});

test("special card: 相手に控えが残っていなければ破壊で決着する", () => {
  const state = createBattle(
    [
      [card(NAME), card("a"), card("b")],
      [card("最後の一枚"), card("c"), card("d")],
    ],
    99,
  );
  state.teams[1][1].hp = 0;
  state.teams[1][2].hp = 0;
  const next = resolveTurn(state, [move(3), move(0)]);
  assert.equal(next.phase, "finished");
  assert.equal(next.reason, "knockout");
  assert.equal(next.winner, 0);
});

test("special card: 技の表示に 特殊・後攻・破壊 が出る", () => {
  const special = characterForCard(NAME, FEATURES).moves[3];
  assert.deepEqual(moveTags(special), ["特殊", "後攻", "破壊"]);
  assert.match(moveSummary(special), /通常技より後に行動/);
  assert.match(moveSummary(special), /破壊/);
  assert.match(special.text, /確定後攻/);
});
