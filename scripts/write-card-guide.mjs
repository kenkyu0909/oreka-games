import fs from "node:fs";
import { ATTRIBUTES, STATS } from "../src/game.js";
const root = new URL("../public/strong-cards/", import.meta.url);
const manifest = JSON.parse(
  fs.readFileSync(new URL("manifest.json", root), "utf8"),
);
let text = `# 伝説のカード10枚 — RE:FRAME 強力カードパック\n\nゲーム内のカード図鑑はネタバレ防止のため削除しました。このフォルダは、希望者向けの保存用パックです。**以下に能力・技のネタバレがあります。** 原本PNGを保存し、ゲームの「カード作成 → 写真を選ぶ」から読み込んでください。\n\n## GitHubから保存する\n\n### いちばん簡単：10枚まとめて\n\n**[⬇ 原本PNG10枚をZIPでまとめて保存](strong-cards-10.zip?raw=true)**（約40MB）\n\n1. 上のリンクを開いてZIPをダウンロード。ダウンロードされなければGitHubのファイル画面で「Download raw file」（下向き矢印）を押します。\n2. iPhoneは「ファイル」、Androidはファイル管理アプリなどでZIPを展開します。\n3. ゲームで「カード作成 → 写真を選ぶ」。展開した \`originals\` 内のPNGを選びます。\n4. カード名は下の一覧を参考に変更し、「チームに追加」を押します。3枚そろえると対戦できます。\n\n### 1枚ずつ保存\n\n各カードの「原本PNGを保存」を押します。画像が開いたら保存、またはGitHubの画像ファイル画面で「Download raw file」を押してください。**スクリーンショットではなくPNGファイルそのもの**を使います。\n\n## 大切な注意\n\n- 対応ルールは **photo-v3**。10枚とも別々のレア技を1つずつ持ち、全6属性を網羅しています。\n- 読み込み用は \`originals/*.png\`。ギャラリーの小さいJPEGやゲームが書き出す「記念用カード画像」を再読み込みすると、能力が変わります。\n- LINE等での画像送信、JPEG変換、縮小、編集、スクリーンショットは避けてください。転送するならZIPまたはファイル添付が確実です。\n- キラ加工だけは生成ごとに抽選。同じPNGからの属性・レベル・能力・技は変わりません。\n- 4,000×6,000px・各約3.5〜3.8MiB。ゲームの12MiB／2,400万画素制限以内ですが、低メモリ端末では解析が重い場合があります。PNG原本を1枚ずつ選んで解析してください。\n- 「最強」は保証しません。高い能力と強力なレア技を狙って選んだ候補集です。相性、状態異常、PP、先制、交代で勝敗は変わります。レア技は2〜3PP、反動や命中90%の技にも注意してください。\n- このパックは公開GitHub向けのオリジナルAI生成イラストです。ユーザーの私的な写真は含めていません。\n\n## 10枚のラインナップ\n\n|カード|属性|レア技|HP|物攻|特攻|素早さ|\n|---|---|---|---:|---:|---:|---:|\n`;
for (const card of manifest.cards) {
  const s = card.character.stats;
  text += `|[${card.name}](#${card.id})|${ATTRIBUTES[card.attribute].label}|${card.character.moves[3].name}|${s.hp}|${s.attack}|${s.specialAttack}|${s.speed}|\n`;
}
for (const card of manifest.cards) {
  text += `\n<a id="${card.id}"></a>\n\n### ${card.name}\n\n<img src="${card.preview}" alt="${card.name}" width="240">\n\n**${ATTRIBUTES[card.attribute].label}属性 / Lv.${card.character.level} — ${card.role}**\n\n[⬇ 原本PNGを保存](${card.file}?raw=true) · ${(card.bytes / 1048576).toFixed(2)}MiB\n\n${STATS.map(([key, label]) => `${label} **${card.character.stats[key]}**`).join(" / ")}\n\n|技|威力|命中|PP|効果|\n|---|---:|---:|---:|---|\n${card.character.moves.map((m) => `|${m.rarity === "rare" ? "★ " : ""}${m.name}|${m.power ?? "—"}${m.hits ? "×" + m.hits : ""}|${m.accuracy}%|${m.pp}|${m.text}|`).join("\n")}\n\n<details><summary>原本の照合情報</summary>\n\nSHA-256: \`${card.sha256}\`\n\n探索シード: ${card.recipe.seed} / photo-v3。全特徴値と技定義は [manifest.json](manifest.json)。\n\n</details>\n`;
}
text += `\n## 作り方と検証\n\n- 各属性14,000パターン、合計84,000パターンの64×64色配置を探索。高い能力と技の組み合わせを重み付け採点し、10種類の指定レア技ごとに候補を選びました。全組み合わせの厳密な最適解ではありません。\n- 画像はAI生成したイラストをベースに、解析の標本点4,096px（全2,400万画素の約0.017%）の色を調整しています。見た目の絵だけではなく、この微細な加工が強さに寄与します。縮小等で加工が失われると同じ能力は再現されません。ゲーム本体の能力式やレア抽選は変更していません。\n- 最終PNGをゲーム本体の \`decodeImage → sampleImage → analyzePixels → generateCharacter\` で再解析し、属性・10能力・レベル・4技・ハッシュの一致を10枚すべて検証。\n- [生成スクリプト](../../scripts/build-strong-cards.mjs) ／ [回帰テスト](../../tests/vault.test.js)。\n- \`previews/\` は閲覧専用の軽量JPEG。\`manifest.json\` は原本ハッシュ、寸法、サイズ、特徴値、能力、技の検証用データです。\n`;
fs.writeFileSync(new URL("README.md", root), text);
