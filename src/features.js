// 解析特徴の正規順序。技抽選のハッシュ・通信・図鑑の検証はこの順序に依存する。
// ここを変えると photo-v2 / photo-v3 の生成結果が変わるので注意。
export const FEATURE_KEYS = Object.freeze([
  "brightness",
  "saturation",
  "contrast",
  "detail",
  "symmetry",
  "diversity",
  "red",
  "green",
  "blue",
  "resolution",
  "portrait",
]);

export const FEATURE_LABELS = Object.freeze({
  brightness: "明るさ",
  saturation: "鮮やかさ",
  contrast: "明暗差",
  detail: "輪郭の細かさ",
  symmetry: "左右対称度",
  diversity: "色の多様性",
  red: "赤の割合",
  green: "緑の割合",
  blue: "青の割合",
  resolution: "画素数スコア",
  portrait: "縦長度",
});

// 作成画面の解析グリッドに表示する8項目。
// 赤・青・縦長も生成には使うが、表示はこの8項目に絞っている。
export const DETAIL_FEATURE_KEYS = Object.freeze([
  "brightness",
  "saturation",
  "contrast",
  "detail",
  "symmetry",
  "diversity",
  "green",
  "resolution",
]);
