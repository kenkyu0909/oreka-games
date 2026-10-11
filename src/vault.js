import "./vault.css";
import { ATTRIBUTES, STATS } from "./game.js";
import { validateVault } from "./vault-data.js";

const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const base = "/strong-cards/";

export function initVault({ load, isBusy }) {
  const dialog = document.getElementById("vault-dialog");
  const list = document.getElementById("vault-list");
  const detail = document.getElementById("vault-detail");
  const status = document.getElementById("vault-status");
  const filter = document.getElementById("vault-filter");
  let cards = null,
    selected = null,
    attribute = "all",
    opener = null,
    controller = null,
    epoch = 0,
    busy = false;
  filter.innerHTML = [
    ["all", "全て"],
    ...Object.entries(ATTRIBUTES).map(([id, a]) => [id, a.label]),
  ]
    .map(
      ([id, label]) =>
        `<button type="button" data-vault-filter="${id}" aria-pressed="${id === "all"}">${label}</button>`,
    )
    .join("");
  function message(text) {
    status.textContent = text;
  }
  function render() {
    const visible = cards.filter(
      (card) => attribute === "all" || card.attribute === attribute,
    );
    if (!visible.some((c) => c.id === selected)) selected = visible[0].id;
    list.innerHTML = visible
      .map(
        (card) =>
          `<button type="button" class="vault-tile ${card.id === selected ? "selected" : ""}" data-vault-card="${card.id}" aria-pressed="${card.id === selected}" style="--vault-accent:${ATTRIBUTES[card.attribute].color}"><img src="${base + card.preview}" alt="" loading="lazy" width="360" height="540"><span>${esc(card.name)}</span><small>${ATTRIBUTES[card.attribute].label} / ★ ${esc(card.character.moves[3].name)}</small></button>`,
      )
      .join("");
    for (const button of filter.querySelectorAll("button"))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.vaultFilter === attribute),
      );
    renderDetail();
  }
  function renderDetail() {
    const card = cards.find((c) => c.id === selected),
      character = card.character,
      attr = ATTRIBUTES[card.attribute];
    detail.innerHTML = `<div class="vault-feature" style="--vault-accent:${attr.color}"><img src="${base + card.preview}" alt="${esc(card.name)}のオリジナルイラスト" width="360" height="540"><div><span class="vault-element">${attr.label}属性 · Lv.${character.level}</span><h3>${esc(card.name)}</h3><p>${esc(card.role)}</p><span class="rare-badge">★ ${esc(character.moves[3].name)}</span><small>原本PNG ${(card.bytes / 1048576).toFixed(1)}MB<br>4,000 × 6,000px / PHOTO-V3</small></div></div><dl class="vault-stats">${STATS.map(([id, label]) => `<div><dt>${label}</dt><dd>${character.stats[id]}</dd></div>`).join("")}</dl><ol class="vault-moves">${character.moves.map((m) => `<li class="${m.rarity === "rare" ? "rare" : ""}"><div><b>${m.rarity === "rare" ? "★ " : ""}${esc(m.name)}</b><small>${esc(m.category)} · 威力${m.power ?? "—"}${m.hits ? "×" + m.hits : ""} · PP${m.pp} · 命中${m.accuracy}%</small></div><p>${esc(m.text)}</p></li>`).join("")}</ol><div class="vault-actions"><button type="button" class="battle-primary" id="vault-create" ${busy ? "disabled" : ""}>${busy ? "画像を取得中…" : "この画像でカードを作る →"}</button><a href="${base + card.file}" download="${card.id}.png">原本PNGを保存 ↓</a></div><p class="vault-help">作成後に「チームに追加」で編成へ。通常の写真と同じ解析を行います。キラ加工のみランダムです。</p>`;
  }
  async function open(event) {
    if (dialog.open || isBusy()) return;
    opener = event.currentTarget;
    const generation = ++epoch;
    dialog.showModal();
    document.getElementById("vault-close").focus();
    if (cards) {
      render();
      message("10枚・全6属性・すべて異なるレア技。強さには相性があります。");
      return;
    }
    controller = new AbortController();
    message("図鑑を読み込んでいます…");
    try {
      const response = await fetch(base + "manifest.json", {
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          "図鑑を読み込めませんでした。閉じてもう一度開いてください。",
        );
      const data = validateVault(await response.json());
      if (generation !== epoch || !dialog.open) return;
      cards = data;
      render();
      message("10枚・全6属性・すべて異なるレア技。強さには相性があります。");
    } catch (error) {
      if (generation === epoch && error.name !== "AbortError")
        message(error.message);
    }
  }
  document
    .querySelectorAll("[data-open-vault]")
    .forEach((button) => button.addEventListener("click", open));
  document
    .getElementById("vault-close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    epoch++;
    controller?.abort();
    busy = false;
    if (dialog.returnValue !== "import") opener?.focus({ preventScroll: true });
    dialog.returnValue = "";
  });
  filter.addEventListener("click", (event) => {
    const button = event.target.closest("[data-vault-filter]");
    if (!button || !cards || busy) return;
    attribute = button.dataset.vaultFilter;
    render();
    message(
      `${attribute === "all" ? "全属性" : ATTRIBUTES[attribute].label + "属性"}のカードを表示しています。`,
    );
  });
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-vault-card]");
    if (!button || busy) return;
    selected = button.dataset.vaultCard;
    for (const item of list.querySelectorAll("button")) {
      const active = item.dataset.vaultCard === selected;
      item.classList.toggle("selected", active);
      item.setAttribute("aria-pressed", String(active));
    }
    renderDetail();
    message(`${cards.find((c) => c.id === selected).name}を選びました。`);
  });
  detail.addEventListener("click", async (event) => {
    if (!event.target.closest("#vault-create") || busy || isBusy()) return;
    if (!globalThis.crypto?.subtle) {
      message(
        "カード作成にはHTTPS接続が必要です。HTTPSのプレビューを開いてください。",
      );
      return;
    }
    const generation = ++epoch,
      card = cards.find((c) => c.id === selected);
    controller = new AbortController();
    busy = true;
    renderDetail();
    message("原本を取得しています。閉じると取得を中止します。");
    try {
      const response = await fetch(base + card.file, {
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          "画像を取得できませんでした。通信を確認して、もう一度お試しください。",
        );
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== card.bytes)
        throw new Error("画像サイズが一致しません。ページを更新してください。");
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== card.sha256)
        throw new Error("原本の照合に失敗しました。ページを更新してください。");
      if (generation !== epoch || !dialog.open) return;
      if (isBusy())
        throw new Error(
          "いまのカード作成が終わってから、もう一度お試しください。",
        );
      dialog.close("import");
      document.querySelector('.view-nav [data-view="creator"]').click();
      const loaded = await load(
        new File([bytes], card.id + ".png", { type: "image/png" }),
        card,
      );
      if (loaded && document.body.dataset.view === "creator")
        document.getElementById("card-shell").focus({ preventScroll: true });
    } catch (error) {
      if (generation === epoch && error.name !== "AbortError")
        message(error.message);
    } finally {
      if (generation === epoch) {
        busy = false;
        if (dialog.open) renderDetail();
      }
    }
  });
}
