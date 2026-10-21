import { assignMovesV2 } from "./moves.js";
import { FEATURE_KEYS } from "./features.js";
import { createRandom } from "./random.js";

// photo-v3 adds exactly one rare fourth-slot move to a 5% feature-hash gate.
// Old v2's pool and assignment are intentionally untouched.
export const RARE_RATE = 0.05;
const rare = (id, name, attribute, category, power, pp, text, extra = {}) => ({
  id,
  name,
  attribute,
  category,
  power,
  pp,
  text,
  accuracy: 100,
  rules: 2,
  rarity: "rare",
  ...extra,
});
const entries = [
  rare(
    "inferno-crown",
    "灼天の王冠",
    "fire",
    "特殊",
    160,
    3,
    "威力160。攻撃後65%を基準にやけど。相手の耐性で軽減。",
    { status: "burn", statusChance: 0.65 },
  ),
  rare(
    "phoenix-fangs",
    "不死鳥の双牙",
    "fire",
    "物理",
    75,
    3,
    "威力75の2連撃。与えた実ダメージの15%を反動で受ける。",
    { hits: 2, recoil: 0.15 },
  ),
  rare(
    "blazing-coronation",
    "炎帝降臨",
    "fire",
    "物理",
    100,
    3,
    "攻撃後、自分の物理攻撃を2段階上げる。",
    { stages: { attackStage: 2 }, target: "self" },
  ),
  rare(
    "leviathan-torrent",
    "海神の三叉流",
    "water",
    "特殊",
    50,
    3,
    "威力50の3連撃。実ダメージの40%を基準に吸収。回復力で増減。",
    { hits: 3, drain: 0.4 },
  ),
  rare(
    "absolute-tide",
    "絶零の大潮",
    "water",
    "特殊",
    110,
    3,
    "攻撃後、鈍足を狙う。基本成功率100%、相手の耐性で軽減。",
    { status: "slow", statusChance: 1 },
  ),
  rare(
    "ocean-rebirth",
    "蒼海の再誕",
    "water",
    "回復",
    null,
    2,
    "状態異常を治し、通常回復量の160%回復。物理防御を1段階強化。",
    {
      cleanse: true,
      healScale: 1.6,
      stages: { defenseStage: 1 },
      target: "self",
    },
  ),
  rare(
    "heavenly-twin-blades",
    "神速の双翼",
    "wind",
    "物理",
    55,
    3,
    "通常技より先に、威力55の2連撃。先制技同士は素早さ順。",
    { priority: 1, hits: 2 },
  ),
  rare(
    "sky-rend",
    "天穹断裂",
    "wind",
    "特殊",
    125,
    3,
    "威力125。相手の有効防御をさらに60%無視する。",
    { ignoreDefense: 0.6 },
  ),
  rare(
    "tempest-coronation",
    "嵐王の進撃",
    "wind",
    "特殊",
    100,
    3,
    "攻撃後、自分の素早さを2段階強化。行動順は次ターンから変化。",
    { stages: { speedStage: 2 }, target: "self" },
  ),
  rare(
    "worldbreaker",
    "星砕き",
    "earth",
    "物理",
    180,
    2,
    "威力180の超重撃。命中90%。",
    { accuracy: 90 },
  ),
  rare(
    "continental-ruin",
    "大陸崩壊",
    "earth",
    "物理",
    120,
    3,
    "攻撃後、相手の物理防御を2段階下げる。",
    { stages: { defenseStage: -2 }, target: "enemy" },
  ),
  rare(
    "adamant-colossus",
    "金剛神撃",
    "earth",
    "物理",
    100,
    3,
    "攻撃後、自分の物理防御を2段階上げる。",
    { stages: { defenseStage: 2 }, target: "self" },
  ),
  rare(
    "genesis-ray",
    "創世の光槍",
    "light",
    "特殊",
    130,
    3,
    "威力130。相手の有効防御をさらに50%無視する。",
    { ignoreDefense: 0.5 },
  ),
  rare(
    "eternal-halo",
    "永生の光輪",
    "light",
    "特殊",
    100,
    3,
    "実ダメージの100%を基準にHP吸収。回復力で増減。封印中は回復不可。",
    { drain: 1 },
  ),
  rare(
    "miracle-dawn",
    "奇跡の黎明",
    "light",
    "回復",
    null,
    2,
    "先制で状態異常を治し、通常回復量の180%を回復する。",
    { priority: 1, cleanse: true, healScale: 1.8, target: "self" },
  ),
  rare(
    "abyssal-plague",
    "奈落の瘴炎",
    "dark",
    "特殊",
    140,
    3,
    "攻撃後、毒を狙う。基本成功率100%、相手の耐性で軽減。",
    { status: "poison", statusChance: 1 },
  ),
  rare(
    "eclipse-execution",
    "冥王の双刃",
    "dark",
    "物理",
    70,
    2,
    "先制で威力70の2連撃。実ダメージの20%を反動で受ける。",
    { priority: 1, hits: 2, recoil: 0.2 },
  ),
  rare(
    "doom-devourer",
    "終焉喰らい",
    "dark",
    "特殊",
    125,
    3,
    "相手が状態異常なら威力が1.7倍になる。",
    { condition: "target-status" },
  ),
  rare(
    "fate-shatter",
    "運命破断",
    null,
    "適性",
    150,
    2,
    "威力150。急所率を40ポイント加算。急所率は最大60%。",
    { critBonus: 0.4 },
  ),
  rare(
    "sovereign-awakening",
    "覇者の覚醒",
    null,
    "補助",
    null,
    2,
    "状態異常を治し、物理・特殊攻撃を2段階、素早さを1段階上げる。",
    {
      cleanse: true,
      stages: { attackStage: 2, specialAttackStage: 2, speedStage: 1 },
      target: "self",
    },
  ),
];
for (const m of entries) {
  if (m.stages) Object.freeze(m.stages);
  Object.freeze(m);
}
export const RARE_MOVE_LIBRARY = Object.freeze(entries);
export function assignMovesV3(attribute, stats, level, features) {
  const moves = assignMovesV2(attribute, stats, level, features);
  let seed = 0x72617265;
  for (const key of FEATURE_KEYS)
    seed = Math.imul(seed ^ (features[key] ?? 0), 16777619) >>> 0;
  seed = (seed ^ 0x9e3779b9) >>> 0 || 1;
  const random = createRandom(seed);
  if (random() >= RARE_RATE) return moves;
  const weight = (m) =>
    m.attribute === attribute ? 3 : m.attribute === null ? 1.2 : 0.8;
  let roll =
    random() * RARE_MOVE_LIBRARY.reduce((sum, m) => sum + weight(m), 0);
  const selected =
    RARE_MOVE_LIBRARY.find((m) => (roll -= weight(m)) < 0) ||
    RARE_MOVE_LIBRARY.at(-1);
  moves[3] = {
    ...structuredClone(selected),
    category:
      selected.category === "適性"
        ? stats.attack >= stats.specialAttack
          ? "物理"
          : "特殊"
        : selected.category,
  };
  return moves;
}
