import { generateCharacter, ATTRIBUTES, FINISHES } from "../game.js";
import { STATIC_HOSTING } from "../hosting.js";
import { STRONG_CARDS } from "./strong-roster.js";
export function seededRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
const profiles = [
  [
    "翠の番人",
    {
      brightness: 520,
      saturation: 610,
      contrast: 340,
      detail: 260,
      symmetry: 670,
      diversity: 350,
      red: 270,
      green: 480,
      blue: 250,
      resolution: 30,
      portrait: 540,
    },
  ],
  [
    "潮の旅人",
    {
      brightness: 480,
      saturation: 550,
      contrast: 480,
      detail: 400,
      symmetry: 590,
      diversity: 500,
      red: 190,
      green: 310,
      blue: 500,
      resolution: 20,
      portrait: 470,
    },
  ],
  [
    "焔の剣士",
    {
      brightness: 490,
      saturation: 700,
      contrast: 490,
      detail: 450,
      symmetry: 380,
      diversity: 310,
      red: 540,
      green: 270,
      blue: 190,
      resolution: 30,
      portrait: 530,
    },
  ],
  [
    "砂の守り手",
    {
      brightness: 530,
      saturation: 390,
      contrast: 470,
      detail: 230,
      symmetry: 850,
      diversity: 270,
      red: 380,
      green: 350,
      blue: 270,
      resolution: 10,
      portrait: 440,
    },
  ],
  [
    "夜の案内人",
    {
      brightness: 200,
      saturation: 570,
      contrast: 530,
      detail: 620,
      symmetry: 480,
      diversity: 410,
      red: 330,
      green: 330,
      blue: 340,
      resolution: 650,
      portrait: 570,
    },
  ],
  [
    "光の記録者",
    {
      brightness: 810,
      saturation: 220,
      contrast: 280,
      detail: 220,
      symmetry: 660,
      diversity: 720,
      red: 340,
      green: 330,
      blue: 330,
      resolution: 5,
      portrait: 480,
    },
  ],
];
export function art(attribute, index) {
  const { color, symbol } = ATTRIBUTES[attribute];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="320" viewBox="0 0 400 320"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#142d29"/></linearGradient></defs><rect width="400" height="320" fill="url(#g)"/><circle cx="200" cy="147" r="93" fill="none" stroke="#ffffff33"/><circle cx="200" cy="147" r="112" fill="none" stroke="#ffffff22"/><path d="M200 37 295 202 105 202Z" fill="#ffffff0c" stroke="#ffffff44"/><text x="200" y="178" text-anchor="middle" font-family="serif" font-size="85" fill="#f0eccb">${symbol}</text><text x="200" y="288" text-anchor="middle" font-family="sans-serif" letter-spacing="5" font-size="13" fill="#ffffff88">CPU / ${String(index + 1).padStart(2, "0")}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
export function makeCpuTeam(seed) {
  const random = seededRandom(seed ^ 0x5bd1e995);
  return profiles
    .map((profile, index) => ({ profile, index, sort: random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, 3)
    .map(({ profile: [name, features], index }) => {
      const character = generateCharacter(features);
      return {
        name,
        character,
        image: art(character.attribute, index),
        finish: FINISHES[0],
        fingerprint: `cpu-${index}`,
      };
    });
}

// CPU「最強」専用。配布パックの10枚から重複なしで3枚を抽選する。
// 同じシードなら同じ3枚になり、再戦の再現性を保つ。
export function makeStrongCpuTeam(seed) {
  const random = seededRandom(seed ^ 0x9e3779b9);
  return STRONG_CARDS.map((card) => ({ card, sort: random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, 3)
    .map(({ card }) => ({
      name: card.name,
      character: structuredClone(card.character),
      image: STATIC_HOSTING
        ? art(card.attribute, card.index)
        : card.preview,
      finish: FINISHES[0],
      fingerprint: `strong-${card.id}`,
    }));
}
