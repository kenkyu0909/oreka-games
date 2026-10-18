// Publishes a neutral "not public" page instead of the game.
// Used by the Publish smartphone game workflow when mode=placeholder, so the
// live GitHub Pages URL no longer serves the game while it is being polished.
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>RE:FRAME</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: radial-gradient(120% 120% at 50% 0%, #241019 0%, #0d0a10 55%, #07060a 100%);
        color: #f4eef1;
        font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", system-ui, sans-serif;
      }
      main { width: min(560px, 100%); }
      .tag {
        margin: 0 0 18px;
        font-size: 12px;
        letter-spacing: 0.38em;
        color: #ee354c;
      }
      h1 {
        margin: 0 0 16px;
        font-size: clamp(22px, 5vw, 30px);
        line-height: 1.5;
        letter-spacing: 0.02em;
      }
      p {
        margin: 0;
        font-size: 14px;
        line-height: 2;
        color: #b9aeb5;
      }
      .rule {
        height: 1px;
        margin: 26px 0;
        background: linear-gradient(90deg, #ee354c, transparent);
      }
    </style>
  </head>
  <body>
    <main>
      <p class="tag">RE:FRAME</p>
      <h1>このゲームは現在公開していません。</h1>
      <div class="rule"></div>
      <p>
        ただいま調整中のため、公開を止めています。<br />
        準備が整いましたら、あらためてお知らせします。
      </p>
    </main>
  </body>
</html>
`;

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await writeFile(path.join(dist, "index.html"), html, "utf8");
await writeFile(path.join(dist, "404.html"), html, "utf8");
await writeFile(path.join(dist, ".nojekyll"), "", "utf8");
console.log(`non-public placeholder built: ${dist}`);
