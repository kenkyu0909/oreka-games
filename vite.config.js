import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app"],
    port: 5173,
    strictPort: true,
    proxy: {
      "/socket": {
        target: "http://127.0.0.1:3000",
        ws: true,
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app"],
    port: 4173,
    strictPort: true,
    proxy: {
      "/socket": {
        target: "http://127.0.0.1:3000",
        ws: true,
        changeOrigin: false,
      },
    },
  },
});
