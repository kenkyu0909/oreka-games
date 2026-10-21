import "./style.css";
import "./card-frame.css";
import { initBattleUI } from "./battle/ui.js";
import { ATTRIBUTES, STATS, FEATURES, drawFinish, characterForCard } from "./game.js";
import { moveTags } from "./moves.js";
import { specialCardById } from "./special-cards.js";
import { MAX_BYTES } from "./limits.js";
import { createSample } from "./sample.js";
import { exportCard } from "./export.js";
import { effects } from "./effects.js";
import { playCardCutIn } from "./battle/cutin.js";
import { initMobileGuide } from "./mobile.js";
import {
  AWAKENING_MS,
  awakenRareCard,
  clearAwakening,
} from "./spectacle.js";

initMobileGuide();

const $ = (id) => document.getElementById(id);
// 写真を切り取らずに枠へ収めるため、余白に敷くぼかし背景へ同じ写真を渡す。
const photoFrame = document.querySelector(".photo-frame");
$("card-photo").addEventListener("load", () => {
  const image = $("card-photo");
  if (!image.naturalWidth || !image.naturalHeight) return;
  photoFrame.style.setProperty(
    "--photo-image",
    `url("${image.currentSrc || image.src}")`,
  );
});
let current = null;
let previewUrl = null;
// 写真を選んだだけの状態。名前を入れて「生成」を押すまでカードにはしない。
let pendingPhoto = null;
let pendingUrl = null;
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
  $("generate-button").disabled = value || !pendingPhoto;
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

