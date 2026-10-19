import "./spectacle.css";
import { effects } from "./effects.js";
// 告知を出しておく長さ。spectacle.css の awakening-type / awakening-ring と同じ。
// カード生成シーンは、この告知が終わるまで最後の工程を待たせる。
export const AWAKENING_MS = 2600;
let timer;
export function clearAwakening() {
  clearTimeout(timer);
  const banner = document.getElementById("rare-awakening");
  if (banner) banner.hidden = true;
}
export function awakenRareCard(character) {
  clearAwakening();
  const rare = character.moves.find((move) => move.rarity === "rare");
  if (
    !rare ||
    !effects.motion ||
    document.hidden ||
    document.body.dataset.view !== "creator"
  )
    return;
  const banner = document.getElementById("rare-awakening");
  banner.querySelector("strong").textContent = rare.name;
  banner.hidden = false;
  timer = setTimeout(clearAwakening, AWAKENING_MS);
}
document.addEventListener("reframe-motion-change", () => {
  if (!effects.motion) clearAwakening();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearAwakening();
});
new MutationObserver(() => {
  if (document.body.dataset.view !== "creator") clearAwakening();
}).observe(document.body, { attributes: true, attributeFilter: ["data-view"] });
