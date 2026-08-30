import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { ZodError } from "zod";

import { createAuthRouter, requireAuth, requireRole, type AuthConfig } from "./auth";
import { getConvexReadiness, type ConvexReadiness, type ConvexSyncService } from "./convex-sync";
import type { SqliteDatabase } from "./db";
import { createGenericDataRouter } from "./generic-data";
import { createContentSyncRouter } from "./content-sync";
import { createMasterPlantsRouter, handleMasterPlantsError } from "./master-plants";
import { createMasterPlantI18nRouter } from "./master-plant-i18n";
import { createConvexAdminRouter } from "./convex-admin";
import { createAdaptationTermsRouter } from "./adaptation-terms";
import { adaptationTermsHealth } from "./master-plants";
import { createSyncReconciliationRouter } from "./sync-reconciliation";
import { createContentReviewRouter } from "./content-source/review-routes";
import { resolveRepositoryRoot } from "./content-source/monitor";

interface CreateAppOptions {
  auth: AuthConfig;
  syncService?: ConvexSyncService;
  getMonitorHealth?: () => unknown;
}

function getHealthConvexReadiness(syncService?: ConvexSyncService): ConvexReadiness {
  const getReadiness = (syncService as unknown as { getReadiness?: unknown } | undefined)?.getReadiness;
  if (typeof getReadiness === "function") {
    return (getReadiness as () => ConvexReadiness).call(syncService);
  }

  // A test or embedding caller may omit the sync service entirely. Keep the
  // health response shape stable while reporting that no Convex capability is
  // configured; no credential values are ever included.
  return getConvexReadiness({});
}

export function createApp(db: SqliteDatabase, options: CreateAppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", false);
  const authMiddleware = requireAuth(options.auth, db);
  const configuredOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([
    "http://localhost:51733",
    "http://localhost:5174",
    "http://localhost:4173",
    "http://localhost:3000",
    ...configuredOrigins,
  ]);
  const isAllowedDevOrigin = (origin: string) => (
    /^http:\/\/localhost:\d+$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
  );

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin) || isAllowedDevOrigin(origin)) {
          callback(null, true);
          return;
        }
        if (/^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin) || /^http:\/\/100\.\d+\.\d+\.\d+:\d+$/.test(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.options("*", cors());
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  // Simple request logger
  app.use((req, _res, next) => {
    console.log(`[DEBUG] ${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
  });

  app.use(
    "/api/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 25,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        console.warn(`[WARN] Rate limit exceeded for ${req.ip} on ${req.url}`);
        res.status(429).json({ error: "Too many login attempts, please try again later." });
      },
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      convex: getHealthConvexReadiness(options.syncService),
      geography: adaptationTermsHealth(db),
    });
  });

  app.use("/api/auth", createAuthRouter(db, options.auth));

  app.use(
    "/api/master-plants",
    authMiddleware,
    requireRole(["admin", "editor"]),
    createMasterPlantsRouter(db, options.syncService),
  );
  app.use(
    "/api/master-plants-i18n",
    authMiddleware,
    requireRole(["admin", "editor"]),
    createMasterPlantI18nRouter(db, options.syncService),
  );
  app.use(
    "/api/adaptation-terms",
    authMiddleware,
    requireRole(["admin", "editor"]),
    createAdaptationTermsRouter(db, options.syncService),
  );
  app.use("/api/content-sync", authMiddleware, requireRole(["admin"]), createContentSyncRouter());
  app.use("/api/convex-admin", authMiddleware, requireRole(["admin", "editor"]), createConvexAdminRouter(options.syncService));
  app.use(
    "/api/sync-reconciliation",
    authMiddleware,
    requireRole(["admin", "editor"]),
    createSyncReconciliationRouter(db, options.syncService),
  );
  app.use(
    "/api/content-review",
    authMiddleware,
    requireRole(["admin", "editor"]),
    createContentReviewRouter({
      db,
      repositoryRoot: resolveRepositoryRoot(),
      getMonitorHealth: options.getMonitorHealth,
    }),
  );
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
    if (!res.headersSent) {
      console.error(`[ERROR] Unhandled error:`, error);
      res.status(500).json({ error: message });
    } else {
      console.error(`[ERROR] Unhandled error after headers sent:`, error);
    }
  });

  return app;
}
