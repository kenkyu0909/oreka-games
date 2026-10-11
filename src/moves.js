// photo-v2: a canonical, data-only move library shared by client and server.
const move = (id, name, attribute, category, power, pp, text, extra = {}) => ({
  id,
  name,
  attribute,
  category,
  power,
  pp,
  accuracy: 100,
  rules: 2,
  text,
  ...extra,
});
const physical = "物理",
  special = "特殊",
  support = "補助",
  healing = "回復";
const entries = [
  move(
    "fire-strike",
    "炎の一撃",
    "fire",
    "適性",
    55,
    20,
    "炎属性で安定して攻撃する。",
  ),
  move(
    "ember-fangs",
    "双炎牙",
    "fire",
    physical,
    30,
    12,
    "2回連続で攻撃する。PPは1回分だけ消費。",
    { hits: 2 },
  ),
  move(
    "blaze-rush",
    "爆炎突進",
    "fire",
    physical,
    110,
    6,
    "高威力の突進。与えたダメージの25%を反動で受ける。",
    { accuracy: 90, recoil: 0.25 },
  ),
  move(
    "cinder-shot",
    "火傷の火種",
    "fire",
    special,
    45,
    14,
    "攻撃後、35%を基準にやけどを狙う。相手の耐性で軽減。",
    { status: "burn", statusChance: 0.35 },
  ),
  move(
    "furnace",
    "灼熱の闘志",
    "fire",
    support,
    null,
    7,
    "自分の物理攻撃を2段階上げる。",
    { stages: { attackStage: 2 }, target: "self" },
  ),
  move(
    "ash-break",
    "灰燼砕き",
    "fire",
    physical,
    55,
    10,
    "攻撃後、相手の物理防御を1段階下げる。",
    { stages: { defenseStage: -1 }, target: "enemy" },
  ),
  move(
    "water-strike",
    "水の一撃",
    "water",
    "適性",
    55,
    20,
    "水属性で安定して攻撃する。",
  ),
  move(
    "tidal-chain",
    "三連水流",
    "water",
    special,
    22,
    9,
    "3回連続で攻撃する。PPは1回分だけ消費。",
    { hits: 3 },
  ),
  move(
    "aqua-siphon",
    "水命吸収",
    "water",
    special,
    60,
    10,
    "与えたダメージの45%を基準にHP吸収。回復力で増減。",
    { drain: 0.45 },
  ),
  move(
    "frost-current",
    "凍てつく流れ",
    "water",
    special,
    45,
    14,
    "攻撃後、45%を基準に鈍足を狙う。相手の耐性で軽減。",
    { status: "slow", statusChance: 0.45 },
  ),
  move(
    "cleansing-rain",
    "浄化の雨",
    "water",
    healing,
    null,
    5,
    "自分の状態異常を治し、通常回復量の65%を回復する。",
    { cleanse: true, healScale: 0.65, target: "self" },
  ),
  move(
    "deep-pressure",
    "深海の重圧",
    "water",
    support,
    null,
    8,
    "相手の特殊攻撃を2段階下げる。",
    { stages: { specialAttackStage: -2 }, target: "enemy" },
  ),
  move(
    "wind-strike",
    "風の一撃",
    "wind",
    "適性",
    55,
    20,
    "風属性で安定して攻撃する。",
  ),
  move(
    "gale-step",
    "疾風の先駆け",
    "wind",
    physical,
    38,
    14,
    "通常の技より先に攻撃する。先制技同士は素早さ順。",
    { priority: 1 },
  ),
  move(
    "razor-gale",
    "急所を裂く風",
    "wind",
    physical,
    60,
    10,
    "急所率が通常より25ポイント高い。",
    { critBonus: 0.25 },
  ),
  move(
    "tailwind",
    "追い風の翼",
    "wind",
    support,
    null,
    7,
    "自分の素早さを2段階上げる。次ターンから行動順に反映。",
    { stages: { speedStage: 2 }, target: "self" },
  ),
  move(
    "storm-dance",
    "嵐の輪舞",
    "wind",
    physical,
    27,
    12,
    "2回連続攻撃。命中判定は技の開始時に1回。",
    { hits: 2 },
  ),
  move(
    "vacuum-cut",
    "真空裂き",
    "wind",
    special,
    65,
    9,
    "技の効果で相手の有効な防御をさらに40%無視する。",
    { ignoreDefense: 0.4 },
  ),
  move(
    "earth-strike",
    "岩の一撃",
    "earth",
    "適性",
    55,
    20,
    "地属性で安定して攻撃する。",
  ),
  move(
    "fault-pierce",
    "断層貫き",
    "earth",
    physical,
    70,
    8,
    "技の効果で相手の有効な防御をさらに40%無視する。",
    { ignoreDefense: 0.4 },
  ),
  move(
    "iron-shell",
    "金剛の構え",
    "earth",
    support,
    null,
    7,
    "自分の物理防御を2段階上げる。",
    { stages: { defenseStage: 2 }, target: "self" },
  ),
  move(
    "meteor-fall",
    "隕石落とし",
    "earth",
    physical,
    125,
    5,
    "大威力の一撃。命中75%の勝負技。",
    { accuracy: 75 },
  ),
  move(
    "sand-bind",
    "流砂の鎖",
    "earth",
    special,
    45,
    12,
    "攻撃後、相手の素早さを1段階下げる。",
    { stages: { speedStage: -1 }, target: "enemy" },
  ),
  move(
    "crystal-rest",
    "晶石の休息",
    "earth",
    healing,
    null,
    5,
    "通常回復量の75%を回復し、特殊防御を1段階上げる。",
    { healScale: 0.75, stages: { specialDefenseStage: 1 }, target: "self" },
  ),
  move(
    "light-strike",
    "光の一撃",
    "light",
    "適性",
    55,
    20,
    "光属性で安定して攻撃する。",
  ),
  move(
    "judgement-ray",
    "裁きの光条",
    "light",
    special,
    65,
    9,
    "技の効果で相手の有効な防御をさらに40%無視する。",
    { ignoreDefense: 0.4 },
  ),
  move(
    "radiant-drain",
    "生命の光輪",
    "light",
    special,
    55,
    10,
    "与えたダメージの60%を基準にHP吸収。回復力で増減。",
    { drain: 0.6 },
  ),
  move(
    "seal-sigil",
    "封命の印",
    "light",
    support,
    null,
    8,
    "回復封印を狙う。成功率は相手の耐性で軽減される。",
    { status: "seal", statusChance: 1, target: "enemy" },
  ),
  move(
    "dawn-prayer",
    "黎明の祈り",
    "light",
    healing,
    null,
    5,
    "自分の状態異常を治し、通常回復量の80%を回復する。",
    { cleanse: true, healScale: 0.8, target: "self" },
  ),
  move(
    "aurora-mind",
    "極光の覚醒",
    "light",
    support,
    null,
    6,
    "自分の特殊攻撃と特殊防御を1段階ずつ上げる。",
    {
      stages: { specialAttackStage: 1, specialDefenseStage: 1 },
      target: "self",
    },
  ),
  move(
    "dark-strike",
    "闇の一撃",
    "dark",
    "適性",
    55,
    20,
    "闇属性で安定して攻撃する。",
  ),
  move(
    "night-drain",
    "夜喰らい",
    "dark",
    physical,
    65,
    8,
    "与えたダメージの45%を基準にHP吸収。回復力で増減。",
    { drain: 0.45 },
  ),
  move(
    "venom-mist",
    "毒霧の帳",
    "dark",
    support,
    null,
    8,
    "毒を狙う。成功率は相手の耐性で軽減される。",
    { status: "poison", statusChance: 1, target: "enemy" },
  ),
  move(
    "hex-bite",
    "呪縛喰い",
    "dark",
    special,
    60,
    10,
    "相手が状態異常なら威力が1.7倍。",
    { condition: "target-status" },
  ),
  move(
    "shadow-ambush",
    "影の奇襲",
    "dark",
    physical,
    38,
    14,
    "通常の技より先に攻撃する。先制技同士は素早さ順。",
    { priority: 1 },
  ),
  move(
    "dread-roar",
    "戦慄の咆哮",
    "dark",
    support,
    null,
    8,
    "相手の物理攻撃を2段階下げる。",
    { stages: { attackStage: -2 }, target: "enemy" },
  ),
  move(
    "underdog",
    "下剋上",
    null,
    "適性",
    65,
    10,
    "相手より低レベルなら威力が1.5倍。",
    { condition: "lower-level" },
  ),
  move(
    "pressure",
    "威圧の一撃",
    null,
    "適性",
    65,
    10,
    "相手より高レベルなら威力が1.5倍。",
    { condition: "higher-level" },
  ),
  move(
    "resonance",
    "共鳴の一撃",
    null,
    "適性",
    60,
    10,
    "相手と同じレベルなら威力が2倍。",
    { condition: "same-level" },
  ),
  move(
    "restore",
    "生命のしずく",
    null,
    healing,
    null,
    5,
    "自分のHPを回復。回復力が高いほど効果アップ。",
    { healScale: 1, target: "self" },
  ),
  move(
    "ward",
    "守りの紋章",
    null,
    support,
    null,
    6,
    "自分の物理防御と特殊防御を1段階ずつ上げる。",
    { stages: { defenseStage: 1, specialDefenseStage: 1 }, target: "self" },
  ),
  move(
    "battle-focus",
    "闘気集中",
    null,
    support,
    null,
    7,
    "自分の物理攻撃を2段階上げる。",
    { stages: { attackStage: 2 }, target: "self" },
  ),
  move(
    "meditate",
    "魔力瞑想",
    null,
    support,
    null,
    7,
    "自分の特殊攻撃を2段階上げる。",
    { stages: { specialAttackStage: 2 }, target: "self" },
  ),
  move(
    "quicken",
    "瞬足の構え",
    null,
    support,
    null,
    7,
    "自分の素早さを2段階上げる。次ターンから行動順に反映。",
    { stages: { speedStage: 2 }, target: "self" },
  ),
  move(
    "purify",
    "解呪の息吹",
    null,
    healing,
    null,
    5,
    "状態異常を治し、通常回復量の50%を回復する。",
    { cleanse: true, healScale: 0.5, target: "self" },
  ),
  move(
    "last-stand",
    "背水の一撃",
    null,
    "適性",
    65,
    9,
    "自分のHPが35%以下なら威力が1.7倍。",
    { condition: "low-hp" },
  ),
  move(
    "reckless-charge",
    "捨て身の突撃",
    null,
    physical,
    115,
    7,
    "与えたダメージの30%を反動で受ける。",
    { recoil: 0.3 },
  ),
  move(
    "armor-break",
    "鎧砕き",
    null,
    physical,
    50,
    12,
    "攻撃後、相手の物理防御を1段階下げる。",
    { stages: { defenseStage: -1 }, target: "enemy" },
  ),
];
function freeze(value) {
  Object.values(value).forEach((v) => {
    if (v && typeof v === "object") freeze(v);
  });
  return Object.freeze(value);
}
export const MOVE_LIBRARY = freeze(entries);
export function moveTags(move) {
  const tags = [];
  if (move.rarity === "rare") tags.push("レア");
  if (move.priority) tags.push("先制");
  if (move.hits) tags.push(`${move.hits}連撃`);
  if (move.drain) tags.push("吸収");
  if (move.recoil) tags.push("反動");
  if (move.ignoreDefense) tags.push("貫通");
  if (move.critBonus) tags.push("急所");
  if (move.status)
    tags.push(
      { burn: "やけど", poison: "毒", slow: "鈍足", seal: "回復封印" }[
        move.status
      ],
    );
  if (move.cleanse) tags.push("浄化");
  if (move.healScale) tags.push("回復");
  if (move.stages) tags.push(move.target === "enemy" ? "弱体" : "強化");
  if (move.condition) tags.push("条件");
  if (move.accuracy < 90) tags.push("大技");
  if (!tags.length && move.category === healing) tags.push("回復");
  if (!tags.length && move.category === support) tags.push("強化");
  if (move.id.endsWith("-wave")) tags.push("追加効果");
  return tags.length ? tags : ["基本"];
}
// Ordered integer hashing, independent of object property insertion order and finish.
const keys = [
  "brightness",
  "saturation",
  "contrast",
  "detail",
  "symmetry",
  "diversity",
  "red",
  "green",
  "blue",
  "resolution",
  "portrait",
];
export function assignMovesV2(attribute, stats, level, features) {
  let seed = 2166136261;
  for (const key of keys) {
    seed = Math.imul(seed ^ (features[key] ?? 0), 16777619) >>> 0;
  }
  seed = (seed ^ Math.imul(level, 2654435761)) >>> 0 || 1;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const selected = [];
  const weight = (m) => {
    let n = m.attribute === attribute ? 2.4 : m.attribute === null ? 1.1 : 1;
    const category =
      m.category === "適性"
        ? stats.attack >= stats.specialAttack
          ? physical
          : special
        : m.category;
    if (category === physical) n *= 0.75 + stats.attack / 250;
    if (category === special) n *= 0.75 + stats.specialAttack / 250;
    if (m.drain || m.healScale) n *= 0.7 + stats.recovery / 100;
    if (m.priority) n *= 0.8 + stats.speed / 250;
    if (m.ignoreDefense) n *= 0.8 + stats.piercing / 100;
    if (m.critBonus) n *= 0.8 + stats.critical / 100;
    if (m.condition === "lower-level") n *= level <= 4 ? 2 : 0.5;
    if (m.condition === "higher-level") n *= level >= 9 ? 2 : 0.5;
    return n;
  };
  // Pure buffs with identical effects must not fill two slots just under different names.
  const assignmentGroup = (m) =>
    !m.power && m.stages && !m.healScale
      ? `${m.target}:${JSON.stringify(m.stages)}`
      : m.id;
  function pick(pool) {
    const remaining = pool.filter(
      (m) =>
        !selected.some(
          (previous) => assignmentGroup(previous) === assignmentGroup(m),
        ),
    );
    let roll = random() * remaining.reduce((sum, m) => sum + weight(m), 0);
    const chosen =
      remaining.find((m) => (roll -= weight(m)) < 0) || remaining.at(-1);
    selected.push(chosen);
  }
  const own = MOVE_LIBRARY.filter((m) => m.attribute === attribute);
  pick(own.filter((m) => m.power && m.accuracy === 100));
  pick(MOVE_LIBRARY.filter((m) => m.power));
  pick(MOVE_LIBRARY.filter((m) => !m.power || m.condition));
  pick(MOVE_LIBRARY);
  return selected.map((m) => ({
    ...structuredClone(m),
    category:
      m.category === "適性"
        ? stats.attack >= stats.specialAttack
          ? physical
          : special
        : m.category,
  }));
}
