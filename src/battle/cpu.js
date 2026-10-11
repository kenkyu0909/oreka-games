import {
  activeFighter,
  availableActions,
  estimateDamage,
  estimateMoveDamage,
  recoveryAmount,
  speed,
} from "./engine.js";

// Only current, public battle state is inspected. The player's selected action and
// engine seed are never arguments to the policy. Difficulty changes choices, not stats.
export function chooseCpuAction(
  state,
  side,
  difficulty = "normal",
  random = Math.random,
) {
  const actions = availableActions(state, side);
  if (!actions.length) return null;
  const mine = activeFighter(state, side),
    opponent = activeFighter(state, 1 - side);
  const bestDamage = (fighter, target) =>
    Math.max(
      1,
      ...fighter.card.character.moves.map((move, index) =>
        fighter.pp[index] > 0
          ? (estimateMoveDamage(fighter, target, move) * move.accuracy) / 100
          : 0,
      ),
    );
  const matchScore = (fighter) =>
    bestDamage(fighter, opponent) / opponent.card.character.stats.hp -
    bestDamage(opponent, fighter) / fighter.card.character.stats.hp;
  if (state.phase === "replace") {
    if (actions[0].type === "wait") return actions[0];
    if (difficulty === "easy")
      return actions[Math.floor(random() * actions.length)];
    return actions.reduce((best, action) =>
      matchScore(state.teams[side][action.index]) >
      matchScore(state.teams[side][best.index])
        ? action
        : best,
    );
  }
  const useful = actions.filter((action) => {
    if (action.type === "switch") return false;
    if (action.type === "struggle") return true;
    const move = mine.card.character.moves[action.index];
    if (move.rules === 2) {
      if (move.healScale)
        return (
          !!(move.cleanse && mine.status) ||
          (mine.status !== "seal" &&
            mine.hp < mine.card.character.stats.hp * 0.85)
        );
      if (!move.power && move.status && opponent.status) return false;
      if (!move.power && move.stages)
        return Object.entries(move.stages).some(([field, delta]) =>
          delta > 0 ? (mine[field] || 0) < 4 : (opponent[field] || 0) > -4,
        );
      return true;
    }
    if (move.id === "restore")
      return (
        mine.hp < mine.card.character.stats.hp * 0.8 && mine.status !== "seal"
      );
    if (move.id === "ward") return mine.defenseStage < 2;
    return true;
  });
  if (difficulty === "easy") {
    const pool = useful.length
      ? useful
      : actions.filter((a) => a.type !== "switch");
    return pool[Math.floor(random() * pool.length)];
  }
  if (difficulty === "hard" && mine.hp > mine.card.character.stats.hp * 0.25) {
    const alternatives = actions.filter(
      (a) =>
        a.type === "switch" &&
        state.teams[side][a.index].hp >
          state.teams[side][a.index].card.character.stats.hp * 0.4,
    );
    const candidate = alternatives.sort(
      (a, b) =>
        matchScore(state.teams[side][b.index]) -
        matchScore(state.teams[side][a.index]),
    )[0];
    const incoming = bestDamage(opponent, mine);
    if (
      candidate &&
      matchScore(mine) < -0.18 &&
      matchScore(state.teams[side][candidate.index]) >
        matchScore(mine) + 0.35 &&
      incoming < mine.hp
    )
      return candidate;
  }
  const score = (action) => {
    if (action.type === "switch") return -1;
    if (action.type === "struggle") return 10;
    const move = mine.card.character.moves[action.index];
    const incoming = bestDamage(opponent, mine);
    if (move.rules === 2) {
      const chance = Math.min(
        0.6,
        0.04 +
          mine.card.character.stats.critical * 0.0016 +
          (move.critBonus || 0),
      );
      const plain = estimateMoveDamage(mine, opponent, move),
        crit = estimateMoveDamage(mine, opponent, move, true);
      let value =
        (Math.min(opponent.hp, plain * (1 - chance) + crit * chance) *
          move.accuracy) /
        100;
      const missing = mine.card.character.stats.hp - mine.hp;
      if (
        (move.healScale && mine.status !== "seal") ||
        (move.healScale && move.cleanse)
      )
        value +=
          Math.min(missing, recoveryAmount(mine) * move.healScale) * 0.95;
      if (
        move.priority &&
        move.healScale &&
        missing > 0 &&
        (mine.status !== "seal" || move.cleanse) &&
        incoming >= mine.hp &&
        speed(mine) < speed(opponent)
      )
        value += 35;
      if (move.cleanse && mine.status)
        value +=
          mine.status === "seal" ? 20 : mine.card.character.stats.hp * 0.14;
      if (move.drain && mine.status !== "seal")
        value +=
          Math.min(
            missing,
            Math.min(opponent.hp, plain) *
              move.drain *
              (0.75 + mine.card.character.stats.recovery * 0.005),
          ) * 0.75;
      if (move.recoil) {
        const recoil = Math.ceil(Math.min(opponent.hp, plain) * move.recoil);
        value -= recoil * 0.6;
        if (recoil >= mine.hp) value -= 45;
      }
      if (move.status && !opponent.status) {
        const benefit =
          move.status === "poison"
            ? opponent.card.character.stats.hp * 0.19
            : move.status === "burn"
              ? opponent.card.character.stats.hp * 0.12
              : move.status === "slow"
                ? speed(opponent) > speed(mine)
                  ? 28
                  : 8
                : opponent.card.character.moves.some(
                      (m) => m.healScale || m.drain || m.id === "restore",
                    )
                  ? 24
                  : 4;
        value +=
          benefit *
          move.statusChance *
          (1 - opponent.card.character.stats.resistance * 0.006);
      }
      if (move.stages)
        for (const [field, delta] of Object.entries(move.stages)) {
          const target = move.target === "self" ? mine : opponent;
          const stage = target[field] || 0;
          if ((delta > 0 && stage >= 4) || (delta < 0 && stage <= -4)) continue;
          let benefit = incoming * 0.35;
          if (field === "attackStage" || field === "specialAttackStage") {
            const category = field === "attackStage" ? "物理" : "特殊";
            const hasAttack = target.card.character.moves.some(
              (m, i) => m.category === category && m.power && target.pp[i] > 0,
            );
            benefit = hasAttack
              ? move.target === "self"
                ? bestDamage(mine, opponent) * 0.5
                : incoming * 0.5
              : 0;
          }
          if (field === "speedStage")
            benefit = speed(mine) < speed(opponent) ? 16 : 3;
          value +=
            benefit *
            Math.min(2, Math.abs(delta)) *
            (mine.hp / mine.card.character.stats.hp > 0.6 ? 1 : 0.3) *
            (difficulty === "hard" ? 1.1 : 0.65);
        }
      if (
        move.power &&
        estimateMoveDamage(mine, opponent, move, false, 0.85) >= opponent.hp
      ) {
        value += (50 * move.accuracy) / 100;
        if (move.priority && speed(mine) < speed(opponent)) value += 65;
      }
      return value;
    }
    if (move.id === "restore") {
      if (
        mine.status === "seal" ||
        (state.version !== "battle-v2" &&
          incoming >= mine.hp &&
          speed(mine) < speed(opponent))
      )
        return -2;
      if (mine.hp / mine.card.character.stats.hp > 0.65) return -1;
      return (
        Math.min(recoveryAmount(mine), mine.card.character.stats.hp - mine.hp) *
        0.95
      );
    }
    if (move.id === "ward")
      return mine.defenseStage < 2 &&
        mine.hp > mine.card.character.stats.hp * 0.75
        ? incoming * (difficulty === "hard" ? 1.3 : 0.45)
        : -1;
    let value = (estimateDamage(mine, opponent, move) * move.accuracy) / 100;
    if (estimateDamage(mine, opponent, move, false, 0.85) >= opponent.hp)
      value += ((difficulty === "hard" ? 130 : 50) * move.accuracy) / 100;
    return value;
  };
  return actions.reduce((best, action) =>
    score(action) > score(best) ? action : best,
  );
}
