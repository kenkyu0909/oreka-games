// 特殊カードの登場ボイスのサンプルを作る。本番の音声が用意できたら、
// 同じパスのファイルを差し替える（詳細は public/audio/README.md）。
//   node scripts/make-sample-voice.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RATE = 44100;
const SECONDS = 2.4;
const COUNT = Math.round(RATE * SECONDS);
const mix = new Float32Array(COUNT);

let seed = 0x9e3779b9;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noise = () => random() * 2 - 1;
const saw = (phase) => 2 * (phase - Math.floor(phase)) - 1;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// 1) 地の咆哮。低いノコギリ波2本にビブラートをかけ、ゆっくり減衰させる。
for (let i = 0; i < COUNT; i++) {
  const t = i / RATE;
  const env = Math.min(1, t / 0.09) * Math.exp(-Math.max(0, t - 0.18) * 1.15);
  const vibrato = Math.sin(2 * Math.PI * 5.5 * t) * 7;
  const low = 58 + vibrato + Math.max(0, 34 - t * 60);
  const high = 88.5 - vibrato * 0.6;
  mix[i] += (saw(t * low) * 0.32 + saw(t * high) * 0.15) * env;
}

// 2) 破壊の衝撃。0.26秒に低音のパンチとノイズを重ねる。
const hit = 0.26;
for (let i = Math.round(hit * RATE); i < COUNT; i++) {
  const t = (i - hit * RATE) / RATE;
  const decay = Math.exp(-t * 6.5);
  const punch = Math.sin(2 * Math.PI * (34 + 96 * Math.exp(-t * 18)) * t);
  mix[i] += punch * decay * 0.55;
  mix[i] += noise() * Math.exp(-t * 26) * 0.3;
}

// 3) 立ち上がりの金属音。0.02秒から上昇するサイン波を薄く重ねる。
for (let i = 0; i < Math.round(0.5 * RATE); i++) {
  const t = i / RATE;
  const sweep = 180 + t * 1900;
  mix[i] += Math.sin(2 * Math.PI * sweep * t) * (1 - t / 0.5) ** 2 * 0.16;
}

// 4) 余韻。1.1秒以降の唸りを足して、最後は自然に消す。
for (let i = Math.round(1.05 * RATE); i < COUNT; i++) {
  const t = (i - 1.05 * RATE) / RATE;
  const env = Math.exp(-t * 1.7) * 0.22;
  mix[i] += (saw(t * 44 + 0.2) * 0.6 + Math.sin(2 * Math.PI * 132 * t) * 0.4) * env;
}

// 全体のフェードイン／アウトとピーク正規化。
let peak = 0;
for (let i = 0; i < COUNT; i++) {
  const t = i / RATE;
  const fade = Math.min(1, t / 0.01) * clamp((SECONDS - t) / 0.35, 0, 1);
  mix[i] *= fade;
  peak = Math.max(peak, Math.abs(mix[i]));
}
const gain = peak > 0 ? 0.92 / peak : 1;

const pcm = Buffer.alloc(44 + COUNT * 2);
pcm.write("RIFF", 0);
pcm.writeUInt32LE(36 + COUNT * 2, 4);
pcm.write("WAVEfmt ", 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(RATE, 24);
pcm.writeUInt32LE(RATE * 2, 28);
pcm.writeUInt16LE(2, 32);
pcm.writeUInt16LE(16, 34);
pcm.write("data", 36);
pcm.writeUInt32LE(COUNT * 2, 40);
for (let i = 0; i < COUNT; i++)
  pcm.writeInt16LE(Math.round(clamp(mix[i] * gain, -1, 1) * 32767), 44 + i * 2);

const target = fileURLToPath(
  new URL("../public/audio/gandora-x.wav", import.meta.url),
);
mkdirSync(fileURLToPath(new URL("../public/audio/", import.meta.url)), {
  recursive: true,
});
writeFileSync(target, pcm);
console.log(`wrote ${target} (${(pcm.length / 1024).toFixed(1)} KB)`);
