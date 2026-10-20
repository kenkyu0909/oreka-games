import { assignMoves, movesForCharacter } from "../game.js";

export const BATTLE_VERSION = "battle-v4";
export const MAX_TURNS = 60;
export const STATUS_LABELS = {
  burn: "やけど",
  poison: "毒",
  slow: "鈍足",
  seal: "回復封印",
};
// Row = attacking element. Unlisted matchups are neutral.
export const MATCHUPS = {
  earth: { water: 1.5, wind: 0.67 },
  water: { fire: 1.5, earth: 0.67 },
  fire: { wind: 1.5, water: 0.67 },
  wind: { earth: 1.5, fire: 0.67 },
  light: { dark: 1.5, light: 0.67 },
  dark: { light: 1.5, dark: 0.67 },
};
export const SECONDARY = {
  fire: "burn",
  earth: "poison",
  dark: "poison",
  water: "slow",
  wind: "slow",
  light: "seal",
};
export const STRUGGLE = {
  id: "struggle",
  name: "最後の一撃",
  category: "物理",
  attribute: null,
  power: 45,
  accuracy: 100,
  pp: Infinity,
};
const copy = (value) => structuredClone(value);
export const effectiveness = (attack, defense) =>
  MATCHUPS[attack]?.[defense] ?? 1;
export const activeFighter = (state, side) =>
  state.teams[side][state.active[side]];
export const living = (state, side) =>
  state.teams[side].map((f, i) => (f.hp > 0 ? i : -1)).filter((i) => i >= 0);
export const speed = (fighter) =>
  fighter.card.character.stats.speed *
  stageMultiplier(fighter.speedStage ?? 0) *
  (fighter.status === "slow" ? 0.5 : 1);
export const stageMultiplier = (stage = 0) =>
  stage >= 0 ? (2 + Math.min(6, stage)) / 2 : 2 / (2 - Math.max(-6, stage));
export function nextRandom(state) {
  let x = state.seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.seed = x >>> 0;
  return state.seed / 4294967296;
}
function record(state, text, event = {}) {
  state.log.push({ turn: state.turn, text, ...event });
}

export function createLegacyBattle(teams, seed = 1) {
  if (
    !Array.isArray(teams) ||
    teams.length !== 2 ||
    teams.some((team) => !Array.isArray(team) || team.length !== 3)
  )
    throw new Error("双方3体のチームが必要です。");
  const state = {
    version: "battle-v1",
    seed: seed >>> 0 || 1,
    sequence: 0,
    turn: 1,
    phase: "select",
    active: [0, 0],
    winner: null,
    reason: null,
    log: [],
    teams: teams.map((team) =>
      team.map((card) => {
        const clean = copy(card);
        // Move data is derived from stats; callers cannot inject executable effects.
        clean.character.moves = assignMoves(
          clean.character.attribute,
          clean.character.stats,
          clean.character.level,
        );
        return {
          card: clean,
          hp: clean.character.stats.hp,
          pp: clean.character.moves.map((m) => m.pp),
          attackStage: 0,
          specialAttackStage: 0,
          speedStage: 0,
          defenseStage: 0,
          specialDefenseStage: 0,
          // 破壊したカードの能力を吸収した分。段階と違い、交代しても消えない。
          attackBonus: 0,
          specialAttackBonus: 0,
          status: null,
          statusTurns: 0,
        };
      }),
    ),
  };
  record(state, "バトル開始！ 両者の先頭のカードが登場。");
  return state;
}

export function availableActions(state, side) {
  if (
    state.phase === "finished" ||
    (state.version === "battle-v2" && state.actor !== side)
  )
    return [];
  const fighter = activeFighter(state, side);
  const switches = living(state, side)
    .filter((i) => i !== state.active[side])
    .map((index) => ({ type: "switch", index }));
  if (state.phase === "replace")
    return fighter.hp === 0 ? switches : [{ type: "wait" }];
  const moves = fighter.pp
    .map((pp, index) => (pp > 0 ? { type: "move", index } : null))
    .filter(Boolean);
  return [...(moves.length ? moves : [{ type: "struggle" }]), ...switches];
}
export function validateAction(state, side, action) {
  if (side !== 0 && side !== 1) return false;
  return (
    !!action &&
    availableActions(state, side).some(
      (a) => a.type === action.type && a.index === action.index,
    )
  );
}

