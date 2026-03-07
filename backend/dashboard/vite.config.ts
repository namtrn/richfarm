import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(__dirname, "../../.env.local") });
dotenv.config({ path: resolve(__dirname, "../../.env") });
dotenv.config({ path: resolve(__dirname, "../.env"), override: true });

export default defineConfig({
  root: resolve(__dirname),
  base: "/dashboard/",
  plugins: [react()],
  define: {
    __CONVEX_URL__: JSON.stringify(
      process.env.VITE_CONVEX_URL ?? process.env.EXPO_PUBLIC_CONVEX_URL ?? "",
    ),
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "../dist/public"),
    emptyOutDir: true,
  },
});
