// 名前で決まる特殊カード。写真から作る通常カードと同じく、名前と特徴値だけで
// クライアントとサーバーの双方が同じ結果を再現できるよう、ここには純粋な定義
// だけを置く（通信で送るのは名前・特徴値・生成ルールのみ）。
// 能力値は写真のまま。名前が一致したカードだけ、4枠目の技と登場演出が変わる。

const freeze = (value) => {
  if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return Object.freeze(value);
};

// 破壊したカードの攻撃と特攻を吸収する、確定後攻の切り札。
// priority を負にすると、通常技より後に行動する（engine.js の行動順）。
const GANDORA_MOVE = {
  id: "destroy-giga-raze",
  name: "デストロイ・ギガ・レイズ",
  attribute: "dark",
  category: "特殊",
  power: null,
  accuracy: 100,
  pp: 1,
  rules: 2,
  priority: -1,
  special: true,
  // 自分の控えすべてと、相手の場に出ているカードを破壊する。
  destroy: { ownBench: true, enemyField: true },
  text: "確定後攻。自分の控えと相手の場のカードをすべて破壊し、破壊したカードの攻撃と特攻の合計を自分の攻撃・特攻に加える。",
};

const GANDORA = {
  id: "gandora-x",
  name: "破滅竜ガンドラX",
  move: GANDORA_MOVE,
  cutin: {
    eyebrow: "SPECIAL CARD / 破壊神",
    move: "デストロイ・ギガ・レイズ",
    line: "すべてを破壊し、その力を喰らう。",
  },
  // 後で差し替える前提のサンプル音声。public/ からの相対パス。
  voice: "audio/gandora-x.wav",
};

freeze(GANDORA);
export const SPECIAL_CARDS = Object.freeze([GANDORA]);

// 名前の表記ゆれ（前後の空白・全角英字・大文字小文字）だけを吸収する。
const nameKey = (name) =>
  String(name ?? "")
    .normalize("NFKC")
    .replace(/[\s\u3000]+/g, "")
    .toLowerCase();

export function specialCardFor(name) {
  const key = nameKey(name);
  if (!key) return null;
  return SPECIAL_CARDS.find((card) => nameKey(card.name) === key) || null;
}

export function specialCardById(id) {
  return SPECIAL_CARDS.find((card) => card.id === id) || null;
}

// 4枠目を特殊技に差し替える。通常の3技は写真から決まるのでそのまま残す。
export function withSpecialMove(specialId, moves) {
  const card = specialCardById(specialId);
  if (!card || !Array.isArray(moves) || !moves.length) return moves;
  const next = moves.map((move) => structuredClone(move));
  next[next.length - 1] = structuredClone(card.move);
  return next;
}
