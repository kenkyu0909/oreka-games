import { defineConfig } from "@playwright/test";
import normal from "./playwright.config.js";
export default defineConfig({
  testDir: "./tests/pages",
  timeout: 60000,
  workers: 1,
  reporter: process.env.CI ? [["line"], ["github"]] : "list",
  use: { ...normal.use, baseURL: "http://127.0.0.1:4173/oreka-games/" },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js preview --mode github-pages --host 0.0.0.0 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173/oreka-games/",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
