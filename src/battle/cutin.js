import { ATTRIBUTES } from "../game.js";
import { effects } from "../effects.js";
import { specialCardById } from "../special-cards.js";

// 特殊カードが場に出た瞬間の全画面カットイン。対戦画面は render() のたびに
// 作り直されるので、この帯だけは #battle-app の外に置き、JSで出し入れする。
// 操作は一切受け取らない（pointer-events:none）。同時に2枚出た時は順番に流す。
const HOLD_MS = 2400;
let timer;
let showing = false;
const queue = [];

function hide() {
  const box = document.getElementById("battle-cutin");
  if (!box) return;
  box.hidden = true;
  box.classList.remove("playing");
}
function next() {
  const card = queue.shift();
  if (!card) {
    showing = false;
    hide();
    return;
  }
  showing = true;
  const special = specialCardById(card.character?.special);
  const box = document.getElementById("battle-cutin");
  if (!special || !box) {
    next();
    return;
  }
  const attr = ATTRIBUTES[card.character.attribute] || ATTRIBUTES.dark;
  box.style.setProperty("--cutin-color", attr.color);
  box.querySelector(".cutin-eyebrow").textContent = special.cutin.eyebrow;
  box.querySelector(".cutin-name").textContent = card.name;
  box.querySelector(".cutin-move").textContent = special.cutin.move;
  box.querySelector(".cutin-line").textContent = special.cutin.line;
  box.querySelector(".cutin-sigil").textContent = attr.symbol;
  const image = box.querySelector("img");
  if (image.getAttribute("src") !== card.image) image.src = card.image;
  image.alt = "";
  box.hidden = false;
  // 連続で出た時にアニメーションを頭からやり直す。
  box.classList.remove("playing");
  void box.offsetWidth;
  box.classList.add("playing");
  if (special.voice) effects.voice(special.voice, 0.85);
  clearTimeout(timer);
  timer = setTimeout(next, HOLD_MS);
}
export function clearCardCutIn() {
  clearTimeout(timer);
  queue.length = 0;
  showing = false;
  hide();
}
export function playCardCutIn(card) {
  if (!card || !specialCardById(card.character?.special)) return;
  queue.push(card);
  if (!showing) next();
}
// 場に出ているカードが特殊カードなら、登場の瞬間にカットインを出す。
export function announceArrival(state, side) {
  if (!state) return;
  playCardCutIn(state.teams[side]?.[state.active[side]]?.card);
}
