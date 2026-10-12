import test from "node:test";
import assert from "node:assert/strict";
import { mobileLinkInfo } from "../src/mobile-link.js";

test("mobile handoff shares only the origin, stripping room codes, credentials and fragments", () => {
  const info = mobileLinkInfo(
    "https://user:password@3000-demo.e2b.app/index.html?room=ABCDEF&token=secret#creator",
  );
  assert.deepEqual(info, {
    url: "https://3000-demo.e2b.app/",
    shareable: true,
    reason: null,
    temporary: true,
  });
  assert.equal(
    mobileLinkInfo("https://example.com:8443/?photo=private").url,
    "https://example.com:8443/",
  );
});
test("localhost, IPv4/IPv6 loopback and wildcard bind addresses never produce a phone QR", () => {
  for (const host of [
    "localhost",
    "dev.localhost",
    "127.0.0.1",
    "127.2.3.4",
    "[::1]",
    "[::]",
    "0.0.0.0",
  ]) {
    for (const scheme of ["http", "https"]) {
      const info = mobileLinkInfo(`${scheme}://${host}:3000/`);
      assert.equal(info.shareable, false, host);
      assert.equal(info.reason, "local");
    }
  }
});
test("HTTP LAN/public addresses require HTTPS for photo analysis; public HTTPS is shareable", () => {
  for (const host of ["192.168.1.10", "10.0.0.3", "example.com"]) {
    assert.equal(mobileLinkInfo(`http://${host}/`).reason, "insecure");
  }
  assert.equal(mobileLinkInfo("https://example.com/").shareable, true);
  assert.equal(mobileLinkInfo("https://example.com/").temporary, false);
});
test("unsupported schemes and malformed URLs fail before any copy or QR generation", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///tmp/index.html",
    "not a URL",
  ]) {
    assert.throws(() => mobileLinkInfo(url));
  }
});

test("Pages QR preserves the configured repository path without leaking query data", () => {
  assert.equal(
    mobileLinkInfo(
      "https://kenkyu0909.github.io/oreka-games/?room=SECRET#creator",
      "/oreka-games/",
    ).url,
    "https://kenkyu0909.github.io/oreka-games/",
  );
  for (const base of [
    "//evil.example/",
    "/../",
    "/a/../../",
    "/x/?secret=yes",
    "https://evil.example/",
  ])
    assert.throws(() => mobileLinkInfo("https://kenkyu0909.github.io/", base));
});
