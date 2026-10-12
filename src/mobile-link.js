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
