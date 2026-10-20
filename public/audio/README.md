# 登場ボイス（サンプル）

`gandora-x.wav` は動作確認用のサンプル音声です。`scripts/make-sample-voice.mjs`
で合成したもので、実際の掛け声ではありません。

本番の音声が用意できたら、次のどちらかで差し替えてください。

1. 同じ名前・同じ場所（`public/audio/gandora-x.wav`）に置く。
2. 別名のファイル（例 `gandora-x.mp3`）を置き、
   `src/special-cards.js` の `voice:` を `"audio/gandora-x.mp3"` に変える。

- `public/` の中はビルド時に `dist/` へそのままコピーされます。
- 再生は効果音と同じ `♪` トグルに従います（初期設定はオフ）。
- ファイルが無い・読めない場合でも、カットインの演出はそのまま動きます。
