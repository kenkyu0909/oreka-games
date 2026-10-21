import { assignMovesV2 } from "./moves.js";
import { assignMovesV3 } from "./rare-moves.js";
import { specialCardFor, withSpecialMove } from "./special-cards.js";

// Generation rules are deliberately independent from cosmetic randomness.
export const RULE_VERSION = "photo-v3";
export const SUPPORTED_RULE_VERSIONS = Object.freeze([
  "photo-v1",
  "photo-v2",
  RULE_VERSION,
]);
export const LEGACY_RULE_VERSION = "photo-v1";
export const ATTRIBUTES = {
  earth: { label: "地", name: "EARTH", color: "#aa7846", symbol: "◆" },
  water: { label: "水", name: "WATER", color: "#367da3", symbol: "≈" },
  fire: { label: "炎", name: "FIRE", color: "#c36144", symbol: "✦" },
  wind: { label: "風", name: "WIND", color: "#53876c", symbol: "≋" },
  light: { label: "光", name: "LIGHT", color: "#ac9139", symbol: "☼" },
  dark: { label: "闇", name: "DARK", color: "#7b689c", symbol: "☾" },
};
export const STATS = [
  ["hp", "HP", 400, "明るさ・元画像の画素数"],
  ["attack", "物理攻撃", 250, "彩度・明暗差"],
  ["defense", "物理防御", 250, "左右対称度・暗さ"],
  ["specialAttack", "特殊攻撃", 250, "色の多様性・彩度"],
  ["specialDefense", "特殊防御", 250, "左右対称度・明るさ"],
  ["speed", "素早さ", 250, "輪郭の細かさ・縦長度"],
  ["critical", "急所", 100, "明暗差・輪郭の細かさ"],
  ["resistance", "状態異常耐性", 100, "左右対称度・彩度の低さ"],
  ["recovery", "回復力", 100, "緑の割合・明るさ"],
  ["piercing", "貫通力", 100, "輪郭の細かさ・明暗差"],
];
export const FEATURES = [
  ["brightness", "明るさ"],
  ["saturation", "鮮やかさ"],
  ["contrast", "明暗差"],
  ["detail", "輪郭の細かさ"],
  ["symmetry", "左右対称度"],
  ["diversity", "色の多様性"],
  ["green", "緑の割合"],
  ["resolution", "画素数スコア"],
];
export const FINISHES = [
  { id: "normal", label: "ノーマル", short: "NORMAL", weight: 55 },
  { id: "silver", label: "シルバーフォイル", short: "SILVER FOIL", weight: 25 },
  { id: "holo", label: "ホログラム", short: "HOLOGRAPHIC", weight: 15 },
  { id: "prism", label: "プリズム", short: "PRISM RARE", weight: 5 },
];
const clamp = (n, min = 0, max = 1000) =>
  Math.max(min, Math.min(max, Math.round(n)));
const mix = (a, b, weight = 0.6) => clamp(a * weight + b * (1 - weight));
const scale = (n, min, max) =>
  Math.round(min + (clamp(n) * (max - min)) / 1000);

// Input: a deterministic 64×64 RGB sampling grid, alpha composited on white.
export function analyzePixels(rgb, width, height) {
  const size = 64;
  if (rgb.length !== size * size * 3 || width < 1 || height < 1)
    throw new Error("Invalid analysis input");
  const count = size * size;
  const luminance = new Uint16Array(count);
  let rSum = 0,
    gSum = 0,
    bSum = 0,
    satSum = 0,
    lumSum = 0;
  const buckets = new Set();
  for (let i = 0; i < count; i++) {
    const r = rgb[i * 3],
      g = rgb[i * 3 + 1],
      b = rgb[i * 3 + 2];
    const hi = Math.max(r, g, b),
      lo = Math.min(r, g, b);
    luminance[i] = Math.floor((r * 299 + g * 587 + b * 114) / 1000);
    lumSum += luminance[i];
    satSum += hi === 0 ? 0 : Math.floor(((hi - lo) * 1000) / hi);
    rSum += r;
    gSum += g;
    bSum += b;
    buckets.add((r >> 6) * 16 + (g >> 6) * 4 + (b >> 6));
  }
  const mean = Math.floor(lumSum / count);
  let contrast = 0,
    edges = 0,
    symmetry = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      contrast += Math.abs(luminance[i] - mean);
      if (x > 0) edges += Math.abs(luminance[i] - luminance[i - 1]);
      if (y > 0) edges += Math.abs(luminance[i] - luminance[i - size]);
      for (let c = 0; c < 3; c++)
        symmetry += Math.abs(
          rgb[i * 3 + c] - rgb[(y * size + size - 1 - x) * 3 + c],
        );
    }
  }
  const total = rSum + gSum + bSum;
  return {
    brightness: clamp((lumSum * 1000) / (count * 255)),
    saturation: clamp(satSum / count),
    contrast: clamp((contrast * 1000) / (count * 100)),
    detail: clamp((edges * 1000) / (2 * size * (size - 1) * 60)),
    symmetry: clamp(1000 - (symmetry * 1000) / (count * 3 * 128)),
    diversity: clamp(((buckets.size - 1) * 1000) / 63),
    red: total ? clamp((rSum * 1000) / total) : 0,
    green: total ? clamp((gSum * 1000) / total) : 0,
    blue: total ? clamp((bSum * 1000) / total) : 0,
    resolution: clamp((width * height * 1000) / 24000000),
    portrait: clamp((height * 1000) / (width + height)),
  };
}

