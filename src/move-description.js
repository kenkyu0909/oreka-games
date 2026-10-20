// Readable battle-button copy derived from the canonical effects, never from the name.
const percent = (n) => Math.round(n * 100);
const stages = {
  attackStage: "物理攻撃",
  specialAttackStage: "特殊攻撃",
  defenseStage: "物理防御",
  specialDefenseStage: "特殊防御",
  speedStage: "素早さ",
};
const conditions = {
  "lower-level": "相手より低レベルなら威力1.5倍",
  "higher-level": "相手より高レベルなら威力1.5倍",
  "same-level": "相手と同レベルなら威力2倍",
  "low-hp": "自分のHPが35%以下なら威力1.7倍",
  "target-status": "相手が状態異常なら威力1.7倍",
};
const statusEffects = {
  burn: "やけど（物理攻撃低下＋毎ターンHP減）",
  poison: "毒（毎ターンHP減）",
  slow: "鈍足（素早さ半減）",
  seal: "回復封印（HP回復を禁止）",
};
export function moveSummary(move, healingAmount = null) {
  if (move.rules !== 2) return move.text;
  const parts = [];
  if (move.hits)
    parts.push(`${move.priority > 0 ? "先制で" : ""}${move.hits}回攻撃`);
  else if (move.priority > 0) parts.push("通常技より先に行動");
  else if (move.priority < 0) parts.push("通常技より後に行動");
  if (move.destroy)
    parts.push(
      "自分の控えと相手の場のカードをすべて破壊し、破壊したカードの攻撃と特攻の合計を自分の攻撃・特攻に加える",
    );
  if (move.recoil)
    parts.push(`与えたダメージの${percent(move.recoil)}%を反動で受ける`);
  if (move.drain)
    parts.push(`与えたダメージの${percent(move.drain)}%を基準にHP回復`);
  if (move.ignoreDefense)
    parts.push(`相手の防御を${percent(move.ignoreDefense)}%無視`);
  if (move.critBonus)
    parts.push(`急所（大ダメージ）の確率＋${percent(move.critBonus)}ポイント`);
  if (move.condition) parts.push(conditions[move.condition]);
  if (move.cleanse) parts.push("自分の状態異常を治す");
  if (move.healScale)
    parts.push(
      healingAmount !== null
        ? `自分のHPを最大${healingAmount}回復`
        : `自分のHP回復${move.healScale !== 1 ? `（通常回復量の${percent(move.healScale)}%）` : ""}`,
    );
  if (move.stages) {
    const groups = new Map();
    for (const [key, value] of Object.entries(move.stages)) {
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(stages[key]);
    }
    parts.push(
      `${move.target === "enemy" ? "相手" : "自分"}の` +
        [...groups]
          .map(
            ([value, keys]) =>
              `${keys.join("・")}を${Math.abs(value)}段階${value > 0 ? "上げる" : "下げる"}`,
          )
          .join("、"),
    );
  }
  if (move.status) parts.push(`${statusEffects[move.status]}を狙う`);
  return parts.filter(Boolean).join("／") || "追加効果なしの安定した攻撃";
}
export function moveCaution(move) {
  return [
    move.status
      ? `状態異常の基本成功率${percent(move.statusChance ?? 1)}%。相手の耐性で下がります。`
      : "",
    move.drain || move.healScale
      ? "回復量は自分の回復力で増減。回復封印中は無効です。"
      : "",
    move.priority > 0
      ? "交代は先制技より先。同じ先制技同士は素早さ順です。"
      : move.priority < 0
        ? "後攻技は通常技より後に行動します。"
        : "",
    move.stages
      ? "能力変化は合計−6〜＋6段階（＋1で1.5倍、＋2で2倍）。交代で元に戻ります。"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}