export function conditionMultiplier(move, attacker, defender) {
  const a = attacker.card.character.level,
    d = defender.card.character.level;
  if (move.condition === "lower-level" && a < d) return 1.5;
  if (move.condition === "higher-level" && a > d) return 1.5;
  if (move.condition === "same-level" && a === d) return 2;
  if (move.condition === "target-status" && defender.status) return 1.7;
  if (
    move.condition === "low-hp" &&
    attacker.hp / attacker.card.character.stats.hp <= 0.35
  )
    return 1.7;
  return 1;
}
export function estimateDamage(
  attacker,
  defender,
  move,
  critical = false,
  roll = 0.925,
) {
  if (!move.power) return 0;
  const a = attacker.card.character,
    d = defender.card.character;
  const physical = move.category === "物理";
  const attackStage =
    (physical ? attacker.attackStage : attacker.specialAttackStage) ?? 0;
  const offense =
    ((physical ? a.stats.attack : a.stats.specialAttack) +
      ((physical ? attacker.attackBonus : attacker.specialAttackBonus) ?? 0)) *
    stageMultiplier(critical ? Math.max(0, attackStage) : attackStage);
  const defense = physical ? d.stats.defense : d.stats.specialDefense;
  const stage =
    (physical ? defender.defenseStage : defender.specialDefenseStage) ?? 0;
  const piercing = Math.min(0.35, a.stats.piercing * 0.0035);
  const effectiveDefense = Math.max(
    1,
    defense *
      stageMultiplier(critical ? Math.min(0, stage) : stage) *
      (1 - piercing) *
      (1 - (move.ignoreDefense || 0)),
  );
  const stab = move.attribute && move.attribute === a.attribute ? 1.15 : 1;
  const burn = physical && attacker.status === "burn" ? 0.75 : 1;
  // No level multiplier: level affects only the named conditional moves.
  return Math.max(
    1,
    Math.floor(
      ((move.power * 0.45 * offense) / effectiveDefense + 4) *
        stab *
        effectiveness(move.attribute, d.attribute) *
        conditionMultiplier(move, attacker, defender) *
        burn *
        (critical ? 1.5 : 1) *
        roll,
    ),
  );
}
export function recoveryAmount(fighter) {
  return Math.max(
    1,
    Math.floor(
      fighter.card.character.stats.hp *
        (0.18 + fighter.card.character.stats.recovery * 0.0025),
    ),
  );
}
function switchFighter(state, side, index, forced = false) {
  const previous = activeFighter(state, side);
  previous.defenseStage = previous.specialDefenseStage = 0;
  previous.attackStage = previous.specialAttackStage = previous.speedStage = 0;
  state.active[side] = index;
  record(
    state,
    `${side === 0 ? "P1" : "P2"}：${activeFighter(state, side).card.name} が登場${forced ? "（戦闘不能による交代）" : "（交代）"}。`,
    { kind: "switch", side, index },
  );
}
function damage(state, fighter, amount, extra = {}) {
  const actual = Math.min(fighter.hp, amount);
  const side = state.teams[0].includes(fighter) ? 0 : 1;
  fighter.hp -= actual;
  record(
    state,
    `P${side + 1}：${fighter.card.name} に ${actual} ダメージ。${extra.hit ? `（${extra.hit}/${extra.totalHits}連撃）` : ""}`,
    {
      kind: "damage",
      side,
      index: state.teams[side].indexOf(fighter),
      amount: actual,
      hp: fighter.hp,
      ...extra,
    },
  );
  if (fighter.hp === 0)
    record(state, `${fighter.card.name} は戦闘不能！`, {
      kind: "knockout",
      side,
    });
}
function useMove(state, side, action) {
  const attacker = activeFighter(state, side),
    defender = activeFighter(state, 1 - side);
  if (attacker.hp <= 0 || defender.hp <= 0) return;
  const move =
    action.type === "struggle"
      ? STRUGGLE
      : attacker.card.character.moves[action.index];
  if (action.type !== "struggle") attacker.pp[action.index]--;
  record(state, `P${side + 1}：${attacker.card.name} の ${move.name}！`, {
    kind: "move",
    side,
    moveIndex: action.index ?? null,
    attribute: move.attribute,
    category: move.category,
    ...(move.rarity ? { rarity: move.rarity } : {}),
    ...(move.special ? { special: true } : {}),
    name: move.name,
    targetSide:
      move.target === "self" || move.category === "回復" || move.id === "ward"
        ? side
        : 1 - side,
  });
  if (move.rules === 2) {
    useModernMove(state, side, move);
    return;
  }
  if (move.id === "restore") {
    if (attacker.status === "seal") {
      record(state, "回復封印で回復できない。");
      return;
    }
    const amount = Math.min(
      attacker.card.character.stats.hp - attacker.hp,
      recoveryAmount(attacker),
    );
    attacker.hp += amount;
    record(state, `${attacker.card.name} のHPが ${amount} 回復。`, {
      kind: "heal",
      side,
      index: state.active[side],
      amount,
      hp: attacker.hp,
    });
    return;
  }
  if (move.id === "ward") {
    if (attacker.defenseStage === 6 && attacker.specialDefenseStage === 6) {
      record(state, "防御はすでに最大。");
      return;
    }
    attacker.defenseStage = Math.min(6, attacker.defenseStage + 1);
    attacker.specialDefenseStage = Math.min(
      6,
      attacker.specialDefenseStage + 1,
    );
    record(state, "物理防御・特殊防御が1段階上がった。交代すると元に戻る。");
    return;
  }
  if (nextRandom(state) * 100 >= move.accuracy) {
    record(state, "攻撃は外れた！", { kind: "miss", side: 1 - side });
    return;
  }
  const critical =
    nextRandom(state) < 0.04 + attacker.card.character.stats.critical * 0.0016;
  const factor = effectiveness(
    move.attribute,
    defender.card.character.attribute,
  );
  if (critical) record(state, "急所に当たった！", { kind: "critical", side });
  if (factor > 1) record(state, "相性抜群！");
  if (factor < 1) record(state, "相性はいまひとつ…。");
  if (conditionMultiplier(move, attacker, defender) > 1)
    record(state, "レベル条件成立！ 技の威力が上がった。");
  damage(
    state,
    defender,
    estimateDamage(
      attacker,
      defender,
      move,
      critical,
      0.85 + nextRandom(state) * 0.15,
    ),
  );
  if (move.id.endsWith("-wave") && defender.hp > 0 && !defender.status) {
    const chance =
      0.25 * (1 - defender.card.character.stats.resistance * 0.006);
    if (nextRandom(state) < chance) {
      defender.status = SECONDARY[move.attribute];
      // Includes the current turn's end; exactly 3 end-of-turn ticks.
      defender.statusTurns = 3;
      record(
        state,
        `${defender.card.name} は ${STATUS_LABELS[defender.status]} になった（3ターン）。`,
      );
    }
  }
  if (move.id === "struggle") {
    record(state, "最後の一撃の反動！");
    damage(
      state,
      attacker,
      Math.max(1, Math.floor(attacker.card.character.stats.hp / 8)),
    );
  }
}
export function estimateMoveDamage(
  attacker,
  defender,
  move,
  critical = false,
  roll = 0.925,
) {
  return (
    estimateDamage(attacker, defender, move, critical, roll) * (move.hits || 1)
  );
}
const STAGE_LABELS = {
  attackStage: "物理攻撃",
  specialAttackStage: "特殊攻撃",
  defenseStage: "物理防御",
  specialDefenseStage: "特殊防御",
  speedStage: "素早さ",
};
function healFighter(state, side, amount) {
  const fighter = activeFighter(state, side);
  if (fighter.status === "seal") {
    record(state, "回復封印で回復できない。");
    return;
  }
  const actual = Math.min(
    fighter.card.character.stats.hp - fighter.hp,
    Math.max(0, Math.floor(amount)),
  );
  if (!actual) {
    record(state, `${fighter.card.name} のHPは満タン。`);
    return;
  }
  fighter.hp += actual;
  record(state, `${fighter.card.name} のHPが ${actual} 回復。`, {
    kind: "heal",
    side,
    index: state.active[side],
    amount: actual,
    hp: fighter.hp,
  });
}
// 破壊は「ダメージ」ではない。HPに関係なく場から消し、元の能力を攻撃力として
// 使い手に移す。破壊された側は控えがいれば補充、いなければ敗北になる。
function destroyField(state, side, move) {
  const targets = [];
  if (move.destroy.ownBench) {
    state.teams[side].forEach((fighter, index) => {
      if (index !== state.active[side] && fighter.hp > 0)
        targets.push({ side, index, fighter });
    });
  }
  if (move.destroy.enemyField) {
    const other = 1 - side,
      index = state.active[other],
      fighter = activeFighter(state, other);
    if (fighter.hp > 0) targets.push({ side: other, index, fighter });
  }
  let attack = 0,
    specialAttack = 0;
  for (const target of targets) {
    const stats = target.fighter.card.character.stats;
    attack += stats.attack;
    specialAttack += stats.specialAttack;
    target.fighter.hp = 0;
    target.fighter.status = null;
    target.fighter.statusTurns = 0;
    record(state, `P${target.side + 1}：${target.fighter.card.name} を破壊！`, {
      kind: "destroy",
      side: target.side,
      index: target.index,
      hp: 0,
    });
  }
  const attacker = activeFighter(state, side);
  const total = attack + specialAttack;
  if (!total) return;
  attacker.attackBonus = (attacker.attackBonus || 0) + total;
  attacker.specialAttackBonus = (attacker.specialAttackBonus || 0) + total;
  record(
    state,
    `${attacker.card.name} の攻撃と特攻が ${total} 上がった！（破壊した ${targets.length} 枚の力を吸収）`,
    {
      kind: "buff",
      side,
      index: state.active[side],
      value: total,
      absorb: targets.length,
    },
  );
}
function changeStages(state, side, changes) {
  const fighter = activeFighter(state, side);
  for (const [field, delta] of Object.entries(changes)) {
    const before = fighter[field] || 0;
    fighter[field] = Math.max(-6, Math.min(6, before + delta));
    const change = fighter[field] - before;
    record(
      state,
      change
        ? `${fighter.card.name} の${STAGE_LABELS[field]}が ${Math.abs(change)}段階${change > 0 ? "上がった" : "下がった"}！`
        : `${fighter.card.name} の${STAGE_LABELS[field]}はこれ以上変化しない。`,
      {
        kind: delta > 0 ? "buff" : "debuff",
        side,
        index: state.active[side],
        field,
        value: fighter[field],
      },
    );
  }
}
function useModernMove(state, side, move) {
  const attacker = activeFighter(state, side),
    defender = activeFighter(state, 1 - side);
  if (nextRandom(state) * 100 >= move.accuracy) {
    record(state, "技は外れた！", { kind: "miss", side: 1 - side });
    return;
  }
  if (move.destroy) {
    destroyField(state, side, move);
    return;
  }
  let dealt = 0;
  if (move.power) {
    const factor = effectiveness(
      move.attribute,
      defender.card.character.attribute,
    );
    if (factor > 1) record(state, "相性抜群！");
    if (factor < 1) record(state, "相性はいまひとつ…。");
    if (conditionMultiplier(move, attacker, defender) > 1)
      record(state, "技の条件成立！ 威力が上がった。");
    const hits = move.hits || 1;
    for (let hit = 1; hit <= hits && defender.hp > 0; hit++) {
      const critical =
        nextRandom(state) <
        Math.min(
          0.6,
          0.04 +
            attacker.card.character.stats.critical * 0.0016 +
            (move.critBonus || 0),
        );
      if (critical)
        record(state, "急所に当たった！", { kind: "critical", side });
      const amount = estimateDamage(
        attacker,
        defender,
        move,
        critical,
        0.85 + nextRandom(state) * 0.15,
      );
      dealt += Math.min(defender.hp, amount);
      damage(state, defender, amount, hits > 1 ? { hit, totalHits: hits } : {});
    }
  }
  if (move.cleanse) {
    if (attacker.status) {
      record(
        state,
        `${attacker.card.name} の${STATUS_LABELS[attacker.status]}を浄化！`,
        { kind: "cleanse", side, index: state.active[side] },
      );
      attacker.status = null;
      attacker.statusTurns = 0;
    } else record(state, "浄化する状態異常はない。");
  }
  if (move.healScale)
    healFighter(state, side, recoveryAmount(attacker) * move.healScale);
  if (move.drain && dealt)
    healFighter(
      state,
      side,
      dealt *
        move.drain *
        (0.75 + attacker.card.character.stats.recovery * 0.005),
    );
  if (move.stages && (move.target === "self" || defender.hp > 0))
    changeStages(state, move.target === "self" ? side : 1 - side, move.stages);
  if (move.status && defender.hp > 0) {
    if (defender.status)
      record(state, `${defender.card.name} はすでに状態異常になっている。`);
    else if (
      nextRandom(state) <
      move.statusChance * (1 - defender.card.character.stats.resistance * 0.006)
    ) {
      defender.status = move.status;
      defender.statusTurns = 3;
      record(
        state,
        `${defender.card.name} は${STATUS_LABELS[move.status]}になった（3ターン）。`,
        {
          kind: "status",
          side: 1 - side,
          index: state.active[1 - side],
          status: move.status,
          statusTurns: 3,
        },
      );
    } else record(state, `${defender.card.name} は状態異常をこらえた！`);
  }
  if (move.recoil && dealt) {
    record(state, `${move.name} の反動！`);
    damage(state, attacker, Math.max(1, Math.ceil(dealt * move.recoil)));
  }
}
function endStatuses(state) {
  for (let side = 0; side < 2; side++) {
    const fighter = activeFighter(state, side);
    if (fighter.hp <= 0 || !fighter.status) continue;
    if (fighter.status === "burn" || fighter.status === "poison") {
      record(
        state,
        `${fighter.card.name} は ${STATUS_LABELS[fighter.status]} のダメージ。`,
        { cause: "status" },
      );
      damage(
        state,
        fighter,
        Math.max(
          1,
          Math.floor(
            fighter.card.character.stats.hp /
              (fighter.status === "poison" ? 10 : 16),
          ),
        ),
        { cause: "status" },
      );
    }
    if (--fighter.statusTurns <= 0) {
      record(
        state,
        `${fighter.card.name} の ${STATUS_LABELS[fighter.status]} が治った。`,
        { kind: "cleanse", side, index: state.active[side], cause: "status" },
      );
      fighter.status = null;
    }
  }
}
function finishIfNeeded(state) {
  const counts = [living(state, 0).length, living(state, 1).length];
  if (!counts[0] || !counts[1]) {
    state.phase = "finished";
    state.reason = "knockout";
    state.winner = !counts[0] && !counts[1] ? "draw" : counts[0] ? 0 : 1;
    record(
      state,
      state.winner === "draw"
        ? "両チーム全滅。引き分け！"
        : `${state.winner === 0 ? "P1" : "P2"}の勝利！`,
    );
    return true;
  }
  return false;
}
export function finishBattle(input, winner, reason = "surrender") {
  if (input.phase === "finished") return input;
  const state = copy(input);
  state.phase = "finished";
  state.winner = winner;
  state.reason = reason;
  state.sequence++;
  const reasons = {
    surrender: "降参",
    disconnect: "切断",
    timeout: "時間切れ",
    left: "退室",
  };
  record(
    state,
    `${reasons[reason] || reason}により終了。${winner === "draw" ? "引き分け。" : `${winner === 0 ? "P1" : "P2"}の勝利。`}`,
  );
  return state;
}
// Both choices are committed before resolution; presentation replays these events one at a time.
export function resolveTurn(input, actions) {
  if (!["battle-v1", "battle-v3", BATTLE_VERSION].includes(input.version))
    throw new Error("両者の行動を確定してください。");
  if (
    !Array.isArray(actions) ||
    actions.length !== 2 ||
    !actions.every((action, side) => validateAction(input, side, action))
  )
    throw new Error("選べない行動です。");
  const state = copy(input);
  state.sequence++;
  if (state.phase === "replace") {
    actions.forEach((action, side) => {
      if (action.type === "switch")
        switchFighter(state, side, action.index, true);
    });
    state.phase = "select";
    return state;
  }
  record(state, `── ターン ${state.turn} ──`);
  // Switching always precedes attacks. Remaining order is snapshot at turn start.
  const priorities = actions.map((a, side) =>
    a.type === "switch"
      ? 100000
      : (a.type === "move"
          ? activeFighter(state, side).card.character.moves[a.index].priority ||
            0
          : 0) *
          10000 +
        speed(activeFighter(state, side)),
  );
  const first =
    priorities[0] === priorities[1]
      ? nextRandom(state) < 0.5
        ? 0
        : 1
      : priorities[0] > priorities[1]
        ? 0
        : 1;
  for (const side of [first, 1 - first]) {
    const action = actions[side];
    if (action.type === "switch") switchFighter(state, side, action.index);
    else useMove(state, side, action);
  }
  endStatuses(state);
  if (finishIfNeeded(state)) return state;
  if (state.turn >= MAX_TURNS) {
    const score = [0, 1].map(
      (side) =>
        living(state, side).length * 10 +
        state.teams[side].reduce(
          (sum, f) => sum + f.hp / f.card.character.stats.hp,
          0,
        ),
    );
    state.phase = "finished";
    state.reason = "turn-limit";
    state.winner =
      Math.abs(score[0] - score[1]) < 1e-9
        ? "draw"
        : score[0] > score[1]
          ? 0
          : 1;
    record(state, "60ターン経過。生存数、次に残りHP割合の合計で判定。");
    return state;
  }
  state.turn++;
  state.phase = [0, 1].some((side) => activeFighter(state, side).hp === 0)
    ? "replace"
    : "select";
  return state;
}

