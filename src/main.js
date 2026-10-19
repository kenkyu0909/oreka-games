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

// カード生成シーン。解析中は「鋳造→量子化→特徴抽出」を進め、
// カードが届いたら「能力→技→輝き」を刻みながら部品を1つずつ組み上げる。
// 演出オフ・端末の動きを減らす設定では何もしない（通常表示のまま）。
const FORGE_STEPS = ["frame", "photo", "features", "stats", "moves", "finish"];
// 解析が一瞬で終わっても、前半の工程を必ず見せてから組み立てへ移る。
// 速すぎると何が起きたか分からないので、6工程を一通り目で追える長さにする。
const FORGE_LEAD_IN = 3300;
// 生成シーンは作成タブの中にある。ホームなど別のタブを見ている間に再生しても
// 誰にも見えないので、その場合は演出だけ後回しにして、作成タブを開いた時に見せる。
const forgeVisible = () => document.body.dataset.view === "creator";
let forgeTimers = [];
let forgeRun = 0;
let forgeStartedAt = 0;
let forgeCount = 0;
let forgeShown = false;
let forgePending = false;
let forgeRunning = false;
function forgeClear() {
  forgeTimers.forEach(clearTimeout);
  forgeTimers = [];
}
function forgeSceneStep(name, state) {
  if (state === "done") {
    const index = FORGE_STEPS.indexOf(name);
    if (index >= 0) forgeCount = Math.max(forgeCount, index + 1);
    $("forge-step-number").textContent = String(forgeCount).padStart(2, "0");
  }
  const step = document.querySelector(`[data-forge-step="${name}"]`);
  if (!step) return;
  step.dataset.state = state;
  step.querySelector("i").textContent =
    state === "done" ? "完了" : state === "active" ? "生成中" : "待機";
}
function forgeMeter(percent) {
  $("forge-meter-fill").style.width = `${percent}%`;
}
function forgeBegin() {
  forgeClear();
  const run = ++forgeRun;
  forgeStartedAt = performance.now();
  forgeCount = 0;
  forgePending = false;
  forgeRunning = true;
  $("forge-step-number").textContent = "00";
  document.querySelectorAll("[data-forge-step]").forEach((step) => {
    step.dataset.state = "idle";
    step.querySelector("i").textContent = "待機";
  });
  forgeMeter(0);
  $("card-shell").classList.remove("assembling");
  forgeShown = effects.motion && forgeVisible();
  if (!forgeShown) {
    $("forge-scene").hidden = true;
    return run;
  }
  forgePlay(run);
  return run;
}
// 前半の工程を刻みながらシーンを出す。
function forgePlay(run) {
  const scene = $("forge-scene");
  scene.hidden = false;
  const at = (ms, action) =>
    forgeTimers.push(
      setTimeout(() => {
        if (run === forgeRun) action();
      }, ms),
    );
  forgeSceneStep("frame", "active");
  at(840, () => {
    forgeSceneStep("frame", "done");
    forgeSceneStep("photo", "active");
    forgeMeter(20);
  });
  at(2100, () => {
    forgeSceneStep("photo", "done");
    forgeSceneStep("features", "active");
    forgeMeter(44);
  });
}
function forgeAssemble(run) {
  if (run !== forgeRun) return;
  if (!effects.motion) {
    forgeCancel(run);
    return;
  }
  // 見えていない間に出来上がった場合は、その場では再生せず、
  // 作成タブを開いた時に最初から見せ直す。
  if (!forgeShown || !forgeVisible()) {
    forgeCancel(run);
    forgePending = true;
    return;
  }
  // 解析が速すぎる場合は、前半の工程を見せる時間を残してから組み立てる。
  const wait = Math.max(0, FORGE_LEAD_IN - (performance.now() - forgeStartedAt));
  if (wait > 0) {
    forgeTimers.push(
      setTimeout(() => {
        if (run === forgeRun) forgeAssembleNow(run);
      }, wait),
    );
    return;
  }
  forgeAssembleNow(run);
}
function forgeAssembleNow(run) {
  if (run !== forgeRun) return;
  forgeClear();
  const scene = $("forge-scene");
  // 解析が速い場合はタイマーより先にここへ来るため、前半の工程をまとめて完了にする。
  ["frame", "photo", "features"].forEach((name) =>
    forgeSceneStep(name, "done"),
  );
  forgeSceneStep("stats", "active");
  forgeMeter(66);
  $("card-shell").classList.add("assembling");
  const at = (ms, action) =>
    forgeTimers.push(
      setTimeout(() => {
        if (run === forgeRun) action();
      }, ms),
    );
  at(930, () => {
    forgeSceneStep("stats", "done");
    forgeSceneStep("moves", "active");
  });
  at(1860, () => {
    forgeSceneStep("moves", "done");
    forgeSceneStep("finish", "active");
  });
  at(2790, () => {
    forgeSceneStep("finish", "done");
    forgeMeter(100);
  });
  at(4200, () => {
    $("card-shell").classList.remove("assembling");
    scene.hidden = true;
    forgeMeter(0);
    forgeRunning = false;
  });
}
function forgeCancel(run) {
  if (run !== undefined && run !== forgeRun) return;
  forgeClear();
  forgeRun += 1;
  forgeRunning = false;
  $("card-shell").classList.remove("assembling");
  $("forge-scene").hidden = true;
}
// 見えていなかった生成シーンは、作成タブを開いた時に見せ直す。
document.addEventListener("reframe-view", (event) => {
  if (event.detail?.view !== "creator" || !effects.motion) return;
  // 見えていない間に出来上がっていた分は、最初から再生する。
  if (forgePending) {
    forgePending = false;
    forgeAssemble(forgeBegin());
    return;
  }
  // まだ生成中の分は、そのまま続きを見せる。
  if (forgeRunning && !forgeShown) {
    forgeShown = true;
    forgePlay(forgeRun);
  }
});

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
  const forge = forgeBegin();
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
    forgeAssemble(forge);
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
    forgeCancel(forge);
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
