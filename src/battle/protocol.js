import {
  characterForCard,
  SUPPORTED_RULE_VERSIONS,
  FINISHES,
} from "../game.js";
export const PROTOCOL_VERSION = 5;
export const FEATURE_KEYS = [
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
export const MAX_PHOTO_LENGTH = 120000;

export function normalizeTeam(input) {
  if (!Array.isArray(input) || input.length !== 3)
    throw new Error("チームは3体必要です。");
  return input.map((card) => {
    if (
      !card ||
      typeof card !== "object" ||
      !SUPPORTED_RULE_VERSIONS.includes(card.character?.version)
    )
      throw new Error("カードの生成ルールが一致しません。再生成してください。");
    const features = {};
    for (const key of FEATURE_KEYS) {
      const value = card.character.features?.[key];
      if (!Number.isInteger(value) || value < 0 || value > 1000)
        throw new Error("カードの特徴値が不正です。");
      features[key] = value;
    }
    if (
      typeof card.image !== "string" ||
      card.image.length > MAX_PHOTO_LENGTH ||
      !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(card.image)
    )
      throw new Error("カードの画像が不正、または大きすぎます。");
    if (
      typeof card.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(card.fingerprint)
    )
      throw new Error("写真IDが不正です。");
    if (typeof card.name !== "string" || card.name.length > 100)
      throw new Error("カード名が不正です。");
    const name =
      [...card.name.replace(/[\u0000-\u001f\u007f]/g, "").trim()]
        .slice(0, 18)
        .join("") || "名前のない切り札";
    return {
      name,
      image: card.image,
      fingerprint: card.fingerprint,
      finish: FINISHES.find((f) => f.id === card.finish?.id) || FINISHES[0],
      // Never trust stats or arbitrary move definitions sent by a peer.
      // 特殊カードは名前で技が決まるので、名前から作り直す。
      character: characterForCard(name, features, card.character.version),
    };
  });
}
export function wireTeam(team) {
  return team.map(({ name, image, fingerprint, finish, character }) => ({
    name,
    image,
    fingerprint,
    finish,
    character: { version: character.version, features: character.features },
  }));
}
export function isRoomCode(code) {
  return typeof code === "string" && /^[A-HJ-NP-Z2-9]{6}$/.test(code);
}
