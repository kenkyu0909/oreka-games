import "./style.css";
import "./card-frame.css";
import { initBattleUI } from "./battle/ui.js";
import { ATTRIBUTES, STATS, FEATURES, drawFinish } from "./game.js";
import { moveTags } from "./moves.js";
import { MAX_BYTES } from "./limits.js";
import { createSample } from "./sample.js";
import { exportCard } from "./export.js";
import { effects } from "./effects.js";
import { initMobileGuide } from "./mobile.js";
import { awakenRareCard, clearAwakening } from "./spectacle.js";

initMobileGuide();

const $ = (id) => document.getElementById(id);
let current = null;
let previewUrl = null;
let sampleIndex = 0;
let processing = false;
let exporting = false;
const status = (message, error = false) => {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
};

function setBusy(value) {
  processing = value;
  $("upload-button").disabled = value;
  $("sample-button").disabled = value;
  $("download-button").disabled = value || exporting || !current;
  $("name-input").disabled = value;
  $("add-team-button").disabled = value || !current;
  $("card-shell").setAttribute("aria-busy", String(value));
}

function runAnalysis(buffer) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./analyze.worker.js", import.meta.url), {
      type: "module",
    });
    const finish = (error, value) => {
      clearTimeout(timeout);
      worker.terminate();
      error ? reject(error) : resolve(value);
    };
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            "解析に時間がかかりすぎました。画像を小さくしてお試しください。",
          ),
        ),
      25000,
    );
    worker.onmessage = ({ data }) =>
      finish(data.error ? new Error(data.error) : null, data);
    worker.onerror = () =>
      finish(
        new Error(
          "画像を解析できませんでした。別のJPEG・PNGをお試しください。",
        ),
      );
    worker.postMessage(buffer, [buffer]);
  });
}

function renderDetails(result) {
  const { character, fingerprint, sourceWidth, sourceHeight } = result;
  $("stats-grid").innerHTML = STATS.map(
    ([key, label, max, reason]) => `
    <div class="stat-item" title="${reason}"><div class="stat-top"><span>${label}</span><b>${character.stats[key]} <small>/ ${max}</small></b></div><div class="stat-track"><div class="stat-fill" style="width:${(character.stats[key] / max) * 100}%"></div></div></div>`,
  ).join("");
  $("moves-list").innerHTML = character.moves
    .map(
      (move) => `
    <article class="move-item ${move.rarity === "rare" ? "rare-move" : ""}"><div class="move-heading">${move.rarity === "rare" ? '<span class="rare-badge">レア</span>' : ""}<h3>${move.name}</h3><span class="move-category">${move.attribute ? ATTRIBUTES[move.attribute].label + " / " : ""}${move.category}</span><span class="move-pp">PP ${move.pp} / ${move.pp}</span></div><p><b>${moveTags(move).join(" / ")}</b> — ${move.text}</p><div class="move-values"><span>威力 <b>${move.power ?? "—"}${move.hits ? ` × ${move.hits}回` : ""}</b></span><span>命中 <b>${move.accuracy}%</b></span></div></article>`,
    )
    .join("");
  $("analysis-list").innerHTML =
    `<p class="analysis-meta">${sourceWidth.toLocaleString()} × ${sourceHeight.toLocaleString()} px · ${character.version}<br>写真ID：${fingerprint.slice(0, 16).toUpperCase()}<br>このIDは画像ファイルの識別用です。能力は色や形から算出しています。</p><div class="analysis-grid">${FEATURES.map(([key, label]) => `<div><div class="analysis-label"><span>${label}</span><span>${Math.round(character.features[key] / 10)} / 100</span></div><div class="stat-track"><div class="stat-fill" style="width:${character.features[key] / 10}%"></div></div></div>`).join("")}</div>`;
}

