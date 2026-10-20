import { characterForCard, RULE_VERSION } from "./game.js";
import { MAX_BYTES } from "./limits.js";
export function validateVault(data) {
  if (
    data?.version !== 1 ||
    data.rule !== RULE_VERSION ||
    !Array.isArray(data.cards) ||
    data.cards.length !== 10
  )
    throw new Error(
      "図鑑のバージョンが一致しません。ページを更新してください。",
    );
  const ids = new Set();
  for (const card of data.cards) {
    const keys = [
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
    ];
    if (
      !card ||
      typeof card.name !== "string" ||
      [...card.name].length > 18 ||
      typeof card.role !== "string" ||
      !keys.every(
        (key) =>
          Number.isInteger(card.character?.features?.[key]) &&
          card.character.features[key] >= 0 &&
          card.character.features[key] <= 1000,
      )
    )
      throw new Error("図鑑の特徴値が不正です。");
    if (
      !/^[a-z0-9-]+$/.test(card.id) ||
      ids.has(card.id) ||
      card.file !== `originals/${card.id}.png` ||
      card.preview !== `previews/${card.id}.jpg` ||
      !Number.isSafeInteger(card.bytes) ||
      card.bytes < 1 ||
      card.bytes > MAX_BYTES ||
      !/^[a-f0-9]{64}$/.test(card.sha256)
    )
      throw new Error("図鑑の画像情報が不正です。");
    ids.add(card.id);
    const actual = characterForCard(card.name, card.character.features, data.rule);
    if (
      JSON.stringify(actual) !== JSON.stringify(card.character) ||
      card.attribute !== actual.attribute
    )
      throw new Error("図鑑の能力と生成ルールが一致しません。");
  }
  return data.cards;
}
