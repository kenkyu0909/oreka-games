// Only the Pages build disables server features; the normal Node/BAT build is unchanged.
export const STATIC_HOSTING = import.meta.env?.MODE === "github-pages";
export const ONLINE_UNAVAILABLE =
  "GitHub Pagesでは写真カード作成・CPU戦を遊べます。友達とのオンライン対戦には、Node.js対戦サーバーとHTTPSの接続先が別途必要です。";