async function previewFromResult(result) {
  const canvas = document.createElement("canvas");
  canvas.width = result.width;
  canvas.height = result.height;
  canvas
    .getContext("2d")
    .putImageData(
      new ImageData(
        new Uint8ClampedArray(result.preview),
        result.width,
        result.height,
      ),
      0,
      0,
    );
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("カードの表示用画像を作れませんでした。");
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  return { url, image };
}

async function loadPhoto(file, sampleName = null) {
  if (!file || processing || exporting) return;
  if (!globalThis.crypto?.subtle) {
    status(
      "画像の解析にはHTTPS接続が必要です。HTTPSのプレビューURLから開いてください。",
      true,
    );
    return;
  }
  if (file.size > MAX_BYTES) {
    status("画像は12MB以下にしてください。", true);
    return;
  }
  if (!file.size) {
    status("空のファイルは読み込めません。JPEG・PNGを選んでください。", true);
    return;
  }
  clearAwakening();
  setBusy(true);
  status("写真の色と形を解析しています。画像は外部に送信されません。");
  try {
    const result = await runAnalysis(await file.arrayBuffer());
    const { url, image } = await previewFromResult(result);
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const finish = drawFinish(random[0] / 4294967296);
    const name =
      sampleName ||
      file.name.replace(/\.[^.]+$/, "").slice(0, 18) ||
      "名前のない切り札";
    const previousUrl = previewUrl;
    previewUrl = url;
    current = { ...result, image, finish, name };
    delete current.preview;
    const { character, fingerprint } = current;
    const attr = ATTRIBUTES[character.attribute];
    $("game-card").className = `game-card finish-${finish.id}`;
    $("game-card").style.setProperty("--attribute", attr.color);
    $("card-photo").src = url;
    $("card-photo").alt = sampleName
      ? `${sampleName}のサンプルイラスト`
      : "選択した写真から作成したカード";
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    $("photo-label").textContent = sampleName
      ? "SAMPLE IMAGE"
      : "YOUR ORIGINAL PHOTO";
    $("card-name").textContent = name;
    $("name-input").value = name;
    $("card-number").textContent =
      `NO. ${fingerprint.slice(0, 6).toUpperCase()}`;
    $("attribute-seal").textContent = attr.label;
    $("card-level").textContent =
      `LEVEL ${String(character.level).padStart(2, "0")} / 12`;
    $("card-attribute").textContent = `${attr.name} / ${attr.label}属性`;
    $("card-type").textContent = "同じ一枚から、変わらない個性。";
    const abbreviations = [
      "HP",
      "ATK",
      "DEF",
      "MAT",
      "MDF",
      "SPD",
      "CRT",
      "RES",
      "REC",
      "PEN",
    ];
    $("card-primary-stats").innerHTML = STATS.map(
      ([key], i) =>
        `<div><small>${abbreviations[i]}</small><b>${character.stats[key]}</b></div>`,
    ).join("");
    $("card-mini-moves").innerHTML = character.moves
      .map(
        (move) =>
          `<span class="${move.rarity === "rare" ? "rare-card-move" : ""}">${move.rarity === "rare" ? "★ " : ""}${move.name}<small>PP ${move.pp}</small></span>`,
      )
      .join("");
    $("card-shell").classList.remove("revealing");
    void $("card-shell").offsetWidth;
    if (effects.motion) $("card-shell").classList.add("revealing");
    if (document.body.dataset.view === "creator") {
      const rare = character.moves.find((m) => m.rarity === "rare");
      effects.play(rare ? "rare-reveal" : "reveal");
      awakenRareCard(character);
    }
    $("finish-label").textContent = finish.short;
    $("finish-name").textContent = finish.label;
    $("rule-label").textContent = character.version.toUpperCase();
    $("stage-caption").textContent =
      `${finish.label} · 輝きは能力に影響しません`;
    renderDetails(current);
    document.dispatchEvent(new CustomEvent("oreka-card-ready"));
    const rare = character.moves.find((m) => m.rarity === "rare");
    status(
      (sampleName
        ? "サンプルはオリジナルの図形イラストです。自分の写真でも試してみよう。"
        : "カードができました。元の写真は、再生成のために残しておいてください。") +
        (rare ? ` ★ レア技：${rare.name}` : ""),
    );
    return true;
  } catch (error) {
    status(
      error.message ||
        "画像を読み込めませんでした。別のJPEG・PNGをお試しください。",
      true,
    );
  } finally {
    setBusy(false);
  }
}

