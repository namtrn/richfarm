import fs from "fs";
import path from "path";

import cors from "cors";
import express from "express";
import helmet from "helmet";
import { ZodError } from "zod";

import type { SqliteDatabase } from "./db";
import { createGenericDataRouter } from "./generic-data";
import { createMasterPlantsRouter, handleMasterPlantsError } from "./master-plants";

function resolveDashboardDirectory(): string | null {
  const candidateDirectories = [
    path.resolve(__dirname, "public"),
    path.resolve(process.cwd(), "dist/public"),
    path.resolve(process.cwd(), "src/public"),
  ];

  return candidateDirectories.find((directory) => fs.existsSync(directory)) ?? null;
}

export function createApp(db: SqliteDatabase) {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api/master-plants", createMasterPlantsRouter(db));
  app.use("/api", createGenericDataRouter(db));

  const dashboardDirectory = resolveDashboardDirectory();
  if (dashboardDirectory) {
    app.use(
      "/dashboard",
      express.static(dashboardDirectory, {
        index: "index.html",
      }),
    );
  }

  app.get("/", (_req, res) => {
    res.json({
      message: "RichFarm backend is running",
      dashboard: "/dashboard",
      health: "/api/health",
    });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }

    if (error instanceof ZodError) {
      res.status(400).json({
        error: "Validation failed",
        details: error.flatten(),
      });
      return;
    }

    if (handleMasterPlantsError(error, res)) {
      return;
    }

    if (error instanceof Error && error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
      return;
    }

    if (error instanceof Error && (error.message.includes("Unknown column") || error.message.includes("expects"))) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (error instanceof Error && "code" in error) {
      const code = String((error as { code?: unknown }).code ?? "");
      if (code.startsWith("SQLITE_CONSTRAINT")) {
        res.status(400).json({ error: error.message });
        return;
      }
    }

    const message = error instanceof Error ? error.message : "Internal Server Error";
    res.status(500).json({ error: message });
  });

  return app;
}
