import test from "node:test";
import assert from "node:assert/strict";
import { MOVE_LIBRARY, moveTags } from "../src/moves.js";
import { generateCharacter } from "../src/game.js";
import { makeCpuTeam, seededRandom } from "../src/battle/presets.js";
import { normalizeTeam, wireTeam } from "../src/battle/protocol.js";
import {
  createBattle,
  resolveTurn,
  activeFighter,
  estimateDamage,
  estimateMoveDamage,
  conditionMultiplier,
  recoveryAmount,
  speed,
  stageMultiplier,
  publicState,
  validateAction,
} from "../src/battle/engine.js";
import { chooseCpuAction } from "../src/battle/cpu.js";

const action = (index = 0) => ({ type: "move", index });
const canonical = (id) => {
  const m = structuredClone(MOVE_LIBRARY.find((m) => m.id === id));
  assert.ok(m, id);
  if (m.category === "適性") m.category = "物理";
  return m;
};
function equip(state, side, ids) {
  const f = activeFighter(state, side);
  f.card.character.moves = [
    ...ids,
    ...["quicken", "ward", "restore", "purify"].filter(
      (id) => !ids.includes(id),
    ),
  ]
    .slice(0, 4)
    .map(canonical);
  f.pp = f.card.character.moves.map((m) => m.pp);
  return f;
}
function battle(id, seed = 12345) {
  const state = createBattle([makeCpuTeam(1), makeCpuTeam(2)], seed);
  for (const [side, team] of state.teams.entries())
    for (const f of team) {
      Object.assign(f.card.character.stats, {
        hp: 400,
        attack: 100,
        specialAttack: 100,
        defense: 100,
        specialDefense: 100,
        speed: side === 0 ? 200 : 50,
        critical: 1,
        resistance: 1,
        recovery: 40,
        piercing: 1,
      });
      f.card.character.attribute = "fire";
      f.card.character.level = 6;
      f.hp = 400;
    }
  equip(state, 0, [id]);
  equip(state, 1, ["quicken"]);
  return state;
}
const play = (s) => resolveTurn(s, [action(), action()]);
const damageEvents = (s, side = 1) =>
  s.log.filter((e) => e.kind === "damage" && e.side === side);

