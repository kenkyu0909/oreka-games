// Share only the public entry point, never room codes, resume tokens or URL fragments.
export function mobileLinkInfo(href, base = "/") {
  if (
    typeof base !== "string" ||
    !/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(base) ||
    base.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error("ゲームの公開パスが不正です。");
  }
  const url = new URL(href);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("HTTPまたはHTTPSのゲーム画面から開いてください。");
  }
  const host = url.hostname.toLowerCase();
  const loopback =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    host === "[::]" ||
    host === "0.0.0.0" ||
    host.startsWith("127.");
  const reason = loopback
    ? "local"
    : url.protocol !== "https:"
      ? "insecure"
      : null;
  return {
    url: `${url.origin}${base}`,
    shareable: reason === null,
    reason,
    temporary: host.endsWith(".e2b.app"),
  };
}

// 別回線スマホ対応：今開いているURLがlocalhost/HTTPで共有不可でも、
// サーバーが発行したHTTPS公開URLがあればそちらをQR・コピーに使う。
export function resolveShareTarget(href, base = "/", publicUrl = null) {
  const current = mobileLinkInfo(href, base);
  if (current.shareable)
    return { ...current, viaPublic: false, publicUrl: null };
  if (typeof publicUrl === "string" && publicUrl.trim()) {
    try {
      const candidate = mobileLinkInfo(publicUrl.trim(), base);
      if (candidate.shareable)
        return { ...candidate, viaPublic: true, publicUrl: candidate.url };
    } catch {
      /* 公開URLが不正なら現在の案内を優先する */
    }
  }
  return { ...current, viaPublic: false, publicUrl: null };
}
