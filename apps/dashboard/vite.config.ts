import { defineConfig, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import dotenv from "dotenv";
import { createDashboardApiSupervisor } from "./src/dev/dashboardApiSupervisor";

dotenv.config({ path: resolve(__dirname, "../../.env.local") });
dotenv.config({ path: resolve(__dirname, "../../.env") });
dotenv.config({ path: resolve(__dirname, ".env"), override: true });

function dashboardApiLifecyclePlugin() {
  let supervisor: ReturnType<typeof createDashboardApiSupervisor> | null = null;

  return {
    name: "richfarm-dashboard-api-lifecycle",
    configureServer(server: ViteDevServer) {
      supervisor = createDashboardApiSupervisor({
        cwd: resolve(__dirname, "../.."),
      });
      supervisor.start();
      server.httpServer?.once("close", () => {
        supervisor?.stop();
        supervisor = null;
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const shouldOwnApiLifecycle =
    command === "serve" &&
    mode === "development" &&
    process.env.RICHFARM_DASHBOARD_API_AUTOSTART !== "false";

  return {
  root: resolve(__dirname),
  base: "/",
  plugins: [react(), ...(shouldOwnApiLifecycle ? [dashboardApiLifecyclePlugin()] : [])],
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
                error: "Dashboard is reconnecting",
                message:
                  "Some dashboard data is temporarily unavailable. It will reconnect automatically.",
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
  };
});
