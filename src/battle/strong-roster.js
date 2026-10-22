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


