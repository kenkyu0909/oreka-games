import { FINISHES, RULE_VERSION } from "../game.js";

// CPU専用の希少モンスター。HPはごくわずかで、当てるのも一苦労。
// 回避の能力値は廃止済みなので、代わりに「場にいる間、相手の命中率を
// 大きく下げる」特性として再現する（engine.js の moveAccuracy が参照）。
export const METAL_SLIME_ID = "mithril-slime";
export const METAL_SLIME_NAME = "白銀スライム";
export const METAL_SLIME_CHANCE = 1 / 3;
// 命中100%の技でも35%まで落ちる。100%は上書きされる。
export const METAL_SLIME_HIT_FACTOR = 0.35;

const MOVES = [
  {
    id: "slime-tackle",
    name: "たいあたり",
    attribute: "light",
    category: "物理",
    power: 22,
    pp: 20,
    accuracy: 100,
    text: "全身でぶつかって攻撃する。",
  },
  {
    id: "silver-gleam",
    name: "銀のきらめき",
    attribute: "light",
    category: "特殊",
    power: 26,
    pp: 15,
    accuracy: 100,
    text: "銀色の光を放って攻撃する。",
  },
  {
    id: "slime-rush",
    name: "連続プルン",
    attribute: "light",
    category: "物理",
    power: 12,
    pp: 10,
    accuracy: 100,
    rules: 2,
    hits: 2,
    text: "2回連続で攻撃する。PPは1回分だけ消費。",
  },
  {
    id: "metal-smash",
    name: "メタルスマッシュ",
    attribute: "light",
    category: "物理",
    power: 40,
    pp: 5,
    accuracy: 80,
    text: "重い体でたたきつける。命中は80%。",
  },
];

const IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="320" viewBox="0 0 400 320">
    <defs>
      <radialGradient id="silver" cx="38%" cy="28%" r="78%">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset=".32" stop-color="#e8edf2"/>
        <stop offset=".66" stop-color="#a9b6c4"/>
        <stop offset="1" stop-color="#59697b"/>
      </radialGradient>
      <linearGradient id="bg" x2="1" y2="1">
        <stop stop-color="#22303f"/>
        <stop offset="1" stop-color="#0d131b"/>
      </linearGradient>
      <linearGradient id="glint" x2="1">
        <stop stop-color="#ffffff00"/>
        <stop offset=".5" stop-color="#ffffffcc"/>
        <stop offset="1" stop-color="#ffffff00"/>
      </linearGradient>
    </defs>
    <rect width="400" height="320" fill="url(#bg)"/>
    <circle cx="200" cy="160" r="126" fill="none" stroke="#ffffff18"/>
    <circle cx="200" cy="160" r="146" fill="none" stroke="#ffffff0e"/>
    <path d="M84 214c0-52 52-94 116-94s116 42 116 94c0 30-52 52-116 52S84 244 84 214Z" fill="url(#silver)" stroke="#dbe4ee" stroke-width="3"/>
    <path d="M116 205c18-26 48-41 84-41s66 15 84 41" fill="none" stroke="#ffffff88" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="164" cy="196" rx="13" ry="17" fill="#1b2530"/>
    <ellipse cx="236" cy="196" rx="13" ry="17" fill="#1b2530"/>
    <ellipse cx="160" cy="190" rx="4" ry="6" fill="#ffffff"/>
    <ellipse cx="232" cy="190" rx="4" ry="6" fill="#ffffff"/>
    <path d="M182 230c12 9 24 9 36 0" fill="none" stroke="#2a3644" stroke-width="5" stroke-linecap="round"/>
    <rect x="70" y="126" width="260" height="5" fill="url(#glint)" opacity=".8" transform="rotate(-12 200 128)"/>
    <path d="M316 78l6 16 16 6-16 6-6 16-6-16-16-6 16-6Z" fill="#ffffffcc"/>
    <path d="M92 92l4 11 11 4-11 4-4 11-4-11-11-4 11-4Z" fill="#ffffff88"/>
    <text x="200" y="296" text-anchor="middle" font-family="sans-serif" letter-spacing="6" font-size="12" fill="#ffffff66">RARE ENCOUNTER</text>
  </svg>`,
)}`;

export function metalSlimeCard() {
  return {
    name: METAL_SLIME_NAME,
    finish: FINISHES[1],
    fingerprint: "cpu-metal-slime",
    image: IMAGE,
    character: {
      version: RULE_VERSION,
      attribute: "light",
      level: 1,
      stats: {
        hp: 8,
        attack: 28,
        defense: 250,
        specialAttack: 28,
        specialDefense: 250,
        speed: 250,
        critical: 0,
        resistance: 100,
        recovery: 0,
        piercing: 0,
      },
      moves: MOVES.map((move) => ({ ...move })),
      // 写真から作るカードではないので、技は固定。movesForCharacter が尊重する。
      fixedMoves: true,
      // この印があるカードが場にいる間、相手の命中率が大きく下がる。
      metalSlime: true,
      features: {
        brightness: 1000,
        saturation: 40,
        contrast: 480,
        detail: 900,
        symmetry: 950,
        diversity: 60,
        red: 500,
        green: 500,
        blue: 500,
        resolution: 700,
        portrait: 500,
      },
    },
  };
}
