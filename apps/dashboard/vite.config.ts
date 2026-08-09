import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(__dirname, "../../.env.local") });
dotenv.config({ path: resolve(__dirname, "../../.env") });
dotenv.config({ path: resolve(__dirname, ".env"), override: true });

export default defineConfig({
  root: resolve(__dirname),
  base: "/",
  plugins: [react()],
  resolve: {
    alias: {
      react: resolve(__dirname, "node_modules/react"),
      "react/jsx-runtime": resolve(__dirname, "node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": resolve(__dirname, "node_modules/react/jsx-dev-runtime.js"),
    },
  },
  define: {
    __CONVEX_URL__: JSON.stringify(
      process.env.VITE_CONVEX_URL ?? process.env.EXPO_PUBLIC_CONVEX_URL ?? "",
    ),
  },
  server: {
    port: 51733,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("error", (error, req, res) => {
            const method = req.method ?? "GET";
            const url = req.url ?? "/api";
            console.error(
              `[dashboard-proxy] Backend unavailable for ${method} ${url}: ${error.message}`,
            );

            // Vite's default proxy error path is an HTML 500 response. Keep
            // API callers (including login) machine-readable and explicit
            // about the missing local backend instead.
            if (!("writeHead" in res) || !("end" in res)) return;
            if (res.headersSent || res.writableEnded) return;
            res.writeHead(503, {
              "Cache-Control": "no-store",
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                error: "Backend unavailable",
                message:
                  "RichFarm API is not running. Start both services with npm run dashboard:dev.",
              }),
            );
          });
        },
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
