import "./mobile.css";
import { STATIC_HOSTING, ONLINE_UNAVAILABLE } from "./hosting.js";
import { mobileLinkInfo, resolveShareTarget } from "./mobile-link.js";

async function fetchPublicUrl() {
  try {
    const response = await fetch(new URL("public-url", location.href), {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await response.json();
    const value = data?.publicUrl ?? data?.url;
    return typeof value === "string" && value ? value : null;
  } catch {
    return null;
  }
}

export function initMobileGuide() {
  const $ = (id) => document.getElementById(id);
  const dialog = $("mobile-guide"),
    opener = $("mobile-guide-button");
  const status = $("mobile-link-status"),
    input = $("mobile-link-url");
  const canvas = $("mobile-qr"),
    copy = $("mobile-copy"),
    share = $("mobile-share");
  if (STATIC_HOSTING) {
    $("mobile-preview-notice").textContent =
      "GitHub Pagesの公開版です。PCの起動やインストールなしで、スマホから写真カード作成・CPU戦を遊べます。";
    $("mobile-online-help").textContent = ONLINE_UNAVAILABLE;
    $("mobile-access-help").textContent =
      "このHTTPSのURLをSafari／Chromeで開いてください。GitHubのファイル一覧や、ダウンロードしたindex.htmlでは遊べません。";
    $("hosting-label").textContent = "SOLO WEB EDITION";
    const home = document.querySelector('[data-home-action="online"] strong');
    if (home) home.textContent = "友達対戦について";
  }
  let link = null,
    generation = 0;
  function message(text) {
    status.textContent = text;
  }
  opener.addEventListener("click", async () => {
    if (dialog.open) return;
    const epoch = ++generation;
    canvas.hidden = true;
    copy.disabled = true;
    share.hidden = true;
    dialog.showModal();
    $("mobile-guide-close").focus();
    try {
      const base = import.meta.env.BASE_URL;
      link = mobileLinkInfo(location.href, base);
      let viaPublic = false;
      if (!link.shareable && !STATIC_HOSTING) {
        // ローカル起動中でも公開トンネルがあれば別回線用QRを出す
        message("公開URLを確認しています…");
        const target = resolveShareTarget(
          location.href,
          base,
          await fetchPublicUrl(),
        );
        if (target.shareable) {
          link = target;
          viaPublic = !!target.viaPublic;
        }
      }
      input.value = link.url;
      if (!link.shareable) {
        message(
          link.reason === "local"
            ? "このURLはこのPC専用です。別回線のスマホと遊ぶには start-public-battle.bat（または --public）で起動し直してから、もう一度「スマホで遊ぶ」を押してください。localhostはスマホでは使えません。"
            : "写真の解析にはHTTPSが必要です。公開URLで起動し直すか、HTTPSのURLから開いてください。",
        );
        return;
      }
      copy.disabled = false;
      share.hidden = typeof navigator.share !== "function";
      message("QRコードを端末内で作成しています…");
      const { default: QRCode } = await import("qrcode");
      if (epoch !== generation || !dialog.open) return;
      await QRCode.toCanvas(canvas, link.url, {
        width: 256,
        margin: 4,
        errorCorrectionLevel: "M",
        color: { dark: "#111111", light: "#ffffff" },
      });
      if (epoch !== generation || !dialog.open) return;
      canvas.hidden = false;
      message(
        viaPublic
          ? "別回線スマホ用の公開URLでQRを作成しました。サーバー起動中のみ有効です。Safari／Chromeで開いてください。"
          : "スマホのカメラで読み取り、Safari／Chromeで開いてください。",
      );
    } catch {
      if (epoch === generation && dialog.open)
        message(
          "QRコードを作成できませんでした。下のURLをコピーしてスマホに送ってください。",
        );
    }
  });
  copy.addEventListener("click", async () => {
    if (!link?.shareable) return;
    try {
      await navigator.clipboard.writeText(link.url);
      message(
        "URLをコピーしました。スマホへ送って、Safari／Chromeで開いてください。",
      );
    } catch {
      input.focus();
      input.select();
      input.setSelectionRange(0, input.value.length);
      message(
        "自動コピーが許可されていません。選択されたURLを手動でコピーしてください。",
      );
    }
  });
  share.addEventListener("click", async () => {
    if (!link?.shareable || !navigator.share) return;
    try {
      // Invoke directly in the click handler to keep iOS's user-gesture permission.
      await navigator.share({
        title: "RE:FRAME — スマホで遊ぶ",
        text: STATIC_HOSTING
          ? "写真で作るカードゲーム。スマホのブラウザでCPU戦を遊べます。"
          : "写真で作るカードゲーム。サーバー起動中にアクセスできます。",
        url: link.url,
      });
      message("共有画面を閉じました。相手のスマホでも同じURLから遊べます。");
    } catch (error) {
      message(
        error.name === "AbortError"
          ? "共有をキャンセルしました。"
          : "共有できませんでした。URLのコピーかQRコードを使ってください。",
      );
    }
  });
  $("mobile-guide-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    generation++;
    opener.focus({ preventScroll: true });
  });
}