$("upload-button").addEventListener("click", () => $("photo-input").click());
$("photo-input").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  loadPhoto(file);
});
const dropZone = $("drop-zone");
["dragenter", "dragover"].forEach((type) =>
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    if (!processing) dropZone.classList.add("dragover");
  }),
);
["dragleave", "drop"].forEach((type) =>
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragover");
  }),
);
dropZone.addEventListener("drop", (event) => {
  const files = event.dataTransfer?.files;
  if (files?.length > 1) {
    status("一度に1枚の写真を選んでください。", true);
    return;
  }
  if (files?.length) loadPhoto(files[0]);
});
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

async function showSample() {
  if (processing || exporting) return;
  setBusy(true);
  try {
    const { file, name } = await createSample(sampleIndex++);
    setBusy(false);
    await loadPhoto(file, name);
  } catch {
    setBusy(false);
    status(
      "サンプルを読み込めませんでした。写真を選んでお試しください。",
      true,
    );
  }
}
$("sample-button").addEventListener("click", showSample);
$("name-input").addEventListener("input", () => {
  const name = $("name-input").value.trim() || "名前のない切り札";
  $("card-name").textContent = name;
  if (current) current.name = name;
});
$("download-button").addEventListener("click", async () => {
  if (!current || processing || exporting) return;
  exporting = true;
  $("download-button").disabled = true;
  $("upload-button").disabled = true;
  $("sample-button").disabled = true;
  try {
    await exportCard({ ...current, character: current.character });
    status(
      "カード画像を書き出しました。端末によっては画像を開いて保存してください。",
    );
  } catch {
    status("カード画像を書き出せませんでした。もう一度お試しください。", true);
  } finally {
    exporting = false;
    setBusy(false);
  }
});

$("creator-details-button").addEventListener("click", () => {
  effects.play("ui");
  $("creator-details").showModal();
});
$("close-creator-details").addEventListener("click", () =>
  $("creator-details").close(),
);
const tabs = Array.from(document.querySelectorAll("[data-tab]"));
function activateTab(tab, focus = false) {
  tabs.forEach((item) => {
    const active = item === tab;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
    item.tabIndex = active ? 0 : -1;
    $(`panel-${item.dataset.tab}`).hidden = !active;
  });
  if (focus) tab.focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => activateTab(tab));
  tab.addEventListener("keydown", (event) => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      next = (index + tabs.length - 1) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      activateTab(tabs[next], true);
    }
  });
});
function snapshotCard(result) {
  const canvas = document.createElement("canvas");
  const ratio = Math.min(
    1,
    280 / Math.max(result.image.naturalWidth, result.image.naturalHeight),
  );
  canvas.width = Math.max(1, Math.round(result.image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(result.image.naturalHeight * ratio));
  canvas
    .getContext("2d")
    .drawImage(result.image, 0, 0, canvas.width, canvas.height);
  return {
    name: result.name,
    character: structuredClone(result.character),
    finish: structuredClone(result.finish),
    fingerprint: result.fingerprint,
    image: canvas.toDataURL("image/jpeg", 0.78),
  };
}
initBattleUI({
  readCurrentCard: () =>
    current && !processing ? snapshotCard(current) : null,
  createSampleCard: async (index) => {
    const { file, name } = await createSample(index);
    const result = await runAnalysis(await file.arrayBuffer());
    const { url, image } = await previewFromResult(result);
    try {
      return snapshotCard({
        ...result,
        name,
        image,
        finish: drawFinish(
          crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296,
        ),
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  },
});
showSample();
