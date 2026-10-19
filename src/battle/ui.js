import "./battle.css";
import "./readability.css";
import { STATIC_HOSTING, ONLINE_UNAVAILABLE } from "../hosting.js";
import {
  createBattle,
  resolveTurn,
  activeFighter,
  finishBattle,
  publicState,
} from "./engine.js";
import { chooseCpuAction } from "./cpu.js";
import { makeCpuTeam, seededRandom } from "./presets.js";
import { RoomConnection, savedSession } from "./network.js";
import { wireTeam } from "./protocol.js";
import { effects } from "../effects.js";
import { isFinalKnockout } from "./highlights.js";
import {
  renderLobby,
  renderBattle,
  renderModal,
  canChoose as viewCanChoose,
} from "./view.js";

const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const $ = (id) => document.getElementById(id);
export function initBattleUI({ readCurrentCard, createSampleCard }) {
  const root = $("battle-app");
  const model = {
    view: "home",
    command: "moves",
    sheet: null,
    sheetSide: 0,
    sheetIndex: 0,
    queued: 0,
    animating: false,
    presentation: null,
    playback: null,
    effect: null,
    latest: "",
    party: [],
    mode: "cpu",
    difficulty: "normal",
    seedInput: "",
    seed: 1,
    battle: null,
    enemy: null,
    busy: false,
    auto: false,
    fast: false,
    confirm: null,
    error: "",
    notice: "",
    room: null,
    side: 0,
    connected: false,
    netBusy: false,
    connection: null,
    roomInput: new URLSearchParams(location.search).get("room") || "",
    results: { wins: 0, losses: 0, draws: 0 },
    recorded: false,
    offset: 0,
    // サーバーは写真を接続ごとに一度しか送らない。指紋で保持して再構成する。
    photoCache: new Map(),
  };
  let stepTimer, autoTimer;
  let animationEpoch = 0;
  let roomEpoch = 0;
  let modalOpener = null;
  // Rendering replaces the battle DOM; retain keyboard focus by stable action identity.
  function focusSelector(element) {
    if (!element || !root.contains(element)) return null;
    if (element.id) return `#${CSS.escape(element.id)}`;
    if (!element.dataset.action) return null;
    const cardClass = element.matches(".duel-card")
      ? ".duel-card"
      : element.matches(".roster-chip")
        ? ".roster-chip"
        : "";
    return (
      cardClass +
      ["action", "index", "side", "command", "mode"]
        .filter((key) => element.dataset[key] != null)
        .map((key) => `[data-${key}="${CSS.escape(element.dataset[key])}"]`)
        .join("")
    );
  }
  function closeModal() {
    model.sheet = null;
    model.confirm = null;
    render();
    if (modalOpener)
      root.querySelector(modalOpener)?.focus({ preventScroll: true });
    modalOpener = null;
    scheduleAuto();
  }
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function skipTransition() {
    animationEpoch++;
    model.animating = false;
    model.presentation = null;
    model.playback = null;
    model.effect = null;
    if (model.battle)
      model.latest =
        model.battle.log.filter((e) => !e.text.startsWith("──")).at(-1)?.text ||
        "";
  }
  function navigate(view) {
    if (view === "team" && model.battle) view = "battle";
    if (view !== "battle") {
      stopAuto();
      skipTransition();
    }
    model.sheet = null;
    model.confirm = null;
    model.view = view;
    root.hidden = !["team", "battle"].includes(view);
    $("home-screen").hidden = view !== "home";
    $("creator-screen").hidden = view !== "creator";
    document.body.dataset.view = view;
    document.querySelectorAll("button[data-view]").forEach((button) => {
      button.classList.toggle("selected", button.dataset.view === view);
      button.setAttribute("aria-pressed", String(button.dataset.view === view));
    });
    document.dispatchEvent(new CustomEvent("reframe-view", { detail: { view } }));
    history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}${view === "home" ? "" : "#" + view}`,
    );
    render();
    scheduleAuto();
  }
  document.querySelectorAll("button[data-view]").forEach((button) =>
    button.addEventListener("click", () => {
      effects.play("ui");
      navigate(button.dataset.view);
    }),
  );
  document.querySelectorAll("[data-home-action]").forEach((button) =>
    button.addEventListener("click", async () => {
      effects.play("ui");
      const action = button.dataset.homeAction;
      if (model.battle || model.room || model.netBusy) {
        navigate("battle");
        return;
      }
      model.mode = action === "online" ? "online" : "cpu";
      navigate("battle");
      if (action === "quick-cpu" && (await fillSamples())) startCpu();
    }),
  );
  document.addEventListener("reframe-motion-change", () => {
    // Motion settings control decoration, not the readable action sequence.
    render();
    scheduleAuto();
  });
  document.addEventListener("oreka-card-ready", () => {
    $("add-team-button").disabled = false;
  });
  $("add-team-button").addEventListener("click", () => {
    if (model.battle || model.room || model.netBusy) {
      navigate("battle");
      model.error = "今の対戦を終了してからチームを編集してください。";
      render();
      return;
    }
    const card = readCurrentCard();
    if (!card) return;
    if (model.party.length >= 3) {
      model.error =
        "チームは3体までです。入れ替えるカードを外してから追加してください。";
      navigate("battle");
      return;
    }
    model.party.push(card);
    effects.play("reveal");
    model.error = "";
    model.notice = `${card.name} をチームに追加しました。`;
    navigate("team");
  });
  function stopAuto() {
    model.auto = false;
    clearTimeout(autoTimer);
  }
  function resetBattle() {
    skipTransition();
    model.sheet = null;
    model.command = "moves";
    model.latest = "";
    stopAuto();
    clearTimeout(stepTimer);
    model.battle = null;
    model.busy = false;
    model.recorded = false;
    model.error = "";
    model.notice = "";
  }
  function recordResult() {
    if (model.battle?.phase !== "finished" || model.recorded || model.animating)
      return;
    model.recorded = true;
    model.confirm = null;
    stopAuto();
    const key =
      model.battle.winner === "draw"
        ? "draws"
        : model.battle.winner === model.side
          ? "wins"
          : "losses";
    model.results[key]++;
    if (model.view === "battle") effects.play(key === "wins" ? "win" : "lose");
  }
  function canChoose() {
    return viewCanChoose(model);
  }
  function render() {
    const focused = focusSelector(document.activeElement);
    const previousModal = root.querySelector("dialog[open]")?.id;
    const sheetScroll = root.querySelector(".sheet-body")?.scrollTop || 0;
    recordResult();
    root.classList.toggle("is-live", !!model.battle);
    document.body.classList.toggle(
      "duel-active",
      model.view === "battle" && !!model.battle,
    );
    root.innerHTML = `<p id="battle-notice" class="battle-notice ${model.error ? "error" : ""}" role="status" aria-live="polite">${esc(model.error || (!model.battle && (model.busy || model.netBusy || model.room) ? model.notice : ""))}</p>${model.battle ? renderBattle(model) : renderLobby(model)}${renderModal(model)}`;
    if (model.confirm) $("battle-confirm").showModal();
    else if (model.sheet) $("battle-sheet").showModal();
    if (model.sheet === "history") {
      const list = $("battle-log-list");
      if (list) list.scrollTop = list.scrollHeight;
    }
    const currentModal = root.querySelector("dialog[open]");
    if (previousModal === currentModal?.id && focused) {
      const target = root.querySelector(focused);
      if (!currentModal || currentModal.contains(target))
        target?.focus({ preventScroll: true });
      if (currentModal)
        currentModal.querySelector(".sheet-body")?.scrollTo(0, sheetScroll);
    }
    tickClock();
  }
  async function presentTransition(previous, next) {
    const epoch = ++animationEpoch;
    model.command = "moves";
    if (
      !previous ||
      previous.sequence === next.sequence ||
      model.view !== "battle" ||
      model.sheet ||
      model.confirm
    ) {
      model.presentation = null;
      model.playback = null;
      model.effect = null;
      model.animating = false;
      model.latest =
        next.log.filter((e) => !e.text.startsWith("──")).at(-1)?.text ||
        "デュエル開始！";
      render();
      return;
    }
    model.animating = true;
    model.presentation = structuredClone(previous);
    const entries = next.log
      .slice(previous.log.length)
      .filter((e) => !e.text.startsWith("──"));
    model.playback = {
      order: entries
        .filter((e) => e.kind === "move" || e.kind === "switch")
        .map((e) => e.side),
      index: 0,
      actor: null,
      phase: "start",
      name: "",
    };
    // Even reduced motion / fast mode shows each action and its HP update separately.
    const pause = (normal, quiet, fast) =>
      sleep(model.fast ? fast : effects.motion ? normal : quiet);
    let attack = null;
    for (const [entryIndex, entry] of entries.entries()) {
      if (epoch !== animationEpoch || model.battle !== next) return;
      if (entry.kind === "move" || entry.kind === "switch") {
        if (model.playback.index) {
          model.effect = null;
          model.playback.actor = null;
          model.playback.phase = "handoff";
          model.latest = "先の行動が終了。続いて、次のカードが行動します。";
          render();
          await pause(420, 350, 150);
          if (epoch !== animationEpoch || model.battle !== next) return;
        }
        model.playback.index++;
        model.playback.actor = entry.side;
        model.playback.phase = "action";
        model.playback.name =
          entry.kind === "switch" ? "カードを交代" : entry.name;
        attack = null;
      } else if (entry.cause === "status") {
        model.playback.actor = null;
        model.playback.phase = "status";
        attack = null;
      }
      model.latest = entry.text;
      if (entry.kind === "move") {
        attack = entry;
        model.effect = { ...entry, kind: "charge" };
        if (entry.moveIndex !== null)
          model.presentation.teams[entry.side][
            model.presentation.active[entry.side]
          ].pp[entry.moveIndex]--;
        render();
        effects.play("charge");
        await pause(820, 700, 250);
        if (epoch !== animationEpoch || model.battle !== next) return;
        const kind =
          entry.category === "回復"
            ? "heal-cast"
            : entry.category === "補助"
              ? entry.targetSide === entry.side
                ? "guard"
                : "debuff"
              : "strike";
        model.effect = {
          ...entry,
          kind,
          side: kind === "debuff" ? entry.targetSide : entry.side,
        };
        render();
        effects.play(kind === "strike" ? "move" : "heal");
        await pause(640, 100, 100);
        continue;
      }
      const priorHp =
        entry.kind === "damage" || entry.kind === "heal"
          ? model.presentation.teams[entry.side][entry.index].hp
          : null;
      model.effect = entry.kind
        ? { attribute: attack?.attribute, attackerSide: attack?.side, ...entry }
        : null;
      if (model.playback.phase === "action") model.playback.phase = "result";
      const decisive = isFinalKnockout(next, entries, entryIndex);
      if (decisive)
        model.effect = {
          ...model.effect,
          kind: "finish",
          draw: next.winner === "draw",
        };
      if (entry.kind === "switch")
        model.presentation.active[entry.side] = entry.index;
      if (entry.kind === "status" || entry.kind === "cleanse") {
        const fighter = model.presentation.teams[entry.side][entry.index];
        fighter.status = entry.kind === "cleanse" ? null : entry.status;
        fighter.statusTurns = entry.statusTurns || 0;
      }
      if (entry.kind === "buff" || entry.kind === "debuff")
        model.presentation.teams[entry.side][entry.index][entry.field] =
          entry.value;
      if (priorHp !== null)
        model.presentation.teams[entry.side][entry.index].hp = entry.hp;
      render();
      if (entry.kind) effects.play(decisive ? "finish" : entry.kind);
      if (priorHp !== null && effects.motion && !model.fast) {
        const fighter = model.presentation.teams[entry.side][entry.index];
        const max = fighter.card.character.stats.hp;
        const hud = root.querySelector(`.fighter[data-side="${entry.side}"]`);
        hud
          ?.querySelector(".hp-fill")
          ?.animate(
            [
              { width: `${(priorHp / max) * 100}%` },
              { width: `${(entry.hp / max) * 100}%` },
            ],
            { duration: 650, easing: "ease-out" },
          );
      }
      await pause(
        decisive
          ? 1200
          : ["damage", "heal"].includes(entry.kind)
            ? 850
            : ["switch", "buff", "debuff", "status", "cleanse"].includes(
                  entry.kind,
                )
              ? 750
              : entry.kind === "knockout"
                ? 850
                : entry.kind === "critical"
                  ? 500
                  : 180,
        priorHp !== null ? 600 : entry.kind ? 300 : 120,
        priorHp !== null ? 250 : entry.kind ? 130 : 60,
      );
    }
    if (epoch !== animationEpoch || model.battle !== next) return;
    model.presentation = null;
    model.playback = null;
    model.effect = null;
    model.animating = false;
    render();
  }
  function tickClock() {
    const label = $("battle-clock");
    if (!label || model.mode !== "online" || !model.room) return;
    if (model.battle?.phase === "finished") {
      label.textContent = "FINISHED";
      return;
    }
    const until =
      model.room.deadline ||
      Math.min(...(model.room.reconnectUntil || []).filter((x) => x != null));
    label.textContent = Number.isFinite(until)
      ? `${model.room.deadline ? "選択" : "復帰"} ${Math.max(0, Math.ceil((until - Date.now() - model.offset) / 1000))} 秒`
      : "接続を確認中";
  }
  setInterval(tickClock, 1000);
  async function fillSamples() {
    if (model.busy || model.netBusy) return false;
    model.busy = true;
    model.error = "";
    model.notice = "サンプル3体を準備しています…";
    render();
    try {
      model.party = await Promise.all([0, 1, 2].map(createSampleCard));
      model.notice =
        "3体をセットしました。先発を選ぶか、そのまま対戦できます。";
      return true;
    } catch (error) {
      model.error = error.message || "サンプルを作成できませんでした。";
      return false;
    } finally {
      model.busy = false;
      render();
    }
  }
  function startCpu(rematch = false) {
    if (model.party.length !== 3 || model.busy) return;
    if (!rematch) {
      const value = model.seedInput.trim();
      if (
        value &&
        (!/^\d+$/.test(value) ||
          Number(value) < 1 ||
          Number(value) > 4294967295)
      ) {
        model.error = "シードは1〜4294967295の整数にしてください。";
        render();
        return;
      }
      model.seed = value
        ? Number(value)
        : crypto.getRandomValues(new Uint32Array(1))[0] || 1;
      model.enemy = makeCpuTeam(model.seed);
    }
    resetBattle();
    model.mode = "cpu";
    model.side = 0;
    model.battle = createBattle([model.party, model.enemy], model.seed);
    model.latest = "デュエル開始。あなたの一手で、運命を変えろ。";
    effects.play("reveal");
    navigate("battle");
  }
  function cpuChoice(state, side, difficulty) {
    return chooseCpuAction(
      publicState(state),
      side,
      difficulty,
      seededRandom(
        model.seed ^
          Math.imul(state.sequence + 1, side ? 2654435761 : 1597334677),
      ),
    );
  }
  function scheduleAuto() {
    clearTimeout(autoTimer);
    if (
      model.mode !== "cpu" ||
      !model.battle ||
      model.battle.phase === "finished" ||
      model.busy ||
      model.animating ||
      model.sheet ||
      model.confirm ||
      model.view !== "battle"
    )
      return;
    if (model.auto) {
      autoTimer = setTimeout(
        () => {
          const action = cpuChoice(model.battle, 0, "normal");
          if (action) choose(action);
        },
        model.fast ? 110 : 600,
      );
    }
  }
  function choose(action) {
    if (!canChoose()) return;
    model.error = "";
    clearTimeout(autoTimer);
    if (model.mode === "online") {
      try {
        model.connection.send({
          type: "choose",
          sequence: model.battle.sequence,
          action,
        });
        model.busy = true;
        render();
      } catch (error) {
        model.error = error.message;
        render();
      }
      return;
    }
    model.busy = true;
    render();
    const old = model.battle;
    // CPU gets only the pre-turn snapshot, never the player's committed action.
    const cpuAction = cpuChoice(old, 1, model.difficulty);
    stepTimer = setTimeout(
      async () => {
        if (model.battle !== old) return;
        try {
          model.battle = resolveTurn(old, [action, cpuAction]);
          if (
            model.battle.phase === "replace" &&
            activeFighter(model.battle, 0).hp > 0
          ) {
            model.battle = resolveTurn(model.battle, [
              { type: "wait" },
              cpuChoice(model.battle, 1, model.difficulty),
            ]);
          }
        } catch (error) {
          model.error = error.message;
          stopAuto();
        }
        model.busy = false;
        await presentTransition(old, model.battle);
        scheduleAuto();
      },
      model.fast ? 60 : 350,
    );
  }
  function leaveRoom() {
    roomEpoch++;
    model.connection?.leave();
    model.connection = null;
    model.room = null;
    model.netBusy = false;
    model.connected = false;
    // 長く遊んでも写真を抱え続けないよう、退室で必ず解放する。
    model.photoCache.clear();
  }
  function connectRoom(message) {
    if (STATIC_HOSTING) {
      model.error = ONLINE_UNAVAILABLE;
      render();
      return;
    }
    const sessionEpoch = ++roomEpoch;
    model.netBusy = true;
    model.error = "";
    model.notice = "接続しています…";
    render();
    let queue = Promise.resolve();
    let connectionEpoch = 0;
    const consume = async (data) => {
      if (sessionEpoch !== roomEpoch) return;
      const previous = model.battle;
      if (data.type === "session") {
        model.side = data.side;
        model.room = {
          code: data.code,
          ready: [false, false],
          connected: [true],
          battle: null,
        };
      }
      if (data.type === "state") {
        model.room = data;
        model.side = data.side;
        model.offset = (data.serverTime || Date.now()) - Date.now();
        if (data.battle) {
          // 初回だけ届く photos を指紋で貯め、以降は省略された画像を復元する。
          // 席ごとに名前空間を分け、同じ指紋のカードが別の席にあっても混ざらない。
          if (Array.isArray(data.photos))
            data.battle.teams.forEach((team, s) =>
              team.forEach((fighter, i) => {
                const image = data.photos[s]?.[i];
                if (typeof image === "string") {
                  fighter.card.image = image;
                  model.photoCache.set(
                    `${s}:${i}:${fighter.card.fingerprint}`,
                    image,
                  );
                }
              }),
            );
          data.battle.teams.forEach((team, s) =>
            team.forEach((fighter, i) => {
              if (!fighter.card.image)
                fighter.card.image =
                  model.photoCache.get(
                    `${s}:${i}:${fighter.card.fingerprint}`,
                  ) || "";
            }),
          );
          if (
            !model.animating ||
            model.battle?.sequence !== data.battle.sequence
          )
            model.battle = data.battle;
          model.party = data.battle.teams[data.side].map((f) => f.card);
        }
        model.netBusy = false;
        model.busy = false;
        model.notice = data.battle ? "" : "相手が入室するのを待っています。";
      }
      if (data.type === "error") {
        model.error = data.message;
        model.netBusy = false;
        model.busy = false;
      }
      if (["expired", "replaced", "left"].includes(data.type)) {
        skipTransition();
        model.sheet = null;
        model.netBusy = false;
        model.busy = false;
        model.room = null;
        model.connected = false;
        model.connection = null;
        if (model.battle?.phase !== "finished") model.battle = null;
        model.error = data.message || "";
        model.notice = "";
      }
      if (
        data.type === "state" &&
        data.battle &&
        (!previous || previous.sequence !== data.battle.sequence)
      ) {
        if (
          !previous ||
          (data.battle.phase === "finished" &&
            ["surrender", "disconnect", "timeout", "left"].includes(
              data.battle.reason,
            ))
        ) {
          skipTransition();
          render();
        } else await presentTransition(previous, model.battle);
      } else render();
    };
    model.connection = new RoomConnection(
      (data) => {
        const urgent =
          ["expired", "replaced", "left"].includes(data.type) ||
          (data.battle?.phase === "finished" &&
            ["surrender", "disconnect", "timeout", "left"].includes(
              data.battle.reason,
            ));
        if (urgent) {
          connectionEpoch++;
          skipTransition();
          void consume(data);
          return;
        }
        const epoch = connectionEpoch;
        model.queued++;
        queue = queue
          .then(async () => {
            if (epoch === connectionEpoch) await consume(data);
          })
          .catch((error) => {
            model.error = error.message;
            skipTransition();
          })
          .finally(() => {
            model.queued--;
            render();
          });
      },
      (connected, message, fatal = false) => {
        if (sessionEpoch !== roomEpoch) return;
        model.connected = connected;
        model.notice = message;
        if (fatal) {
          connectionEpoch++;
          skipTransition();
          model.sheet = null;
          model.error = message;
          model.netBusy = false;
          model.busy = false;
          model.room = null;
          if (model.battle?.phase !== "finished") model.battle = null;
          model.connection = null;
        }
        render();
      },
    );
    model.connection.open(message);
  }
  function downloadLog() {
    if (!model.battle) return;
    const data = {
      version: model.battle.version,
      mode: model.mode,
      difficulty: model.mode === "cpu" ? model.difficulty : null,
      initialSeed: model.mode === "cpu" ? model.seed : null,
      winner: model.battle.winner,
      reason: model.battle.reason,
      turns: model.battle.turn,
      teams: model.battle.teams.map((team) =>
        team.map((f) => ({
          name: f.card.name,
          character: f.card.character,
          hp: f.hp,
          pp: f.pp,
        })),
      ),
      log: model.battle.log,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `reframe-battle-${Date.now()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  root.addEventListener(
    "cancel",
    (event) => {
      if (event.target.id === "battle-sheet") {
        event.preventDefault();
        closeModal();
      }
      if (event.target.id === "battle-confirm") {
        event.preventDefault();
        closeModal();
      }
    },
    true,
  );
  root.addEventListener("change", (event) => {
    if (event.target.id === "cpu-difficulty")
      model.difficulty = event.target.value;
    if (event.target.id === "fast-battle") {
      model.fast = event.target.checked;
      render();
      scheduleAuto();
    }
  });
  root.addEventListener("input", (event) => {
    if (event.target.id === "battle-seed") model.seedInput = event.target.value;
    if (event.target.id === "room-code-input")
      model.roomInput = event.target.value.toUpperCase();
  });
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    effects.play("ui");
    let action = button.dataset.action;
    const index = Number(button.dataset.index);
    if (["history", "rules", "options", "moves"].includes(action)) {
      if (!model.sheet) modalOpener = focusSelector(button);
      stopAuto();
      skipTransition();
      model.sheet = action;
      render();
      return;
    }
    if (action === "close-sheet") {
      closeModal();
      return;
    }
    if (action === "sound") {
      $("sound-toggle").click();
      render();
      return;
    }
    if (action === "skip-animation") {
      skipTransition();
      render();
      scheduleAuto();
      return;
    }
    if (action === "command") {
      model.command = button.dataset.command;
      render();
      return;
    }
    let confirmed = false;
    if (action === "cancel-exit") {
      closeModal();
      return;
    }
    if (action === "confirm-exit") {
      action = model.confirm;
      model.confirm = null;
      confirmed = true;
    }
    if (
      ["surrender", "leave"].includes(action) &&
      model.battle?.phase !== "finished" &&
      model.battle &&
      !confirmed
    ) {
      stopAuto();
      skipTransition();
      model.sheet = null;
      model.confirm = action;
      render();
      return;
    }
    if (
      model.netBusy &&
      ["remove", "lead", "samples", "quick-cpu", "start-cpu"].includes(action)
    )
      return;
    model.error = "";
    if (action === "creator") {
      navigate("creator");
      return;
    }
    if (action === "mode") {
      model.mode = button.dataset.mode;
      model.notice = "";
      render();
      return;
    }
    if (action === "remove") {
      model.party.splice(index, 1);
      render();
      return;
    }
    if (action === "lead") {
      [model.party[0], model.party[index]] = [
        model.party[index],
        model.party[0],
      ];
      render();
      return;
    }
    if (action === "samples") {
      await fillSamples();
      return;
    }
    if (action === "quick-cpu") {
      if (await fillSamples()) startCpu();
      return;
    }
    if (action === "start-cpu") {
      startCpu();
      return;
    }
    if (action === "rematch") {
      startCpu(true);
      return;
    }
    if (action === "move" || action === "switch") {
      choose({ type: action, index });
      return;
    }
    if (action === "struggle") {
      choose({ type: "struggle" });
      return;
    }
    if (action === "auto") {
      model.auto = !model.auto;
      render();
      scheduleAuto();
      return;
    }
    if (action === "surrender") {
      skipTransition();
      stopAuto();
      clearTimeout(stepTimer);
      model.busy = false;
      if (model.mode === "cpu") {
        model.battle = finishBattle(model.battle, 1, "surrender");
        render();
      } else
        try {
          model.connection.send({ type: "surrender" });
        } catch (error) {
          model.error = error.message;
          render();
        }
      return;
    }
    if (action === "back-lobby" || action === "leave") {
      if (model.mode === "online") leaveRoom();
      resetBattle();
      navigate("team");
      return;
    }
    if (action === "create-room" || action === "join-room") {
      if (model.party.length !== 3) return;
      const team = wireTeam(model.party);
      model.recorded = false;
      connectRoom(
        action === "create-room"
          ? { type: "create", team }
          : { type: "join", team, code: model.roomInput.trim().toUpperCase() },
      );
      return;
    }
    if (action === "copy-room") {
      const url = `${location.origin}${location.pathname}?room=${model.room.code}#battle`;
      try {
        await navigator.clipboard.writeText(url);
        model.notice = "招待リンクをコピーしました。友達に送ってください。";
      } catch {
        model.notice = `合言葉 ${model.room.code} を友達に伝えてください。`;
      }
      render();
      return;
    }
    if (action === "download-log") {
      downloadLog();
      return;
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (model.battle && model.battle.phase !== "finished") {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  const session = STATIC_HOSTING ? null : savedSession();
  if (session) {
    model.mode = "online";
    navigate("battle");
    connectRoom({ type: "resume", ...session });
  } else if (model.roomInput) {
    model.mode = "online";
    navigate("battle");
  } else {
    const view = location.hash.slice(1);
    navigate(["creator", "team", "battle"].includes(view) ? view : "home");
  }
  return { navigate };
}
