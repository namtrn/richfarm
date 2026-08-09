import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import {
  CONVEX_ADMIN_PROXY_CONFIG_VARS,
  type ConvexReadiness,
  type ConvexSyncService,
} from "./convex-sync";

const requestSchema = z.object({
  path: z.string().trim().min(1).max(120),
  args: z.record(z.string(), z.unknown()).default({}),
});

const allowedQueries = new Set([
  "plantAdmin:listPlants",
  "plantAdmin:listPlantGroups",
  "plantAdmin:listPlantI18n",
  "plantAdmin:listPlantPhotos",
]);

const allowedMutations = new Set([
  "plantAdmin:createPlant",
  "plantAdmin:updatePlant",
  "plantAdmin:deletePlant",
  "plantAdmin:backfillGroupBasePlants",
  "plantAdmin:createPlantGroup",
  "plantAdmin:updatePlantGroup",
  "plantAdmin:deletePlantGroup",
  "plantAdmin:createPlantI18n",
  "plantAdmin:updatePlantI18n",
  "plantAdmin:deletePlantI18n",
  "plantAdmin:createPlantPhoto",
  "plantAdmin:updatePlantPhoto",
  "plantAdmin:deletePlantPhoto",
  "plantAdmin:bulkUpdatePlantI18n",
]);

const ADMIN_PROXY_NOT_CONFIGURED = "CONVEX_ADMIN_PROXY_NOT_CONFIGURED";
const ADMIN_PROXY_CONFIG_ACTION = "Set the listed server environment variables in the API environment and restart the server.";

function adminProxyReadiness(syncService?: ConvexSyncService): ConvexReadiness["adminProxy"] | null {
  const getReadiness = (syncService as unknown as { getReadiness?: unknown } | undefined)?.getReadiness;
  if (typeof getReadiness !== "function") {
    return null;
  }

  return (getReadiness as () => ConvexReadiness).call(syncService).adminProxy;
}

function adminProxyUnavailableResponse(syncService?: ConvexSyncService) {
  const readiness = adminProxyReadiness(syncService);
  const missing = readiness?.missing ?? [...CONVEX_ADMIN_PROXY_CONFIG_VARS];
  const missingText = missing.join(", ") || "unknown server configuration";

  return {
    // Keep the historical prefix so clients that intentionally fall back to
    // SQLite can continue to recognize this capability as unavailable.
    error: `Convex admin proxy is not configured: missing server configuration (${missingText}). ${ADMIN_PROXY_CONFIG_ACTION}`,
    code: ADMIN_PROXY_NOT_CONFIGURED,
    reason: "missing_server_configuration",
    missing,
    missingVariables: missing,
    action: ADMIN_PROXY_CONFIG_ACTION,
    retryable: false,
  };
}

export function createConvexAdminRouter(syncService?: ConvexSyncService): Router {
  const router = Router();

  router.use((_req: Request, res: Response, next: NextFunction) => {
    if (!syncService?.isAdminProxyEnabled()) {
      res.status(503).json(adminProxyUnavailableResponse(syncService));
      return;
    }

    next();
  });

  router.post("/query", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = requestSchema.parse(req.body);
      if (!allowedQueries.has(payload.path)) {
        res.status(403).json({ error: `Convex admin query '${payload.path}' is not allowed` });
        return;
      }

      const data = await syncService!.adminQuery(payload.path, payload.args);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.post("/mutation", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = requestSchema.parse(req.body);
      if (!allowedMutations.has(payload.path)) {
        res.status(403).json({ error: `Convex admin mutation '${payload.path}' is not allowed` });
        return;
      }

      const data = await syncService!.adminMutation(payload.path, payload.args);
      res.json({ data: data ?? null });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
