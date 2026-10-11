// Offline authoring tool. No stat overrides: final PNGs are verified with the game's decoder.
// Usage: node scripts/build-strong-cards.mjs /path/to/ten-generated-artworks [iterations=14000]
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { encode } from "fast-png";
import jpeg from "jpeg-js";
import {
  analyzePixels,
  generateCharacter,
  selectAttribute,
} from "../src/game.js";
import { decodeImage, sampleImage } from "../src/decode.js";
import { seededRandom } from "../src/battle/presets.js";
const root = new URL("../public/strong-cards/", import.meta.url);
export const definitions = [
  [
    "01-flame-dragon",
    "焔帝竜ヴァルカノス",
    "fire",
    "inferno-crown",
    "灼熱の特殊アタッカー",
  ],
  [
    "02-phoenix",
    "不死鳥フェニクシア",
    "fire",
    "phoenix-fangs",
    "炎の連撃アタッカー",
  ],
  [
    "03-ocean-leviathan",
    "海神竜リヴァイア",
    "water",
    "leviathan-torrent",
    "三連撃と吸収の海王",
  ],
  [
    "04-frost-knight",
    "氷皇騎士グラシオン",
    "water",
    "absolute-tide",
    "鈍足で流れを変える騎士",
  ],
  [
    "05-jade-dragon",
    "翠嵐竜エメラルディア",
    "wind",
    "sky-rend",
    "防御を貫く特殊アタッカー",
  ],
  [
    "06-storm-griffin",
    "神翼獣ゼファリオン",
    "wind",
    "heavenly-twin-blades",
    "先制二連撃の空の王",
  ],
  [
    "07-titan",
    "大地神タイタノヴァ",
    "earth",
    "worldbreaker",
    "威力180の一撃型",
  ],
  [
    "08-quake-tiger",
    "金牙王ガイアファング",
    "earth",
    "continental-ruin",
    "物理防御を砕く猛獣",
  ],
  [
    "09-light-seraph",
    "創世天セラフィエル",
    "light",
    "genesis-ray",
    "高HPと貫通光槍の守護者",
  ],
  [
    "10-shadow-reaper",
    "冥翼王ノクスレイヴ",
    "dark",
    "eclipse-execution",
    "先制二連撃の冥王",
  ],
];
// Symmetrical high-contrast grids. These are pixels, not fabricated feature vectors.
export function makeGrid(attribute, seed) {
  const random = seededRandom(seed);
  const r = (n) => Math.floor(random() * n);
  const grid = new Uint8Array(64 * 64 * 3);
  let high, low, ratio;
  if (attribute === "fire") {
    high = [255, 188 + r(39), r(5)];
    low = [1 + r(110), 0, 0];
    ratio = 0.62 + random() * 0.25;
  }
  if (attribute === "water") {
    high = [r(40), 215 + r(40), 255];
    low = [0, 0, 1 + r(40)];
    ratio = 0.62 + random() * 0.25;
  }
  if (attribute === "wind") {
    high = [192 + r(64), 255, r(5)];
    low = [0, 1 + r(20), 0];
    ratio = 0.6 + random() * 0.25;
  }
  if (attribute === "earth") {
    const v = 238 + r(18);
    high = [v, v - 8 + r(17), r(8)];
    low = [1, 1, 0];
    ratio = 0.6 + random() * 0.25;
  }
  if (attribute === "light") {
    high = [248 + r(8), 248 + r(8), 248 + r(8)];
    low = [r(45), r(45), r(45)];
    ratio = 0.8 + random() * 0.09;
  }
  if (attribute === "dark") {
    high = [200 + r(56), 200 + r(56), r(5)];
    low = [0, 0, 1 + r(8)];
    ratio = 0.18 + random() * 0.1;
  }
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 32; x++) {
      const bright =
        (x + y) % 2 === 0
          ? random() < Math.min(1, ratio * 2)
          : random() < Math.max(0, ratio * 2 - 1);
      let color = bright ? high : low;
      // Cover the whole quantized palette without losing the intended element.
      if (y < 2) {
        const b = y * 32 + x;
        color = [
          (b >> 4) * 64 + r(64),
          ((b >> 2) & 3) * 64 + r(64),
          (b & 3) * 64 + r(64),
        ];
      }
      for (let c = 0; c < 3; c++) {
        grid[(y * 64 + x) * 3 + c] = color[c];
        grid[(y * 64 + 63 - x) * 3 + c] = color[c];
      }
    }
  return grid;
}
function score(character) {
  const s = character.stats,
    moves = character.moves;
  const rare = moves[3];
  let n =
    s.hp * 1.35 +
    s.defense * 0.55 +
    s.specialDefense * 0.55 +
    s.speed * 0.9 +
    s.specialAttack * 0.7 +
    s.attack * 0.55 +
    s.piercing * 0.7 +
    s.critical * 0.35 +
    s.recovery * 0.3 +
    s.resistance * 0.3;
  n += (rare.category === "物理" ? s.attack : s.specialAttack) * 0.8;
  for (const m of moves.slice(0, 3)) {
    if (m.category === "回復") n += 80;
    if (m.drain) n += 70;
    if (m.priority) n += 50;
    if (m.power) n += m.power * (m.hits || 1) * (m.accuracy / 100) * 0.18;
    if (m.ignoreDefense) n += 45;
    if (m.status) n += 20;
    if (m.stages?.attackStage > 0 && rare.category === "物理") n += 70;
    if (m.stages?.specialAttackStage > 0 && rare.category === "特殊") n += 70;
    if (m.recoil) n -= 15;
  }
  return n;
}
async function main() {
  const artDir = process.argv[2];
  if (!artDir) throw new Error("Specify the artwork directory.");
  const iterations = Number(process.argv[3] || 14000);
  const best = new Map();
  const counts = {};
  for (const attribute of new Set(definitions.map((d) => d[2]))) {
    const targets = definitions.filter((d) => d[2] === attribute);
    let accepted = 0;
    for (let seed = 1; seed <= iterations; seed++) {
      const grid = makeGrid(attribute, seed);
      const features = analyzePixels(grid, 4000, 6000);
      if (selectAttribute(features) !== attribute) continue;
      const character = generateCharacter(features);
      const def = targets.find((d) => d[3] === character.moves[3].id);
      if (!def) continue;
      accepted++;
      const value = score(character);
      if (!best.has(def[0]) || value > best.get(def[0]).score)
        best.set(def[0], { seed, score: value, character, grid });
    }
    counts[attribute] = { searched: iterations, eligible: accepted };
    console.log(attribute, counts[attribute]);
  }
  if (best.size !== 10)
    throw new Error(`Only found ${best.size}/10; increase iterations.`);
  fs.mkdirSync(new URL("originals/", root), { recursive: true });
  fs.mkdirSync(new URL("previews/", root), { recursive: true });
  const cards = [];
  for (const [id, name, attribute, rareId, role] of definitions) {
    const selected = best.get(id);
    const art = decodeImage(fs.readFileSync(path.join(artDir, id + ".png")));
    const base = sampleImage(art, 800, 1200);
    const pixels = new Uint8Array(4000 * 6000 * 3);
    for (let y = 0; y < 6000; y++)
      for (let x = 0; x < 4000; x++) {
        const from = (Math.floor(y / 5) * 800 + Math.floor(x / 5)) * 3,
          to = (y * 4000 + x) * 3;
        pixels[to] = base[from];
        pixels[to + 1] = base[from + 1];
        pixels[to + 2] = base[from + 2];
      }
    // Exactly 4096 analysis sample locations out of 24 million pixels (0.0171%).
    // Keep the character artwork recognizable; don't change any generation rules.
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const sx = Math.floor(((2 * x + 1) * 4000) / 128),
          sy = Math.floor(((2 * y + 1) * 6000) / 128);
        pixels.set(
          selected.grid.subarray((y * 64 + x) * 3, (y * 64 + x) * 3 + 3),
          (sy * 4000 + sx) * 3,
        );
      }
    const png = encode({
      width: 4000,
      height: 6000,
      channels: 3,
      depth: 8,
      data: pixels,
    });
    const file = `originals/${id}.png`;
    fs.writeFileSync(new URL(file, root), png);
    const actual = decodeImage(png);
    const character = generateCharacter(
      analyzePixels(sampleImage(actual), actual.width, actual.height),
    );
    if (JSON.stringify(character) !== JSON.stringify(selected.character))
      throw new Error(`${id}: round trip mismatch`);
    const thumb = sampleImage(actual, 360, 540, true);
    fs.writeFileSync(
      new URL(`previews/${id}.jpg`, root),
      jpeg.encode({ data: thumb, width: 360, height: 540 }, 84).data,
    );
    const sha256 = createHash("sha256").update(png).digest("hex");
    cards.push({
      id,
      name,
      role,
      attribute,
      file,
      preview: `previews/${id}.jpg`,
      bytes: png.length,
      sha256,
      width: 4000,
      height: 6000,
      recipe: { seed: selected.seed, score: Math.round(selected.score) },
      character,
    });
    console.log(
      id,
      (png.length / 1048576).toFixed(2) + "MiB",
      character.stats,
      character.moves.map((m) => m.name).join(" / "),
    );
  }
  fs.writeFileSync(
    new URL("manifest.json", root),
    JSON.stringify(
      {
        version: 1,
        rule: "photo-v3",
        date: "2026-10-11",
        method:
          "Pixel-grid optimization; not a global optimum. Final PNG verified with the actual game decoder.",
        counts,
        cards,
      },
      null,
      2,
    ) + "\n",
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === new URL(import.meta.url).pathname
)
  await main();
