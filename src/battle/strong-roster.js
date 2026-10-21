import manifest from "../../public/strong-cards/manifest.json" with { type: "json" };

// 強力カードパックの10枚。CPU「最強」はこの中から3枚を選ぶ。
// 原本PNGは端末に読み込むための配布物なので、対戦用の肖像は軽量プレビューを使う。
// Pagesビルドはパックを同梱しないため、presets.js 側で属性別SVGに切り替える。
const base = import.meta.env?.BASE_URL || "/";

export const STRONG_CARDS = manifest.cards.map((card, index) => ({
  id: card.id,
  name: card.name,
  role: card.role,
  attribute: card.character.attribute,
  character: card.character,
  preview: `${base}strong-cards/${card.preview}`,
  index,
}));

// 写真から同じカードを作り直したかを判定するための指紋。
// 名前は変えられるので、能力・レベル・属性・技の並びで照合する。
const statKey = (stats) =>
  Object.keys(stats)
    .sort()
    .map((key) => `${key}:${stats[key]}`)
    .join(",");

export const characterSignature = (character) =>
  [
    character.version,
    character.attribute,
    character.level,
    statKey(character.stats),
    character.moves.map((move) => move.id).join(","),
  ].join("|");

// CPU専用として配布している10枚の指紋。ユーザー側で同じ写真から作ると
// characterForCard() が能力だけを1/10にする（技はそのまま）。
export const STRONG_SIGNATURES = new Set(
  STRONG_CARDS.map(({ character }) => characterSignature(character)),
);