export function selectAttribute(f) {
  if (f.brightness < 220) return "dark";
  if (f.brightness > 780 && f.saturation < 260) return "light";
  if (f.blue > f.red + 45 && f.blue > f.green + 20) return "water";
  if (f.red > f.green + 80 && f.red > f.blue + 80) return "fire";
  if (f.green > f.red + 25 && f.green > f.blue + 15) return "wind";
  return "earth";
}

const elementaryNames = {
  earth: ["岩の一撃", "地殻の波動"],
  water: ["水の一撃", "深海の波動"],
  fire: ["炎の一撃", "紅蓮の波動"],
  wind: ["風の一撃", "疾風の波動"],
  light: ["光の一撃", "白光の波動"],
  dark: ["闇の一撃", "夜影の波動"],
};
export function assignMoves(attribute, stats, level) {
  const [strike, wave] = elementaryNames[attribute];
  const category = stats.attack >= stats.specialAttack ? "物理" : "特殊";
  const condition =
    level <= 4
      ? {
          id: "underdog",
          name: "下剋上",
          text: "相手より低レベルなら威力が1.5倍。",
          condition: "lower-level",
        }
      : level >= 9
        ? {
            id: "pressure",
            name: "威圧の一撃",
            text: "相手より高レベルなら威力が1.5倍。",
            condition: "higher-level",
          }
        : {
            id: "resonance",
            name: "共鳴の一撃",
            text: "相手と同じレベルなら威力が2倍。",
            condition: "same-level",
          };
  return [
    {
      id: `${attribute}-strike`,
      name: strike,
      category,
      attribute,
      power: 55,
      accuracy: 100,
      pp: 20,
      text: "安定して攻める、基本の属性技。",
    },
    {
      id: `${attribute}-wave`,
      name: wave,
      category,
      attribute,
      power: 95,
      accuracy: 85,
      pp: 8,
      text: "高威力だが、外れることもある属性技。",
    },
    { ...condition, category, attribute, power: 60, accuracy: 100, pp: 10 },
    stats.recovery >= stats.resistance
      ? {
          id: "restore",
          name: "生命のしずく",
          category: "回復",
          attribute: null,
          power: null,
          accuracy: 100,
          pp: 5,
          text: "自分のHPを回復。回復力が高いほど効果アップ。",
        }
      : {
          id: "ward",
          name: "守りの紋章",
          category: "補助",
          attribute: null,
          power: null,
          accuracy: 100,
          pp: 5,
          text: "自分の物理防御・特殊防御を1段階上げる。",
        },
  ];
}

export function generateCharacter(features, version = RULE_VERSION) {
  if (!SUPPORTED_RULE_VERSIONS.includes(version))
    throw new Error("未対応の生成ルールです。");
  const f = features;
  const stats = {
    hp: scale(mix(f.brightness, f.resolution, 0.7), 60, 400),
    attack: scale(mix(f.saturation, f.contrast), 15, 250),
    defense: scale(mix(f.symmetry, 1000 - f.brightness), 15, 250),
    specialAttack: scale(mix(f.diversity, f.saturation), 15, 250),
    specialDefense: scale(mix(f.symmetry, f.brightness), 15, 250),
    speed: scale(mix(f.detail, f.portrait, 0.8), 15, 250),
    critical: scale(mix(f.contrast, f.detail), 1, 100),
    resistance: scale(mix(f.symmetry, 1000 - f.saturation), 1, 100),
    recovery: scale(mix(clamp(f.green * 1.7), f.brightness), 1, 100),
    piercing: scale(mix(f.detail, f.contrast), 1, 100),
  };
  const level = scale(
    (f.symmetry * 3 + f.diversity * 5 + f.portrait * 2) / 10,
    1,
    12,
  );
  const attribute = selectAttribute(f);
  return {
    version,
    attribute,
    level,
    stats,
    moves:
      version === LEGACY_RULE_VERSION
        ? assignMoves(attribute, stats, level)
        : (version === "photo-v2" ? assignMovesV2 : assignMovesV3)(
            attribute,
            stats,
            level,
            features,
          ),
    features: { ...f },
  };
}

export function drawFinish(randomValue) {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1)
    throw new RangeError("Expected random value in [0, 1)");
  let threshold = 0;
  for (const finish of FINISHES) {
    threshold += finish.weight / 100;
    if (randomValue < threshold) return finish;
  }
  return FINISHES.at(-1);
}

export function movesForCharacter(character) {
  const moves =
    character.version === LEGACY_RULE_VERSION
      ? assignMoves(character.attribute, character.stats, character.level)
      : (character.version === "photo-v2" ? assignMovesV2 : assignMovesV3)(
          character.attribute,
          character.stats,
          character.level,
          character.features,
        );
  // 特殊カードは写真から決まる3技に、名前で固定された切り札を1つ足す。
  return character.special ? withSpecialMove(character.special, moves) : moves;
}

// カード名から能力を作り直す。名前が特殊カードでなければ通常の生成結果を返す。
export function characterForCard(name, features, version = RULE_VERSION) {
  const character = generateCharacter(features, version);
  const special = specialCardFor(name);
  if (!special) return character;
  return {
    ...character,
    special: special.id,
    moves: withSpecialMove(special.id, character.moves),
  };
}
