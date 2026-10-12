import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["line"], ["github"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1280, height: 900 },
    headless: true,
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
          args: [
            "--no-sandbox",
            "--no-zygote",
            "--disable-dev-shm-usage",
            "--use-gl=angle",
            "--use-angle=swiftshader",
          ],
        }
      : {},
  },
  webServer: {
    command: "npm run build && npm start",
    url: "http://127.0.0.1:3000/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
