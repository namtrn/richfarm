import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { ZodError } from "zod";

import { createAuthRouter, requireAuth, requireRole, type AuthConfig } from "./auth";
import type { ConvexSyncService } from "./convex-sync";
import type { SqliteDatabase } from "./db";
import { createGenericDataRouter } from "./generic-data";
import { createMasterPlantsRouter, handleMasterPlantsError } from "./master-plants";
import { createMasterPlantI18nRouter } from "./master-plant-i18n";

interface CreateAppOptions {
  auth: AuthConfig;
  syncService?: ConvexSyncService;
}

export function createApp(db: SqliteDatabase, options: CreateAppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", false);
  const authMiddleware = requireAuth(options.auth);

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:4173",
        "http://localhost:3000",
        /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
        /^http:\/\/100\.\d+\.\d+\.\d+:\d+$/,
      ],
      credentials: true,
    }),
  );
  app.options("*", cors());
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 25,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api/auth", createAuthRouter(db, options.auth));

  app.use("/api/master-plants", (req, res, next) => {
    if (req.method === "GET") {
      next();
      return;
    }

    authMiddleware(req, res, next);
  });
  app.use("/api/master-plants", createMasterPlantsRouter(db, options.syncService));
  app.use("/api/master-plants-i18n", authMiddleware, createMasterPlantI18nRouter(db, options.syncService));
  app.use(
    "/api",
    authMiddleware,
    requireRole(["admin", "editor"]),
    createGenericDataRouter(db),
  );

  app.get("/", (_req, res) => {
    res.json({
      message: "RichFarm backend is running",
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
