import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const root = import.meta.dirname;
const authProxyTarget = process.env.AUTH_PROXY_URL || "http://localhost:3001";
const apiProxyTarget = process.env.API_PROXY_URL || "http://localhost:8000";

export default defineConfig({
  root,
  envDir: path.resolve(root, "../.."),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT || 8443),
    strictPort: true,
    proxy: {
      "/api/auth": {
        target: authProxyTarget,
        changeOrigin: true,
      },
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT || 8443),
  },
});
