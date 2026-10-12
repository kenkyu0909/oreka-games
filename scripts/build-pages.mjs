import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("node_modules/vite/bin/vite.js", root)),
    "build",
    "--mode",
    "github-pages",
  ],
  { cwd: fileURLToPath(root), stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
// The requested download pack stays on GitHub, but is not published with the game.
rmSync(new URL("dist/strong-cards/", root), { recursive: true, force: true });