export function publicState(state) {
  const { seed, ...view } = copy(state);
  return view;
}
export function matchupLabel(move, target) {
  if (!move.power) return move.category;
  const value = effectiveness(move.attribute, target.card.character.attribute);
  return value > 1 ? "相性抜群 ×1.5" : value < 1 ? "いまひとつ ×0.67" : "等倍";
}

// battle-v2: one authoritative action per request, never two simultaneous choices.
export function createSequentialBattle(teams, seed = 1) {
  const state = createLegacyBattle(teams, seed);
  state.version = "battle-v2";
  state.actor = null;
  state.remaining = [];
  state.roundPending = true;
  state.actionNumber = 0;
  settleAction(state);
  return state;
}
function beginRound(state) {
  const a = speed(activeFighter(state, 0)),
    b = speed(activeFighter(state, 1));
  const first = a === b ? (nextRandom(state) < 0.5 ? 0 : 1) : a > b ? 0 : 1;
  state.remaining = [first, 1 - first];
  state.roundPending = false;
  record(state, `── ラウンド ${state.turn} / P${first + 1} が先手 ──`);
}
function settleAction(state) {
  if (finishIfNeeded(state)) {
    state.actor = null;
    return;
  }
  state.remaining = state.remaining.filter(
    (side) => activeFighter(state, side).hp > 0,
  );
  if (!state.remaining.length && !state.roundPending) {
    endStatuses(state);
    if (finishIfNeeded(state)) {
      state.actor = null;
      return;
    }
    if (state.turn >= MAX_TURNS) {
      const score = [0, 1].map(
        (side) =>
          living(state, side).length * 10 +
          state.teams[side].reduce(
            (sum, f) => sum + f.hp / f.card.character.stats.hp,
            0,
          ),
      );
      state.phase = "finished";
      state.actor = null;
      state.reason = "turn-limit";
      state.winner =
        Math.abs(score[0] - score[1]) < 1e-9
          ? "draw"
          : score[0] > score[1]
            ? 0
            : 1;
      record(state, "60ラウンド経過。生存数、次に残りHP割合で判定。");
      return;
    }
    state.turn++;
    state.roundPending = true;
  }
  const replacement = [0, 1].find(
    (side) => activeFighter(state, side).hp === 0,
  );
  if (replacement !== undefined) {
    state.phase = "replace";
    state.actor = replacement;
    return;
  }
  if (state.roundPending) beginRound(state);
  state.phase = "select";
  state.actor = state.remaining[0];
}
export function resolveAction(input, side, action) {
  if (input.version !== "battle-v2" || !validateAction(input, side, action))
    throw new Error("今はあなたの手番ではないか、選べない行動です。");
  const state = copy(input);
  state.sequence++;
  if (state.phase === "replace") switchFighter(state, side, action.index, true);
  else {
    state.actionNumber++;
    state.remaining.shift();
    if (action.type === "switch") switchFighter(state, side, action.index);
    else useMove(state, side, action);
  }
  settleAction(state);
  return state;
}

// Current rules: simultaneous commitments, speed-ordered sequential attacks.
export function createBattle(teams, seed = 1) {
  const state = createLegacyBattle(teams, seed);
  state.version = BATTLE_VERSION;
  for (const team of state.teams)
    for (const fighter of team) {
      fighter.card.character.moves = movesForCharacter(fighter.card.character);
      fighter.pp = fighter.card.character.moves.map((move) => move.pp);
    }
  return state;
}
