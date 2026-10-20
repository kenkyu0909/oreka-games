import { STATIC_HOSTING, ONLINE_UNAVAILABLE } from "../hosting.js";
import { RARE_MOVE_LIBRARY } from "../rare-moves.js";
import { ATTRIBUTES } from "../game.js";
import { moveSummary, moveCaution } from "../move-description.js";
import { moveTags } from "../moves.js";
import {
  activeFighter,
  recoveryAmount,
  availableActions,
  effectiveness,
  STATUS_LABELS,
  SECONDARY,
} from "./engine.js";
import { effects } from "../effects.js";
export const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const disabled = (value) => (value ? "disabled" : "");
export const difficultyNames = {
  easy: "おためし",
  normal: "ふつう",
  hard: "手ごわい",
};
export const stateFor = (model) => model.presentation || model.battle;
const percent = (f) => Math.max(0, (f.hp / f.card.character.stats.hp) * 100);
const movesDescription = (move) =>
  move.text +
  " " +
  moveCaution(move) +
  (move.id.endsWith("-wave")
    ? ` 追加効果：${STATUS_LABELS[SECONDARY[move.attribute]]}。`
    : "");
export function canChoose(model) {
  return (
    !!model.battle &&
    model.battle.phase !== "finished" &&
    availableActions(model.battle, model.side).some((a) => a.type !== "wait") &&
    !model.queued &&
    !model.busy &&
    !model.animating &&
    (model.mode === "cpu" ||
      (model.connected &&
        model.room?.connected?.every(Boolean) &&
        !model.room.ready?.[model.side]))
  );
}
export function renderLobby(model) {
  if (model.room)
    return `<section class="room-waiting"><div class="waiting-sigil">◇</div><p class="eyebrow">PRIVATE ROOM</p><h2>次の挑戦者を待っています。</h2><p>この合言葉を、対戦する友達へ。</p><strong class="room-code">${esc(model.room.code)}</strong><div class="room-actions"><button class="battle-primary" data-action="copy-room">招待リンクをコピー ↗</button><button class="battle-secondary" data-action="leave">部屋を閉じる</button></div><p class="battle-muted">2人用 / 待機時間は10分まで<br>相手が3体を選んで入室するとデュエル開始。</p></section>`;
  return `<header class="battle-page-heading"><div><p class="eyebrow">${model.view === "team" ? "DECK CONSTRUCTION" : "DUEL GATE"} <span>/ 02</span></p><h1>${model.view === "team" ? "3枚の、切り札。" : "次の一手が、勝負を決める。"}</h1><p>先発を選び、3体の個性をひとつの戦略に。</p></div><div class="session-record"><b>${model.results.wins}</b><span>WIN <small>${model.results.losses} LOSE / ${model.results.draws} DRAW</small></span></div></header><div class="lobby-layout"><section class="team-panel"><div class="party-heading"><h3>あなたのデッキ <span>${model.party.length} / 3</span></h3><span>先発 → 控え</span></div><div class="party-grid">${Array.from(
    { length: 3 },
    (_, i) => {
      const card = model.party[i];
      return card
        ? `<article class="party-card finish-${esc(card.finish.id)}" style="--attribute:${ATTRIBUTES[card.character.attribute].color}"><div class="party-card-heading"><span class="party-order">${i === 0 ? "先発" : `控え ${i}`}</span><span>${ATTRIBUTES[card.character.attribute].label} / Lv.${card.character.level}</span></div><img src="${esc(card.image)}" alt="${esc(card.name)}"><div class="party-card-info"><h4>${esc(card.name)}</h4><p><span>HP <b>${card.character.stats.hp}</b></span><span>ATK <b>${card.character.stats.attack}</b></span><span>SPD <b>${card.character.stats.speed}</b></span></p><small>${esc(card.finish.short)}</small></div><div class="party-tools"><button data-action="lead" data-index="${i}" ${disabled(i === 0 || model.busy || model.netBusy)}>先発にする</button><button data-action="remove" data-index="${i}" ${disabled(model.busy || model.netBusy)} aria-label="${esc(card.name)}を外す">外す</button></div></article>`
        : `<button class="party-empty" data-action="creator" ${disabled(model.busy)}><span class="empty-frame">＋</span><b>カードを追加</b><small>SLOT ${String(i + 1).padStart(2, "0")}</small></button>`;
    },
  ).join(
    "",
  )}</div><div class="team-actions"><button class="battle-secondary" data-action="samples" ${disabled(model.busy || model.netBusy)}>サンプル3体をセット</button><button class="text-button" data-action="creator" ${disabled(model.busy)}>写真からカードをつくる ↗</button></div><p class="battle-muted">編成はこのタブのみ。元の写真は手元に残してください。</p><div class="deck-tip"><span>◇</span><p>レベルは、強さのすべてじゃない。<br><small>低レベルを活かす技も、相性を覆す交代もある。</small></p></div></section><aside class="match-panel"><div class="mode-selector" aria-label="対戦モード"><button data-action="mode" data-mode="cpu" class="${model.mode === "cpu" ? "active" : ""}" ${disabled(model.netBusy)}>CPU対戦</button><button data-action="mode" data-mode="online" class="${model.mode === "online" ? "active" : ""}" ${disabled(model.netBusy)}>友達と対戦</button></div>${
    model.mode === "cpu"
      ? `<p class="mini-label">SOLO DUEL</p><h3>その戦略を、試せ。</h3><label class="field-label" for="cpu-difficulty">CPUの強さ</label><select id="cpu-difficulty">${Object.entries(
          difficultyNames,
        )
          .map(
            ([key, label]) =>
              `<option value="${key}" ${model.difficulty === key ? "selected" : ""}>${label}</option>`,
          )
          .join(
            "",
          )}</select><p class="difficulty-hint">能力は同じ。技・回復・交代の判断で強さが変わります。</p><button class="battle-primary" data-action="start-cpu" ${disabled(model.party.length !== 3 || model.busy)}>このデッキで挑む <span>→</span></button><button class="battle-secondary quick-start" data-action="quick-cpu" ${disabled(model.busy)}>写真なしで今すぐ試す</button><details class="test-settings"><summary>テスト設定 <span>＋</span></summary><label for="battle-seed">乱数シード（空欄ならランダム）</label><input id="battle-seed" inputmode="numeric" maxlength="10" placeholder="例：12345" value="${esc(model.seedInput)}"><p>同じ編成・行動・シードで展開を再現。</p></details>`
      : STATIC_HOSTING
        ? `<p class="mini-label">GITHUB PAGES / SOLO EDITION</p><h3>この公開版はCPU対戦用です。</h3><p class="share-notice">${ONLINE_UNAVAILABLE}</p><button class="battle-primary" data-action="mode" data-mode="cpu">CPU対戦へ →</button>`
        : `<p class="mini-label">FRIEND DUEL</p><h3>友達と、真剣勝負。</h3><p class="share-notice">入室すると、写真・能力・技を相手に共有します。一般公開はせず、ルーム終了後に破棄します。</p><button class="battle-primary" data-action="create-room" ${disabled(model.party.length !== 3 || model.busy || model.netBusy)}>部屋をつくる <span>＋</span></button><div class="join-room"><label for="room-code-input">友達の合言葉</label><div><input id="room-code-input" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="6" value="${esc(model.roomInput)}" placeholder="ABC234"><button class="battle-secondary" data-action="join-room" ${disabled(model.party.length !== 3 || model.busy || model.netBusy)}>入室 →</button></div></div><p class="battle-muted">選択120秒 / 切断時は90秒まで復帰可能</p>`
  }</aside></div><div class="lobby-bottom"><span>3 CARDS <i>×</i> 4 SKILLS <i>×</i> YOUR STRATEGY</span><button class="text-button" data-action="rules">ルールと属性相性 ↗</button></div>`;
}
function miniRoster(model, side) {
  const state = stateFor(model);
  return `<div class="mini-roster" aria-label="残り${state.teams[side].filter((f) => f.hp > 0).length}体">${state.teams[side].map((f, index) => `<span class="roster-chip ${state.active[side] === index ? "active" : ""} ${f.hp === 0 ? "is-out" : ""}" aria-hidden="true">◆</span>`).join("")}</div>`;
}
function fighterHTML(model, side, own) {
  const state = stateFor(model),
    f = activeFighter(state, side),
    card = f.card,
    attr = ATTRIBUTES[card.character.attribute],
    event = model.effect;
  const effectClass =
    effects.motion && !model.fast && event?.side === side
      ? ` effect-${event.kind}`
      : "";
  return `<article class="fighter ${own ? "own" : "opponent"} ${f.hp === 0 ? "fainted" : ""}${effectClass}${model.playback?.actor === side ? " is-acting" : ""}" data-side="${side}" style="--attribute:${attr.color}"><div class="duel-card finish-${esc(card.finish?.id || "normal")}" aria-label="${esc(card.name)}の対戦カード"><div class="arcade-corner" aria-hidden="true"></div><div class="duel-card-heading"><h3>${esc(card.name)}</h3></div><span class="arcade-crest" aria-label="${attr.label}属性">${attr.label}</span><div class="fighter-image"><img src="${esc(card.image)}" alt="${esc(card.name)}"></div></div><div class="fighter-hud"><div class="fighter-top"><span>${own ? "YOU" : model.mode === "cpu" ? "CPU" : "FRIEND"} <small class="fighter-level">Lv.${card.character.level}</small></span>${miniRoster(model, side)}</div><strong class="fighter-hud-name">${esc(card.name)}</strong><div class="fighter-hp"><b>${f.hp}</b><span>/ ${card.character.stats.hp} HP</span>${f.status ? `<span class="status-pill">${STATUS_LABELS[f.status]}</span>` : ""}</div><div class="hp-track"><div class="hp-fill ${percent(f) < 25 ? "danger" : percent(f) < 50 ? "warning" : ""}" style="width:${percent(f)}%"></div></div>${f.attackBonus || f.specialAttackBonus ? `<div class="fighter-boost" title="破壊したカードの攻撃と特攻を吸収した分">ATK <b>+${f.attackBonus || 0}</b><i>·</i>MAT <b>+${f.specialAttackBonus || 0}</b></div>` : ""}</div>${event?.kind === "damage" && event.side === side ? `<span class="damage-popup">−${event.amount}${event.totalHits ? `<small>${event.hit} / ${event.totalHits} HIT</small>` : ""}</span>` : ""}${event?.kind === "heal" && event.side === side ? `<span class="damage-popup heal-popup">＋${event.amount}</span>` : ""}</article>`;
}
function benchHTML(model) {
  const state = stateFor(model),
    side = model.side;
  return `<div class="bench own-bench">${state.teams[side].map((f, index) => `<button class="bench-card ${index === state.active[side] ? "is-active" : ""} ${f.hp === 0 ? "is-out" : ""}" data-action="switch" data-index="${index}" ${disabled(!canChoose(model) || !availableActions(model.battle, side).some((a) => a.type === "switch" && a.index === index))}><img src="${esc(f.card.image)}" alt=""><div><span>${esc(f.card.name)}</span><small>${f.hp === 0 ? "戦闘不能" : `${f.hp}/${f.card.character.stats.hp} HP`}</small></div><b>${f.hp === 0 ? "×" : index === state.active[side] ? "出場中" : "交代 →"}</b></button>`).join("")}</div>`;
}
function effectHTML(model) {
  const event = model.effect;
  if (!event || !effects.motion || model.fast) return "";
  const state = stateFor(model),
    own = event.side === model.side;
  const card = activeFighter(state, event.side ?? 0).card;
  const symbols = {
    fire: "炎",
    water: "水",
    wind: "風",
    earth: "地",
    light: "光",
    dark: "闇",
  };
  if (event.kind === "finish")
    return `<div class="finisher-cut" aria-hidden="true"><strong>${event.draw ? "DOUBLE BREAK" : "FINAL BREAK"}</strong><small>${event.draw ? "相討ち" : "決着の一撃"}</small>${Array.from({ length: 12 }, (_, i) => `<span style="--i:${i}"></span>`).join("")}</div>`;
  if (event.kind === "charge")
    return `<div class="skill-cutin ${event.rarity === "rare" ? "is-rare" : ""}${event.special ? " is-special" : ""} ${own ? "from-own" : "from-enemy"}" aria-hidden="true"><img src="${esc(card.image)}" alt=""><div><small>${event.special ? "SPECIAL / " : event.rarity === "rare" ? "★ RARE / " : ""}${own ? "YOUR" : "ENEMY"} SKILL / ${esc(event.category)}</small><strong>${esc(event.name)}</strong><span>${esc(card.name)} <i>── 発動</i></span></div><b>${symbols[event.attribute] || "✦"}</b></div>`;
  if (event.kind === "destroy")
    return `<div class="vfx-destroy target-${own ? "own" : "enemy"}" aria-hidden="true"><span></span><b>DESTROY</b>${Array.from({ length: 10 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>`;
  if (event.kind === "strike")
    return `<div class="vfx-flight ${own ? "from-own" : "from-enemy"} element-${esc(event.attribute || "neutral")}" aria-hidden="true"><div class="vfx-orb"></div><div class="vfx-slash"></div>${Array.from({ length: 9 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div><div class="action-caption" aria-hidden="true">${esc(event.name)}</div>`;
  if (event.kind === "critical")
    return '<div class="critical-cut" aria-hidden="true">CRITICAL HIT</div>';
  if (
    [
      "damage",
      "heal",
      "guard",
      "buff",
      "debuff",
      "status",
      "cleanse",
      "heal-cast",
      "switch",
      "knockout",
      "miss",
    ].includes(event.kind)
  )
    return `<div class="vfx-impact target-${own ? "own" : "enemy"} impact-${event.kind}" aria-hidden="true"><i></i><i></i><i></i><b>${event.kind === "miss" ? "MISS" : ["guard", "buff"].includes(event.kind) ? "↑" : event.kind === "debuff" ? "↓" : event.kind === "cleanse" ? "浄化" : event.kind === "status" ? esc(STATUS_LABELS[event.status]) : event.kind.startsWith("heal") ? "＋" : event.kind === "knockout" ? "BREAK" : "✦"}</b>${Array.from({ length: 8 }, (_, i) => `<span style="--i:${i}"></span>`).join("")}</div>`;
  return "";
}
export function renderBattle(model) {
  const state = stateFor(model),
    me = model.side,
    own = activeFighter(state, me),
    target = activeFighter(state, 1 - me),
    finished = state.phase === "finished";
  const switching = state.phase === "replace" || model.command === "switch";
  const actingSide = model.playback?.actor;
  const mine = actingSide === me;
  const committed = model.mode === "online" && model.room?.ready?.[me];
  let prompt = finished
    ? "デュエル終了"
    : model.animating
      ? "決定した行動を、1体ずつ順に再生しています。"
      : state.phase === "replace"
        ? own.hp === 0 && !committed
          ? "次に出すカードを選んでください。"
          : "相手の交代を待っています。"
        : committed
          ? "決定済み。相手の決定を待っています…"
          : "技を押して決定。両者の決定後に攻撃します。";
  if (model.busy && !model.animating)
    prompt =
      model.mode === "cpu"
        ? "両者の行動が決定。攻撃を開始します…"
        : "決定を送信しています…";
  if (
    model.mode === "online" &&
    (!model.connected || !model.room?.connected.every(Boolean))
  )
    prompt = "再接続を待っています。選択は一時停止中です。";
  const turnTitle = finished
    ? "DUEL COMPLETE"
    : model.animating
      ? model.playback?.phase === "handoff"
        ? "次の行動へ"
        : model.playback?.phase === "status"
          ? "ターン終了時の効果"
          : `${model.playback?.index === 1 ? "先攻" : "後攻"}：${mine ? "あなた" : "相手"}`
      : committed
        ? "LOCKED IN"
        : state.phase === "replace"
          ? "CHANGE CARD"
          : "SELECT ACTION";
  const turnText = finished
    ? "対戦終了"
    : model.animating
      ? model.playback?.phase === "handoff"
        ? "先の行動が完了"
        : model.playback?.phase === "status"
          ? "状態異常の処理"
          : esc(model.playback?.name || "行動を再生中")
      : committed
        ? "相手の決定待ち"
        : state.phase === "replace"
          ? "カードを補充"
          : "両者が選択 → 素早さ順";
  const nextText =
    model.animating && model.playback?.order.length
      ? model.playback.order
          .map((side, i) => `${i + 1} ${side === me ? "あなた" : "相手"}`)
          .join(" → ")
      : "";
  const result =
    state.winner === "draw"
      ? "DRAW"
      : state.winner === me
        ? "VICTORY"
        : "DEFEAT";
  const resultText =
    state.winner === "draw"
      ? "互角の決闘。次こそ、決着を。"
      : state.winner === me
        ? "その一手が、運命を変えた。"
        : "次の一手は、まだ終わらない。";
  const reasons = {
    knockout: "全滅による決着",
    surrender: "降参による決着",
    "turn-limit": "60ターン判定",
    timeout: "時間切れ",
    disconnect: "切断による決着",
    left: "退室による決着",
  };
  return `<header class="battle-topline"><span class="match-badge">${model.mode === "cpu" ? `CPU <i>/ ${difficultyNames[model.difficulty]}</i>` : `ROOM <i>${esc(model.room?.code || "—")}</i>`}</span><span class="turn-indicator">TURN <b>${state.turn}</b><small>/ 60</small></span><div class="battle-top-tools"><span id="battle-clock" class="battle-clock">${model.mode === "cpu" ? `SEED ${model.seed}` : ""}</span><button data-action="rules" aria-label="ルールと属性相性">?</button><button data-action="options" aria-label="対戦メニュー">☰</button></div></header><div class="arena-stage ${model.animating ? "is-resolving" : ""}" data-actor="${model.animating && actingSide != null ? (mine ? "own" : "opponent") : "both"}" data-action-number="${model.playback?.index || 0}" data-phase="${model.playback?.phase || "select"}" data-motion="${effects.motion && !model.fast}" data-sequence="${state.sequence}" data-effect="${esc(model.effect?.kind || "none")}" style="--effect-color:${ATTRIBUTES[model.effect?.attribute]?.color || "#ee354c"}"><div class="turn-ribbon ${mine ? "your-turn" : "enemy-turn"}" role="status"><b>${turnTitle}</b><span>${turnText}</span><small>${finished ? "" : nextText}</small></div><div class="field-geometry" aria-hidden="true"><div class="field-ring"></div><div class="field-diamond"></div><span>RE:FRAME<small>DUEL FIELD</small></span></div><span class="field-corner corner-one"></span><span class="field-corner corner-two"></span>${fighterHTML(model, 1 - me, false)}${fighterHTML(model, me, true)}${effectHTML(model)}<div class="field-divider"><span>OPPONENT</span><i></i><span>YOUR FIELD</span></div></div><section class="battle-message" aria-live="polite" aria-atomic="true"><span class="message-diamond">◆</span><div><small>${model.animating ? "ACTION" : "BATTLE LOG"}</small><p id="latest-event">${esc(model.latest || "デュエル開始。あなたの一手で、運命を変えろ。")}</p></div><button data-action="history">履歴 <span>↗</span></button></section><section class="command-panel"><div class="command-toolbar"><div role="group" aria-label="行動の種類"><button class="${!switching ? "active" : ""}" data-action="command" data-command="moves" ${disabled(state.phase === "replace" || finished)} aria-pressed="${!switching}">技を選ぶ <span>04</span></button><button class="${switching ? "active" : ""}" data-action="command" data-command="switch" ${disabled(finished)} aria-pressed="${switching}">交代 <span>03</span></button></div><button class="text-button" data-action="moves">技の詳細 ↗</button></div>${!finished ? (switching ? benchHTML(model) : `<div class="move-buttons">${own.card.character.moves.map((move, index) => `<button class="battle-move ${move.rarity === "rare" ? "rare-skill" : ""}${move.special ? " special-skill" : ""}" data-action="move" data-index="${index}" ${disabled(!canChoose(model) || own.pp[index] === 0)} aria-label="${move.rarity === "rare" ? "レア技、" : ""}${move.special ? "特殊技、" : ""}${esc(move.name)}、威力 ${move.power ?? "—"}${move.hits ? `×${move.hits}` : ""}、PP ${own.pp[index]}、${esc(movesDescription(move))}"><span class="move-index">${String(index + 1).padStart(2, "0")}</span><div><div class="move-button-heading">${move.rarity === "rare" ? '<span class="rare-badge">レア</span>' : ""}${move.special ? '<span class="special-badge">特殊</span>' : ""}<b>${esc(move.name)}</b></div><div class="move-button-numbers"><span class="move-base-power"><small>威力</small> ${move.power ?? "—"}${move.hits ? `×${move.hits}` : ""}</span><span class="move-current-pp">PP ${own.pp[index]}/${move.pp}</span></div><div class="move-button-meta"><span>${move.attribute ? ATTRIBUTES[move.attribute].label + " / " : ""}${move.category} · 命中${move.accuracy}%</span></div><p class="move-explanation">${esc(move.rules === 2 ? moveSummary(move, move.healScale ? Math.max(0, Math.floor(recoveryAmount(own) * move.healScale)) : null) : movesDescription(move))}</p></div></button>`).join("")}</div>${own.pp.every((p) => p === 0) ? `<button class="struggle-button battle-primary" data-action="struggle" ${disabled(!canChoose(model))}>最後の一撃（威力45・反動あり）</button>` : ""}`) : '<div class="end-command"><span>DUEL COMPLETE</span><p>新しい写真、新しい戦略。次のデュエルへ。</p></div>'}<div class="command-bottom"><p class="battle-prompt" aria-live="polite">${esc(prompt)}</p><div>${!finished && model.mode === "cpu" ? `<button class="auto-button ${model.auto ? "enabled" : ""}" data-action="auto">${model.auto ? "■ おまかせ停止" : "▷ おまかせ"}</button><label class="fast-toggle"><input id="fast-battle" type="checkbox" ${model.fast ? "checked" : ""}>テンポ速め</label>` : ""}${model.animating ? '<button class="skip-button" data-action="skip-animation">演出スキップ ≫</button>' : ""}</div></div></section>${finished ? `<section class="result-banner ${state.winner === me ? "won" : ""}" role="status"><span class="result-ornament">◇</span><p>${result}</p><h2>${resultText}</h2><span>${reasons[state.reason] || "デュエル終了"} · ${state.turn}ターン</span><div class="result-lineup" aria-label="あなたのデッキと決着時の先発">${state.teams[me].map((f, i) => `<img src="${esc(f.card.image)}" alt="${esc(f.card.name)}${i === state.active[me] ? "（決着時の先発）" : ""}" class="${i === state.active[me] ? "is-active" : ""}">`).join("")}</div><div class="result-actions">${model.mode === "cpu" ? '<button class="battle-primary" data-action="rematch">同じ条件でもう一度 →</button>' : ""}<button class="battle-secondary" data-action="back-lobby">編成に戻る</button><button class="text-button" data-action="download-log">戦闘ログを保存 ↓</button></div></section>` : ""}`;
}
export function rulesHTML() {
  const keys = Object.keys(ATTRIBUTES);
  return `<div class="rules-content"><h3>3枚のカードで、勝利をつかめ。</h3><p>両者が技または交代を選び、決定がそろってから行動します。先制技は通常技より先。その中でターン開始時の素早さ順、同速は抽選。攻撃の演出は1体ずつ順に再生します。交代は技より先で、1行動を使います。先に倒されたカードは行動せず、補充は無料です。対戦画面では能力値や相手の技一覧は表示しません。</p><p>レベルは技の条件にのみ使用。基本急所率4〜20%。急所技は＋25、レア技では最大＋40ポイント（上限60%）。基本貫通は最大35%、貫通技は残る防御をさらに40〜60%無視します。</p><div class="type-table-wrap"><table class="type-table"><caption>行：攻撃する属性 / 列：受ける属性</caption><thead><tr><th>攻撃 ↓</th>${keys.map((k) => `<th>${ATTRIBUTES[k].label}</th>`).join("")}</tr></thead><tbody>${keys.map((a) => `<tr><th>${ATTRIBUTES[a].label}</th>${keys.map((d) => `<td class="${effectiveness(a, d) > 1 ? "super" : effectiveness(a, d) < 1 ? "resist" : ""}">${effectiveness(a, d)}</td>`).join("")}</tr>`).join("")}</tbody></table></div><h3>写真ごとに違う4つの技</h3><p>新しいphoto-v3では通常48技に加え、強力なレア技20種を追加。特徴値からの固定抽選で約5%のカードの4枠目に1技だけ入ります。同じ写真の再読み込み・キラ加工の再抽選では変わりません。最大2〜3PPなので使いどころが重要です。生成済みのv1/v2カードは旧技を維持します。</p><p>photo-v2では48種類から重複なしで4つを選びます。同じ属性でも技は固定ではなく、別属性の技も覚えます。連撃は技全体で命中判定1回・PP消費1、急所は各打撃で判定。吸収は実際に削ったHPと回復力で回復、反動は相手を倒しても発生します。</p><h3>状態異常と強化</h3><p>状態異常の基本確率は技の説明に記載し、相手の耐性で軽減。一度に1種類まで。場にいる3ターン（付与したターンを含む）で治り、控えでは効果・時間とも停止。浄化技なら回復封印も先に解除できます。</p><ul><li>やけど：物理ダメージ×0.75、毎ターンHP1/16減少。</li><li>毒：毎ターンHP1/10減少。</li><li>鈍足：素早さ半分。</li><li>回復封印：回復技・吸収によるHP回復を無効化。</li></ul><p>物理/特殊の攻撃・防御と素早さは−6〜＋6段階、交代で強化・弱体とも解除。素早さ変化は次ターンから順序に反映。全PP切れでは反動付き「最後の一撃」。60ターンで生存数、次に残りHP割合で判定します。旧photo-v1の波動技は従来の追加効果を維持します。</p><h3>特殊カード</h3><p>カード名を「破滅竜ガンドラX」にすると、4枠目が確定の後攻技「デストロイ・ギガ・レイズ」に変わる。技は自分の控えと相手の場のカードをすべて破壊し、破壊したカードの攻撃と特攻の合計を自分の攻撃・特攻に加える。能力値とほかの3技は写真から決まる。場に出た瞬間はカットインと登録音声が入る（♪がオンの時）。</p><h3>レア技・全20種</h3><div class="rare-catalog">${RARE_MOVE_LIBRARY.map((move) => `<article><h4><span class="rare-badge">レア</span> ${move.name}</h4><p>${move.attribute ? ATTRIBUTES[move.attribute].label : "無"} / ${move.category} · 威力 ${move.power ?? "—"}${move.hits ? `×${move.hits}` : ""} · 命中${move.accuracy}% · PP${move.pp}</p><p>${move.text}</p></article>`).join("")}</div><p>効果音は右上の♪で切替。✦で演出をオフにできます。端末の「視差効果を減らす」設定も尊重します。</p></div>`;
}
function movesHTML(fighter) {
  return `<div class="sheet-moves">${fighter.card.character.moves.map((move, index) => `<article class="move-item ${move.rarity === "rare" ? "rare-move" : ""}${move.special ? " special-move" : ""}"><div class="move-heading">${move.rarity === "rare" ? '<span class="rare-badge">レア</span>' : ""}${move.special ? '<span class="special-badge">特殊</span>' : ""}<h3>${esc(move.name)}</h3><span class="move-category">${move.category}</span><span class="move-pp">PP ${fighter.pp[index]}/${move.pp}</span></div><p><b>${moveTags(move).join(" / ")}</b> — ${esc(movesDescription(move))}</p><div class="move-values"><span>威力 ${move.power ?? "—"}${move.hits ? ` × ${move.hits}回` : ""}</span><span>命中 ${move.accuracy}%</span></div></article>`).join("")}</div>`;
}
export function renderModal(model) {
  if (model.confirm)
    return `<dialog id="battle-confirm" class="detail-dialog confirm-dialog" aria-labelledby="confirm-title"><h2 id="confirm-title">${model.confirm === "surrender" ? "このデュエルを降参しますか？" : "ルームから退室しますか？"}</h2><p>対戦中の終了は敗北になります。編成はこのタブに残ります。</p><div><button class="battle-secondary" data-action="cancel-exit" autofocus>対戦を続ける</button><button class="battle-primary" data-action="confirm-exit">${model.confirm === "surrender" ? "降参する" : "退室する"}</button></div></dialog>`;
  if (!model.sheet) return "";
  const state = model.battle;
  let title = "",
    content = "",
    eyebrow = "DUEL DATA";
  if (model.sheet === "history") {
    title = "デュエルの軌跡";
    eyebrow = "BATTLE HISTORY";
    content = `<ol id="battle-log-list" class="history-list">${state.log.map((entry) => `<li class="${entry.text.startsWith("──") ? "log-turn" : ""}"><span>${String(entry.turn).padStart(2, "0")}</span><p>${esc(entry.text)}</p></li>`).join("")}</ol><button class="battle-secondary" data-action="download-log">全ログを保存 ↓</button>`;
  } else if (model.sheet === "rules") {
    title = "ルールと属性相性";
    eyebrow = "DUEL RULES";
    content = rulesHTML();
  } else if (model.sheet === "options") {
    title = "対戦メニュー";
    eyebrow = "DUEL OPTIONS";
    content = `<div class="options-grid"><button class="outline-button" data-action="sound">効果音 <b>${effects.sound ? "ON" : "OFF"}</b></button><button class="outline-button" data-action="history">ログ履歴 ↗</button><button class="outline-button" data-action="rules">ルール・相性 ↗</button>${state?.phase !== "finished" ? '<button class="battle-secondary" data-action="surrender">降参する</button>' : ""}${model.mode === "online" ? '<button class="battle-secondary" data-action="leave">退室する</button>' : ""}</div><p class="panel-note">${model.mode === "cpu" ? `乱数シード：${model.seed} / ${difficultyNames[model.difficulty]}` : "接続が切れた場合は90秒まで復帰できます。"}<br>効果音は合成音です。初期設定はオフ。端末の音量にもご注意ください。</p>`;
  } else if (model.sheet === "moves") {
    title = "4つの技を見極める";
    eyebrow = "SKILL DATA";
    content = movesHTML(activeFighter(state, model.side));
  }
  return `<dialog id="battle-sheet" class="detail-dialog" aria-labelledby="sheet-title"><header class="dialog-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h2 id="sheet-title">${esc(title)}</h2></div><button class="close-button" data-action="close-sheet" aria-label="詳細を閉じる" autofocus>×</button></header><div class="sheet-body">${content}</div></dialog>`;
}