test("photo-v2 library has 48 unique, immutable, mechanically described moves", () => {
  assert.equal(MOVE_LIBRARY.length, 48);
  assert.equal(new Set(MOVE_LIBRARY.map((m) => m.id)).size, 48);
  for (const m of MOVE_LIBRARY) {
    assert.ok(Object.isFrozen(m));
    assert.ok(m.text);
    assert.ok(moveTags(m).length);
    assert.ok(m.pp > 0 && m.pp <= 20 && Number.isInteger(m.pp));
    assert.ok(m.accuracy > 0 && m.accuracy <= 100);
    if (m.stages) assert.ok(Object.isFrozen(m.stages));
  }
  for (const tag of [
    "先制",
    "2連撃",
    "3連撃",
    "吸収",
    "反動",
    "強化",
    "弱体",
    "浄化",
    "毒",
    "回復封印",
    "貫通",
    "条件",
    "急所",
  ])
    assert.ok(
      MOVE_LIBRARY.some((m) => moveTags(m).includes(tag)),
      tag,
    );
});
test("photo-v2 preserves all ten stats/attribute/level of v1, but deterministically diversifies four skills", () => {
  const random = seededRandom(56432),
    reached = new Set(),
    sets = new Set();
  const base = makeCpuTeam(12345)[0].character.features;
  for (let i = 0; i < 1500; i++) {
    const features = Object.fromEntries(
      Object.keys(base).map((k) => [k, Math.floor(random() * 1001)]),
    );
    const old = generateCharacter(features, "photo-v1"),
      c = generateCharacter(features, "photo-v2");
    assert.deepEqual(c.stats, old.stats);
    assert.equal(c.level, old.level);
    assert.equal(c.attribute, old.attribute);
    assert.equal(c.version, "photo-v2");
    assert.deepEqual(
      c,
      generateCharacter(
        Object.fromEntries(Object.entries(features).reverse()),
        "photo-v2",
      ),
    );
    assert.equal(new Set(c.moves.map((m) => m.id)).size, 4);
    assert.ok(c.moves.filter((m) => m.power).length >= 2);
    assert.equal(c.moves[0].attribute, c.attribute);
    assert.equal(c.moves[0].accuracy, 100);
    for (const [a, b] of [
      ["furnace", "battle-focus"],
      ["tailwind", "quicken"],
    ]) {
      assert.ok(
        !(c.moves.some((m) => m.id === a) && c.moves.some((m) => m.id === b)),
        "identical buffs cannot take two slots",
      );
    }
    c.moves.forEach((m) => reached.add(m.id));
    sets.add(c.moves.map((m) => m.id).join(","));
  }
  assert.equal(reached.size, 48);
  assert.ok(sets.size > 1400);
  const sameAttribute = new Set();
  for (let i = 0; i < 150; i++) {
    const c = generateCharacter({ ...base, detail: i * 6 }, "photo-v2");
    assert.equal(c.attribute, "fire");
    sameAttribute.add(c.moves.map((m) => m.id).join(","));
  }
  assert.ok(sameAttribute.size > 140);
  assert.deepEqual(
    generateCharacter(base, "photo-v2").moves.map((m) => m.id),
    ["cinder-shot", "shadow-ambush", "furnace", "radiant-drain"],
  );
  const first = generateCharacter(base, "photo-v2");
  first.moves[0].power = 999;
  assert.notEqual(generateCharacter(base, "photo-v2").moves[0].power, 999);
  assert.throws(() => generateCharacter(base, "photo-v99"));
});
test("protocol canonically reconstructs both photo versions and ignores injected move effects", () => {
  for (const version of ["photo-v1", "photo-v2", "photo-v3"]) {
    const input = wireTeam(makeCpuTeam(1));
    input.forEach((c) => {
      c.image = "data:image/png;base64,AA==";
      c.fingerprint = "a".repeat(64);
      c.character = generateCharacter(c.character.features, version);
      c.character.moves = [{ id: "hack", power: 99999, priority: 99 }];
      c.character.stats.attack = 99999;
    });
    const clean = normalizeTeam(input);
    for (const c of clean)
      assert.deepEqual(
        c.character,
        generateCharacter(c.character.features, version),
      );
    const state = createBattle([clean, clean], 1);
    assert.equal(state.version, "battle-v4");
    assert.deepEqual(
      activeFighter(state, 0).card.character.moves,
      clean[0].character.moves,
    );
  }
});
test("fixed multi-hit attacks consume one PP and accuracy roll; stop immediately on KO", () => {
  for (const [id, hits] of [
    ["ember-fangs", 2],
    ["tidal-chain", 3],
  ]) {
    const state = battle(id),
      before = structuredClone(state),
      next = play(state);
    assert.deepEqual(state, before);
    const events = damageEvents(next);
    assert.equal(events.length, hits);
    assert.deepEqual(
      events.map((e) => e.hit),
      Array.from({ length: hits }, (_, i) => i + 1),
    );
    assert.ok(events.every((e) => e.totalHits === hits));
    assert.equal(next.teams[0][0].pp[0], state.teams[0][0].pp[0] - 1);
    assert.equal(
      estimateMoveDamage(state.teams[0][0], state.teams[1][0], canonical(id)),
      estimateDamage(state.teams[0][0], state.teams[1][0], canonical(id)) *
        hits,
    );
    state.teams[1][0].hp = 1;
    const ko = play(state);
    assert.equal(damageEvents(ko).length, 1);
    assert.equal(ko.teams[1][0].pp[0], state.teams[1][0].pp[0]);
  }
});
test("missed move spends PP but produces no damage, recoil, drain or secondary effects", () => {
  const s = battle("blaze-rush");
  s.teams[0][0].card.character.moves[0].accuracy = 0;
  const n = play(s);
  assert.equal(damageEvents(n, 0).length + damageEvents(n, 1).length, 0);
  assert.equal(n.teams[0][0].pp[0], 5);
  assert.ok(n.log.some((e) => e.kind === "miss"));
});
test("priority overrides speed, ties within priority use speed, and switching precedes priority", () => {
  const s = battle("gale-step");
  s.teams[0][0].card.character.stats.speed = 15;
  s.teams[1][0].card.character.stats.speed = 250;
  let n = play(s);
  assert.deepEqual(
    n.log.filter((e) => e.kind === "move").map((e) => e.side),
    [0, 1],
  );
  equip(s, 1, ["shadow-ambush"]);
  n = play(s);
  assert.deepEqual(
    n.log.filter((e) => e.kind === "move").map((e) => e.side),
    [1, 0],
  );
  n = resolveTurn(s, [action(), { type: "switch", index: 1 }]);
  assert.ok(
    n.log.findIndex((e) => e.kind === "switch") <
      n.log.findIndex((e) => e.kind === "move"),
  );
  assert.equal(damageEvents(n)[0].index, 1);
});
test("drain scales with recovery and actual HP removed, caps healing and is blocked by seal", () => {
  for (const recovery of [1, 100]) {
    const s = battle("aqua-siphon");
    s.teams[0][0].hp = 100;
    s.teams[0][0].card.character.stats.recovery = recovery;
    s.teams[1][0].hp = 20;
    const n = play(s),
      dealt = damageEvents(n).reduce((a, e) => a + e.amount, 0);
    assert.equal(
      n.teams[0][0].hp,
      100 + Math.floor(dealt * 0.45 * (0.75 + recovery * 0.005)),
    );
  }
  const s = battle("radiant-drain");
  s.teams[0][0].hp = 399;
  assert.equal(play(s).teams[0][0].hp, 400);
  s.teams[0][0].hp = 100;
  s.teams[0][0].status = "seal";
  s.teams[0][0].statusTurns = 3;
  assert.equal(play(s).teams[0][0].hp, 100);
});
test("recoil uses actual damage even on target KO and can produce a simultaneous draw", () => {
  const s = battle("reckless-charge");
  s.teams[0][0].hp = 1;
  s.teams[1][0].hp = 1;
  for (const team of s.teams) for (const f of team.slice(1)) f.hp = 0;
  const n = play(s);
  assert.equal(n.winner, "draw");
  assert.equal(n.phase, "finished");
  assert.equal(damageEvents(n, 0)[0].amount, 1);
  const full = battle("reckless-charge"),
    out = play(full);
  assert.equal(
    damageEvents(out, 0)[0].amount,
    Math.ceil(damageEvents(out)[0].amount * 0.3),
  );
});
test("overkill displays the full dealt damage while HP still stops at zero", () => {
  // 残りHP1の相手に満額が通る攻撃: 表示は満額（例: 60）、HP減少は1。
  const s = battle("aqua-siphon");
  s.teams[1][0].hp = 1;
  const n = play(s);
  const [hit] = damageEvents(n);
  assert.equal(hit.hp, 0);
  assert.equal(hit.amount, 1); // HP実減少は残りHPまで
  assert.ok(hit.raw > 1); // 与えることができるダメージ量は満額
  assert.ok(hit.text.includes(`に ${hit.raw} ダメージ。`));
  // 頭打ちにならない場合 raw と amount は同じ値になる
  const [clean] = damageEvents(play(battle("aqua-siphon")));
  assert.equal(clean.raw, clean.amount);
});
test("cleanse precedes recovery, removes seal and blocks poison tick; scaled recovery obeys cap", () => {
  const s = battle("cleansing-rain");
  s.teams[0][0].hp = 100;
  s.teams[0][0].status = "seal";
  s.teams[0][0].statusTurns = 3;
  const n = play(s);
  assert.equal(n.teams[0][0].status, null);
  assert.equal(
    n.teams[0][0].hp,
    100 + Math.floor(recoveryAmount(s.teams[0][0]) * 0.65),
  );
  assert.ok(
    n.log.findIndex((e) => e.kind === "cleanse") <
      n.log.findIndex((e) => e.kind === "heal"),
  );
  s.teams[0][0].status = "poison";
  assert.equal(damageEvents(play(s), 0).length, 0);
  s.teams[0][0].hp = 399;
  assert.equal(play(s).teams[0][0].hp, 400);
  equip(s, 0, ["restore"]);
  s.teams[0][0].status = "seal";
  s.teams[0][0].hp = 100;
  assert.equal(play(s).teams[0][0].hp, 100);
});
test("physical/special buffs and debuffs apply, cap at ±6, and reset on switching", () => {
  for (const [id, field, delta, side] of [
    ["furnace", "attackStage", 2, 0],
    ["meditate", "specialAttackStage", 2, 0],
    ["iron-shell", "defenseStage", 2, 0],
    ["deep-pressure", "specialAttackStage", -2, 1],
    ["dread-roar", "attackStage", -2, 1],
    ["ash-break", "defenseStage", -1, 1],
    ["sand-bind", "speedStage", -1, 1],
  ]) {
    const s = battle(id);
    equip(s, 1, ["purify"]);
    let n = play(s);
    assert.equal(n.teams[side][0][field], delta, id);
    s.teams[side][0][field] = delta > 0 ? 5 : -5;
    n = play(s);
    assert.equal(n.teams[side][0][field], delta > 0 ? 6 : -6, id);
    n = resolveTurn(
      n,
      side === 0
        ? [{ type: "switch", index: 1 }, action()]
        : [action(), { type: "switch", index: 1 }],
    );
    assert.equal(n.teams[side][0][field], 0, id);
  }
  const s = battle("aurora-mind"),
    n = play(s);
  assert.equal(n.teams[0][0].specialAttackStage, 1);
  assert.equal(n.teams[0][0].specialDefenseStage, 1);
  const c = battle("crystal-rest");
  c.teams[0][0].hp = 100;
  const out = play(c);
  assert.equal(out.teams[0][0].specialDefenseStage, 1);
  assert.equal(
    out.teams[0][0].hp,
    100 + Math.floor(recoveryAmount(c.teams[0][0]) * 0.75),
  );
});
test("offensive stages affect matching attack; critical ignores only detrimental attack/beneficial defense", () => {
  const s = battle("fire-strike"),
    a = s.teams[0][0],
    d = s.teams[1][0],
    m = canonical("fire-strike");
  const normal = estimateDamage(a, d, m);
  a.attackStage = 2;
  assert.ok(estimateDamage(a, d, m) > normal * 1.7);
  a.attackStage = -6;
  d.defenseStage = 6;
  const critical = estimateDamage(a, d, m, true);
  a.attackStage = 0;
  d.defenseStage = 0;
  assert.equal(estimateDamage(a, d, m, true), critical);
  a.attackStage = 2;
  d.defenseStage = -2;
  assert.ok(estimateDamage(a, d, m, true) > critical);
  assert.equal(stageMultiplier(-6), 0.25);
  assert.equal(stageMultiplier(6), 4);
});
test("speed changes affect only next turn; ordinary actions keep their original ordering", () => {
  const s = battle("tailwind");
  s.teams[0][0].card.character.stats.speed = 80;
  s.teams[1][0].card.character.stats.speed = 100;
  equip(s, 1, ["purify"]);
  const n = play(s);
  assert.deepEqual(
    n.log.filter((e) => e.kind === "move").map((e) => e.side),
    [1, 0],
  );
  assert.equal(speed(n.teams[0][0]), 160);
  const n2 = play(n);
  assert.deepEqual(
    n2.log
      .slice(n.log.length)
      .filter((e) => e.kind === "move")
      .map((e) => e.side),
    [0, 1],
  );
});
test("piercing and condition skills change damage only when their own conditions apply", () => {
  const s = battle("fault-pierce"),
    a = s.teams[0][0],
    d = s.teams[1][0],
    m = canonical("fault-pierce");
  assert.ok(
    estimateDamage(a, d, m) > estimateDamage(a, d, { ...m, ignoreDefense: 0 }),
  );
  const low = canonical("last-stand"),
    hex = canonical("hex-bite");
  assert.equal(conditionMultiplier(low, a, d), 1);
  a.hp = 140;
  assert.equal(conditionMultiplier(low, a, d), 1.7);
  a.hp = 141;
  assert.equal(conditionMultiplier(low, a, d), 1);
  assert.equal(conditionMultiplier(hex, a, d), 1);
  d.status = "poison";
  assert.equal(conditionMultiplier(hex, a, d), 1.7);
});
test("dedicated poison/seal and damaging burn/slow respect resistance; no overwrite or effect after KO", () => {
  for (const [id, status] of [
    ["venom-mist", "poison"],
    ["seal-sigil", "seal"],
    ["cinder-shot", "burn"],
    ["frost-current", "slow"],
  ]) {
    const counts = [0, 0];
    for (let seed = 1; seed <= 250; seed++)
      for (const [i, resistance] of [1, 100].entries()) {
        const s = battle(id, seed * 7919);
        s.teams[1][0].card.character.stats.resistance = resistance;
        const n = play(s);
        if (n.teams[1][0].status === status) {
          counts[i]++;
          assert.equal(n.teams[1][0].statusTurns, 2);
        }
      }
    assert.ok(counts[0] > counts[1] + 10, `${id}: ${counts}`);
    const s = battle(id);
    s.teams[1][0].status = "seal";
    s.teams[1][0].statusTurns = 3;
    assert.equal(play(s).teams[1][0].status, "seal");
    if (s.teams[0][0].card.character.moves[0].power) {
      s.teams[1][0].hp = 1;
      s.teams[1][0].status = null;
      assert.equal(play(s).teams[1][0].status, null);
    }
  }
});
test("high-critical skills materially increase critical hits without changing standard critical rule", () => {
  let normal = 0,
    boosted = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const s = battle("razor-gale", seed * 991);
    boosted += play(s).log.filter(
      (e) => e.kind === "critical" && e.side === 0,
    ).length;
    s.teams[0][0].card.character.moves[0].critBonus = 0;
    normal += play(s).log.filter(
      (e) => e.kind === "critical" && e.side === 0,
    ).length;
  }
  assert.ok(boosted > normal + 40);
});
test("CPU values cleanse under seal and priority for a slower guaranteed finishing hit", () => {
  const s = battle("purify");
  equip(s, 0, ["fire-strike", "purify", "ward", "quicken"]);
  s.teams[0][0].status = "seal";
  s.teams[0][0].statusTurns = 3;
  s.teams[0][0].hp = 50;
  assert.deepEqual(
    chooseCpuAction(publicState(s), 0, "normal", () => 0.5),
    action(1),
  );
  equip(s, 0, ["fire-strike", "shadow-ambush", "ward", "quicken"]);
  s.teams[0][0].status = null;
  s.teams[0][0].hp = 400;
  s.teams[0][0].card.character.stats.speed = 15;
  s.teams[1][0].card.character.stats.speed = 250;
  s.teams[1][0].hp = 1;
  assert.deepEqual(
    chooseCpuAction(publicState(s), 0, "normal", () => 0.5),
    action(1),
  );
});
test("90 modern CPU games complete legally, deterministically and with bounded HP/PP/stages", () => {
  for (const difficulty of ["easy", "normal", "hard"])
    for (let seed = 1; seed <= 30; seed++) {
      let state = createBattle(
          [makeCpuTeam(seed), makeCpuTeam(seed + 90)],
          seed,
        ),
        steps = 0;
      const random = seededRandom(seed);
      while (state.phase !== "finished" && steps++ < 125) {
        const view = publicState(state);
        assert.equal("seed" in view, false);
        const actions = [0, 1].map((side) =>
          chooseCpuAction(view, side, difficulty, random),
        );
        assert.ok(actions.every((a, i) => validateAction(state, i, a)));
        const next = resolveTurn(state, actions);
        assert.deepEqual(next, resolveTurn(state, actions));
        state = next;
        for (const team of state.teams)
          for (const f of team) {
            assert.ok(
              Number.isInteger(f.hp) &&
                f.hp >= 0 &&
                f.hp <= f.card.character.stats.hp,
            );
            assert.ok(
              f.pp.every(
                (pp, i) =>
                  Number.isInteger(pp) &&
                  pp >= 0 &&
                  pp <= f.card.character.moves[i].pp,
              ),
            );
            for (const key of [
              "attackStage",
              "specialAttackStage",
              "defenseStage",
              "specialDefenseStage",
              "speedStage",
            ])
              assert.ok(f[key] >= -6 && f[key] <= 6);
          }
      }
      assert.equal(state.phase, "finished");
      assert.ok(state.turn <= 60);
    }
});

test("presentation metadata distinguishes end-turn status damage from a healing move cleanse", () => {
  let state = battle("purify");
  activeFighter(state, 0).status = "poison";
  activeFighter(state, 0).statusTurns = 3;
  let next = resolveTurn(state, [action(), action()]);
  const cleanse = next.log.find((e) => e.kind === "cleanse");
  assert.ok(cleanse);
  assert.equal(
    cleanse.cause,
    undefined,
    "a move cleanse remains part of its actor action",
  );

  state = battle("wind-strike");
  activeFighter(state, 1).status = "burn";
  activeFighter(state, 1).statusTurns = 1;
  next = resolveTurn(state, [action(), action()]);
  const tick = next.log.filter((e) => e.cause === "status");
  assert.equal(tick.length, 3);
  assert.equal(tick[1].kind, "damage");
  assert.equal(
    tick[1].amount,
    25,
    "400 HP / 16; presentation does not alter damage",
  );
  assert.equal(tick[2].kind, "cleanse");
});