function renderCardMoves(character) {
  $("card-mini-moves").innerHTML = character.moves
    .map(
      (move) =>
        `<span class="${move.rarity === "rare" ? "rare-card-move" : ""}${move.special ? " special-card-move" : ""}">${move.rarity === "rare" ? "★ " : move.special ? "◆ " : ""}${move.name}<small>PP ${move.pp}</small></span>`,
    )
    .join("");
}
// 特殊カードは名前で決まる。カードの見た目にもそれが分かる印を出す。
function renderSpecialMark(character) {
  const special = character.special ? specialCardById(character.special) : null;
  $("game-card").classList.toggle("is-special", !!special);
  $("card-type").textContent = special
    ? `特殊カード / ${special.cutin.move}`
    : "同じ一枚から、変わらない個性。";
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
    <article class="move-item ${move.rarity === "rare" ? "rare-move" : ""}${move.special ? " special-move" : ""}"><div class="move-heading">${move.rarity === "rare" ? '<span class="rare-badge">レア</span>' : ""}${move.special ? '<span class="special-badge">特殊</span>' : ""}<h3>${move.name}</h3><span class="move-category">${move.attribute ? ATTRIBUTES[move.attribute].label + " / " : ""}${move.category}</span><span class="move-pp">PP ${move.pp} / ${move.pp}</span></div><p><b>${moveTags(move).join(" / ")}</b> — ${move.text}</p><div class="move-values"><span>威力 <b>${move.power ?? "—"}${move.hits ? ` × ${move.hits}回` : ""}</b></span><span>命中 <b>${move.accuracy}%</b></span></div></article>`,
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
// 演出は常時オン。検証やテストで静かに進めたい時だけ motionOff で止める。
const FORGE_STEPS = ["frame", "photo", "features", "stats", "moves", "finish"];
// 1工程ぶんのリズム。生成中（FORGE_STEP_MS）→ 完了＝カードへ吸い込まれる
// （FORGE_JOIN_MS、style.css の forge-join-left/right と同じ長さ）→ 少し間を
// 置いて（FORGE_GAP_MS）次の工程へ。間を空けないと、どれが終わって次が
// 始まったのかを目で追えない。
const FORGE_STEP_MS = 650;
const FORGE_JOIN_MS = 950;
const FORGE_GAP_MS = 400;
const FORGE_NEXT_MS = FORGE_JOIN_MS + FORGE_GAP_MS;
const FORGE_RHYTHM_MS = FORGE_STEP_MS + FORGE_NEXT_MS;
// 解析が一瞬で終わっても、前半3工程（鋳造→量子化→特徴抽出）は必ず見せてから
// 組み立てへ移る。速すぎると何が起きたか分からない。
const FORGE_LEAD_IN = FORGE_STEP_MS * 3 + FORGE_NEXT_MS * 2;
// 「技を接続」でレア技が乗った時は、その告知が終わるまで最後の工程を待たせる。
// 告知は画面を覆うので、重ねると「輝きを決定」の工程が見えなくなる。
const FORGE_RARE_HOLD_MS = Math.max(0, AWAKENING_MS - FORGE_NEXT_MS);
// 今回の生成について、組み上がってから出すもの（仕上げの音・加工名・案内文）。
// 空のカードに結果だけ先に見えるのを避けるため、ここに溜めておく。
let forgeCard = null;
// 生成シーンは作成タブの中にある。ホームなど別のタブを見ている間に再生しても
// 誰にも見えないので、その場合は演出だけ後回しにして、作成タブを開いた時に見せる。
const forgeVisible = () => document.body.dataset.view === "creator";
let forgeTimers = [];
let forgeRun = 0;
let forgeStartedAt = 0;
let forgeShown = false;
let forgePending = false;
let forgeRunning = false;
function forgeClear() {
  forgeTimers.forEach(clearTimeout);
  forgeTimers = [];
}
// 途中で作り直された時のために、いまの生成のタイマーだけを動かす。
const forgeScheduler = (run) => (ms, action) =>
  forgeTimers.push(
    setTimeout(() => {
      if (run === forgeRun) action();
    }, ms),
  );
function forgeSceneStep(name, state) {
  const index = FORGE_STEPS.indexOf(name);
  if (state === "done" && index >= 0) forgeCardStep(index + 1);
  const step = document.querySelector(`[data-forge-step="${name}"]`);
  if (!step) return;
  step.dataset.state = state;
  step.querySelector("i").textContent =
    state === "done" ? "完了" : state === "active" ? "生成中" : "待機";
  forgeHud(name, state);
  if (state === "done") forgeSpark();
}
// 狭い画面では工程リストの代わりに、カード下のHUDで今の工程を示す。
// 文字をカードに重ねないため、状態はHUD側にだけ出す。
function forgeHud(name, state) {
  const hud = $("forge-hud");
  if (!hud) return;
  const index = FORGE_STEPS.indexOf(name);
  if (index >= 0) {
    $("forge-hud-index").textContent = String(index + 1).padStart(2, "0");
    $("forge-hud-name").textContent =
      document.querySelector(`[data-forge-step="${name}"] span`)
        ?.textContent ?? "";
  }
  hud.dataset.state = state;
  $("forge-hud-state").textContent =
    state === "done" ? "完了" : state === "active" ? "生成中" : "待機";
  const track = $("forge-hud-track");
  if (!track) return;
  document.querySelectorAll("[data-forge-step]").forEach((step, i) => {
    const segment = track.children[i];
    if (segment) segment.dataset.state = step.dataset.state || "idle";
  });
}
// 工程が終わった時、HUDからカードへ吸い込まれる光を飛ばす。
function forgeSpark() {
  const stage = document.querySelector(".card-stage");
  const hud = $("forge-hud");
  // 広い画面ではHUDを出していない（工程はカードの左右）ので、光も飛ばさない。
  if (!stage || !hud || getComputedStyle(hud).display === "none") return;
  for (let i = 0; i < 3; i += 1) {
    const spark = document.createElement("i");
    spark.className = "forge-spark";
    spark.style.setProperty("--dx", `${(i - 1) * 16}px`);
    spark.style.animationDelay = `${i * 70}ms`;
    stage.append(spark);
    spark.addEventListener("animationend", () => spark.remove(), {
      once: true,
    });
  }
}
// 生成中は空のカードから始め、工程が終わるたびに中身を1つずつ嵌める。
// ff-N は N番目の工程が終わった印（style.css 側でそのパーツを出す）。
function forgeCardStep(index) {
  const shell = $("card-shell");
  shell.classList.add("assembling");
  shell.classList.add(`ff-${index}`);
}
function forgeCardReset() {
  const shell = $("card-shell");
  shell.classList.remove("assembling");
  FORGE_STEPS.forEach((_, index) => shell.classList.remove(`ff-${index + 1}`));
}
function forgeBegin() {
  forgeClear();
  const run = ++forgeRun;
  forgeStartedAt = performance.now();
  forgePending = false;
  forgeRunning = true;
  document.querySelectorAll("[data-forge-step]").forEach((step) => {
    step.dataset.state = "idle";
    step.querySelector("i").textContent = "待機";
  });
  forgeHud(FORGE_STEPS[0], "idle");
  // 何も入っていない、枠だけのカードから始める。
  forgeCardReset();
  $("card-shell").classList.add("assembling");
  // 前のカードの結果（加工名や案内文）は、このカードのものではないので戻す。
  $("finish-name").textContent = "—";
  $("stage-caption").textContent = "能力は写真から。輝きは、運から。";
  forgeShown = effects.motion && forgeVisible();
  if (!forgeShown) {
    $("forge-scene").hidden = true;
    $("forge-hud").hidden = true;
    return run;
  }
  forgePlay(run);
  return run;
}
// 前半の工程を刻みながらシーンを出す。1工程ずつ、終わって間を置いてから次へ。
function forgePlay(run) {
  const scene = $("forge-scene");
  scene.hidden = false;
  $("forge-hud").hidden = false;
  const at = forgeScheduler(run);
  forgeSceneStep("frame", "active");
  at(FORGE_STEP_MS, () => forgeSceneStep("frame", "done"));
  at(FORGE_STEP_MS + FORGE_NEXT_MS, () => forgeSceneStep("photo", "active"));
  at(FORGE_STEP_MS * 2 + FORGE_NEXT_MS, () =>
    forgeSceneStep("photo", "done"),
  );
  at(FORGE_LEAD_IN - FORGE_STEP_MS, () =>
    forgeSceneStep("features", "active"),
  );
}
function forgeAssemble(run) {
  if (run !== forgeRun) return;
  if (!effects.motion) {
    // 演出なしの時は、シーンを挟まずその場で結果まで出す。
    forgeCancel(run);
    forgeComplete();
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
  const at = forgeScheduler(run);
  // 能力→技→輝きの順に、1工程ずつ間を空けて刻む。
  let elapsed = 0;
  for (const name of ["stats", "moves", "finish"]) {
    at(elapsed, () => forgeSceneStep(name, "active"));
    at(elapsed + FORGE_STEP_MS, () => {
      forgeSceneStep(name, "done");
      // レア技の告知は、その技が乗る「技を接続」の工程で出す。
      if (name === "moves") forgeAnnounceRare();
    });
    elapsed += FORGE_RHYTHM_MS;
    // 告知が画面を覆っている間は、最後の工程を待たせる。
    if (name === "moves" && forgeCard?.rare) elapsed += FORGE_RARE_HOLD_MS;
  }
  at(elapsed, () => {
    forgeCardReset();
    scene.hidden = true;
    $("forge-hud").hidden = true;
    forgeRunning = false;
    forgeComplete();
  });
}
// レア技が乗ったカードは、その技が組み込まれる工程で告知を出す。生成が
// 終わってから出すと、どの技の話だったのか分からなくなる。
function forgeAnnounceRare() {
  if (!forgeCard?.rare) return;
  forgeCard.announced = true;
  effects.play("rare-reveal");
  awakenRareCard(forgeCard.character);
}
// カードが組み上がった瞬間に出すもの（仕上げの音・加工名・案内文）。工程の
// 途中で出すと、まだ空のカードに結果だけが先に見えてしまう。
function forgeComplete() {
  const info = forgeCard;
  if (!info) return;
  forgeCard = null;
  effects.play(info.rare && !info.announced ? "rare-reveal" : "reveal");
  $("finish-name").textContent = info.finish.label;
  $("stage-caption").textContent =
    `${info.finish.label} · 輝きは能力に影響しません`;
  status(info.message);
  // 特殊カードの必殺技演出は、カードが組み上がったこの瞬間に一度だけ流す。
  if (info.character.special && effects.motion && forgeVisible())
    playCardCutIn({
      name: $("card-name").textContent,
      character: info.character,
      image: $("card-photo").getAttribute("src"),
    });
}
function forgeCancel(run) {
  if (run !== undefined && run !== forgeRun) return;
  forgeClear();
  forgeRun += 1;
  forgeRunning = false;
  forgeCardReset();
  $("forge-scene").hidden = true;
  $("forge-hud").hidden = true;
}
// 見えていなかった生成シーンは、作成タブを開いた時に見せ直す。
document.addEventListener("reframe-view", (event) => {
  if (event.detail?.view !== "creator" || !effects.motion) return;
  // 見えていない間に出来上がっていた分は、最初から再生する。
  if (forgePending) {
    forgePending = false;
    status("写真の解析が終わりました。カードを組み立てています。");
    forgeAssemble(forgeBegin());
    return;
  }
  // まだ生成中の分は、そのまま続きを見せる。
  if (forgeRunning && !forgeShown) {
    forgeShown = true;
    forgePlay(forgeRun);
  }
});

// 写真を選んだだけでは生成しない。プレビューと名前だけ用意して、
// 「この写真でカードを生成」で解析を始める。
function selectPhoto(file) {
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
  const url = URL.createObjectURL(file);
  const previousPending = pendingUrl;
  const previousCard = previewUrl;
  pendingPhoto = file;
  pendingUrl = url;
  previewUrl = null;
  current = null;
  const name =
    file.name.replace(/\.[^.]+$/, "").slice(0, 18) || "名前のない切り札";
  $("game-card").className = "game-card finish-normal";
  $("game-card").style.setProperty("--attribute", "#987253");
  $("card-photo").src = url;
  $("card-photo").alt = "選択した写真";
  $("card-shell").classList.remove("is-empty");
  $("card-shell").classList.add("is-pending");
  $("photo-label").textContent = "READY TO FORGE";
  $("card-name").textContent = name;
  $("name-input").value = name;
  $("card-number").textContent = "NO. —";
  $("attribute-seal").textContent = "✦";
  $("card-level").textContent = "LEVEL —";
  $("card-attribute").textContent = "PHOTO CARD";
  $("finish-label").textContent = "NORMAL";
  $("rule-label").textContent = "PHOTO-V3";
  $("card-primary-stats").innerHTML = "";
  $("card-mini-moves").innerHTML = "";
  $("stats-grid").innerHTML = "";
  $("moves-list").innerHTML = "";
  $("analysis-list").innerHTML = "";
  renderSpecialMark({});
  $("finish-name").textContent = "—";
  $("stage-caption").textContent = "能力は写真から。輝きは、運から。";
  if (previousPending) URL.revokeObjectURL(previousPending);
  if (previousCard) URL.revokeObjectURL(previousCard);
  // 生成ボタンだけを有効にし、チーム追加と保存は生成後まで待つ。
  $("generate-button").disabled = false;
  $("add-team-button").disabled = true;
  $("download-button").disabled = true;
  $("card-shell").setAttribute("aria-busy", "false");
  status("名前を確認して「この写真でカードを生成」を押してください。");
}

async function loadPhoto(file, sampleName = null, displayName = null) {
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
      displayName ||
      sampleName ||
      file.name.replace(/\.[^.]+$/, "").slice(0, 18) ||
      "名前のない切り札";
    const previousUrl = previewUrl;
    previewUrl = url;
    current = { ...result, image, finish, name };
    // 特殊カードは名前で技が決まる。名前は生成後に変えられるので、
    // 変更時にも同じ関数で作り直せるよう、ここで名前から能力を組み立てる。
    current.character = characterForCard(
      name,
      result.character.features,
      result.character.version,
    );
    delete current.preview;
    const { character, fingerprint } = current;
    const attr = ATTRIBUTES[character.attribute];
    $("game-card").className = `game-card finish-${finish.id}`;
    $("game-card").style.setProperty("--attribute", attr.color);
    $("card-photo").src = url;
    $("card-shell").classList.remove("is-empty", "is-pending");
    if (pendingUrl) {
      URL.revokeObjectURL(pendingUrl);
      pendingUrl = null;
    }
    pendingPhoto = null;
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
    renderSpecialMark(character);
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
    renderCardMoves(character);
    $("card-shell").classList.remove("revealing");
    void $("card-shell").offsetWidth;
    // 組み立てシーンが見えている間は、シーン側の ff-* が部品を嵌めていく。
    // カード全体を回して見せるアニメーションを重ねると、途中でカードが
    // ひとりでに回り出すので、シーンが無い時だけ出す。
    if (effects.motion && !forgeShown)
      $("card-shell").classList.add("revealing");
    $("finish-label").textContent = finish.short;
    $("rule-label").textContent = character.version.toUpperCase();
    renderDetails(current);
    const rare = character.moves.find((move) => move.rarity === "rare");
    const special = character.special ? specialCardById(character.special) : null;
    // 加工名・案内文・レア技の告知は、対応する工程で出す。組み上がる前に
    // 結果だけが見えると、何が起きたのか分からなくなる。
    forgeCard = {
      character,
      finish,
      rare,
      message:
        (sampleName
          ? "サンプルはオリジナルの図形イラストです。自分の写真でも試してみよう。"
          : "カードができました。元の写真は、再生成のために残しておいてください。") +
        (rare ? ` ★ レア技：${rare.name}` : "") +
        (special ? ` ◆ 特殊カード：${special.move.name}` : "") +
        (character.strongCpuOnly
          ? " ◆ CPU専用カード：ユーザー側では能力が1/10（技はそのまま）"
          : ""),
    };
    // 解析が終わってからカードが組み上がるまでの間も、案内文を工程に合わせる。
    if (forgeShown) status("写真の解析が終わりました。カードを組み立てています。");
    forgeAssemble(forge);
    document.dispatchEvent(new CustomEvent("oreka-card-ready"));
    return true;
  } catch (error) {
    forgeCard = null;
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
  selectPhoto(file);
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
  if (files?.length) selectPhoto(files[0]);
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
$("generate-button").addEventListener("click", async () => {
  if (!pendingPhoto || processing || exporting) return;
  const name = $("name-input").value.trim() || "名前のない切り札";
  await loadPhoto(pendingPhoto, null, name);
});
$("name-input").addEventListener("input", () => {
  const name = $("name-input").value.trim() || "名前のない切り札";
  $("card-name").textContent = name;
  if (!current) return;
  current.name = name;
  // 名前が特殊カードに変わった（戻った）時は、技と印をその場で組み直す。
  const next = characterForCard(
    name,
    current.character.features,
    current.character.version,
  );
  if ((next.special || null) === (current.character.special || null)) return;
  current.character = next;
  renderCardMoves(current.character);
  renderSpecialMark(current.character);
  renderDetails(current);
  effects.play(next.special ? "rare-reveal" : "ui");
  // 生成後に名前を特殊カードへ変えた場合も、同じ必殺技演出を見せる。
  if (next.special && effects.motion)
    playCardCutIn({
      name,
      character: next,
      image: $("card-photo").getAttribute("src"),
    });
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
