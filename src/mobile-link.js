// Share only the public entry point, never room codes, resume tokens or URL fragments.
export function mobileLinkInfo(href) {
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
    url: `${url.origin}/`,
    shareable: reason === null,
    reason,
    temporary: host.endsWith(".e2b.app"),
  };
}
