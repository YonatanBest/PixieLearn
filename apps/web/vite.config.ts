import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const root = import.meta.dirname;
const envDir = path.resolve(root, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "");
  const authProxyTarget = process.env.AUTH_PROXY_URL || env.AUTH_PROXY_URL || "http://127.0.0.1:3001";
  const apiProxyTarget = process.env.API_PROXY_URL || env.API_PROXY_URL || "http://127.0.0.1:8000";

  return {
    root,
    envDir,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(root, "./src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: Number(process.env.PORT || env.PORT || 8443),
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
      port: Number(process.env.PORT || env.PORT || 8443),
    },
  };
});
