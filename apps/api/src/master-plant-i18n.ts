import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import type { ConvexSyncService } from "./convex-sync";
import type { SqliteDatabase } from "./db";
import {
  buildMasterPlantPayload,
  fetchI18n,
  normalizeMasterPlant,
  upsertI18n,
  upsertMasterPlantRow,
  withSourceIdentity,
} from "./master-plants";
import { enqueueSyncOutbox } from "./sync-outbox";

const localeContentSchema = z.object({
  common_name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5000).nullish(),
  care_content_json: z.record(z.string(), z.unknown()).default({}),
  content_version: z.number().int().positive().optional(),
  source: z.string().trim().max(240).nullish(),
  source_url: z.string().url().nullish(),
  content_status: z.enum(["draft", "published", "needs_review", "archived"]).optional(),
  review_status: z.enum(["unreviewed", "in_review", "reviewed"]).optional(),
  reviewed_at: z.string().datetime().nullish(),
  reviewed_by: z.string().trim().max(240).nullish(),
});

const createI18nSchema = z.object({
  master_plant_id: z.number().int().positive(),
  locale: z.string().trim().min(2).max(12).transform((value) => value.toLowerCase()),
  ...localeContentSchema.shape,
});

const updateI18nSchema = localeContentSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" },
);

interface I18nRow {
  id: number;
  master_plant_id: number;
  locale: string;
  common_name: string;
  description: string | null;
  care_content_json: string;
  content_version: number;
  source: string | null;
  source_url: string | null;
  content_status: string;
  review_status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function normalizeI18n(row: I18nRow) {
  return {
    id: row.id,
    master_plant_id: row.master_plant_id,
    locale: row.locale,
    common_name: row.common_name,
    description: row.description,
    care_content_json: parseJson(row.care_content_json),
    content_version: row.content_version,
    source: row.source,
    source_url: row.source_url,
    content_status: row.content_status,
    review_status: row.review_status,
    reviewed_at: row.reviewed_at,
    reviewed_by: row.reviewed_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function canonicalI18nPayload(db: SqliteDatabase, plantId: number) {
  const rows = db.prepare(`SELECT * FROM master_plant_i18n WHERE master_plant_id = ?`).all(plantId) as I18nRow[];
  return rows.reduce<Record<string, any>>((result, row) => {
    result[row.locale] = {
      common_name: row.common_name,
      ...(row.description ? { description: row.description } : {}),
      care_content_json: parseJson(row.care_content_json),
      content_version: row.content_version,
      ...(row.source ? { source: row.source } : {}),
      ...(row.source_url ? { source_url: row.source_url } : {}),
      content_status: row.content_status,
      review_status: row.review_status,
      ...(row.reviewed_at ? { reviewed_at: row.reviewed_at } : {}),
      ...(row.reviewed_by ? { reviewed_by: row.reviewed_by } : {}),
    };
    return result;
  }, {});
}

function ensureRequiredLocales(db: SqliteDatabase, plantId: number, i18n: Record<string, any>, commonName: string) {
  for (const locale of ["vi", "en"]) {
    if (i18n[locale]?.common_name?.trim()) continue;
    i18n[locale] = {
      common_name: commonName,
      care_content_json: {},
      content_version: 1,
      content_status: "published",
      review_status: "unreviewed",
    };
  }
  return i18n;
}

export function createMasterPlantI18nRouter(db: SqliteDatabase, syncService?: ConvexSyncService): Router {
  const router = Router();

  router.get("/:plantId", (req: Request, res: Response, next: NextFunction) => {
    try {
      const plantId = z.coerce.number().int().positive().parse(req.params.plantId);
      const rows = db.prepare(`SELECT * FROM master_plant_i18n WHERE master_plant_id = ?`).all(plantId) as I18nRow[];
      res.json({ data: rows.map(normalizeI18n) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = createI18nSchema.parse(req.body);
      const current = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(payload.master_plant_id) as any;
      if (!current) {
        res.status(404).json({ error: "Master plant not found" });
        return;
      }
      const i18n = ensureRequiredLocales(db, current.id, canonicalI18nPayload(db, current.id), current.common_name);
      i18n[payload.locale] = {
        ...i18n[payload.locale],
        ...payload,
        content_version: payload.content_version ?? (i18n[payload.locale]?.content_version ?? 0) + 1,
      };
      const fullPayload = withSourceIdentity(buildMasterPlantPayload(db, current, i18n));

      if (syncService?.isEnabled()) {
        try {
          await syncService.syncUpsert(fullPayload as unknown as Record<string, unknown>);
        } catch (error) {
          enqueueSyncOutbox(db, {
            entityType: "master_plant",
            sourceSystem: fullPayload.source_system,
            sourceId: fullPayload.source_id!,
            operation: "upsert_i18n",
            locale: payload.locale,
            payload: fullPayload as unknown as Record<string, unknown>,
          });
          res.status(503).json({ error: "Convex source write failed; translation was queued for retry", retryable: true, outbox: true });
          return;
        }
        const rowId = db.transaction(() => upsertMasterPlantRow(db, { ...fullPayload, sync_origin: "mirror" }))();
        const saved = db.prepare(`SELECT * FROM master_plant_i18n WHERE master_plant_id = ? AND locale = ?`).get(rowId, payload.locale) as I18nRow;
        res.status(201).json({ data: normalizeI18n(saved) });
        return;
      }

      const rowId = db.transaction(() => upsertMasterPlantRow(db, fullPayload))();
      const saved = db.prepare(`SELECT * FROM master_plant_i18n WHERE master_plant_id = ? AND locale = ?`).get(rowId, payload.locale) as I18nRow;
      res.status(201).json({ data: normalizeI18n(saved) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const payload = updateI18nSchema.parse(req.body);
      const existing = db.prepare(`SELECT * FROM master_plant_i18n WHERE id = ?`).get(id) as I18nRow | undefined;
      if (!existing) {
        res.status(404).json({ error: "i18n row not found" });
        return;
      }
      const current = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(existing.master_plant_id) as any;
      if (!current) {
        res.status(404).json({ error: "Master plant not found" });
        return;
      }
      const i18n = ensureRequiredLocales(db, current.id, canonicalI18nPayload(db, current.id), current.common_name);
      i18n[existing.locale] = {
        ...i18n[existing.locale],
        ...payload,
        content_version: payload.content_version ?? (existing.content_version ?? 0) + 1,
      };
      const fullPayload = withSourceIdentity(buildMasterPlantPayload(db, current, i18n));

      if (syncService?.isEnabled()) {
        try {
          await syncService.syncUpsert(fullPayload as unknown as Record<string, unknown>);
        } catch (error) {
          enqueueSyncOutbox(db, {
            entityType: "master_plant",
            sourceSystem: fullPayload.source_system,
            sourceId: fullPayload.source_id!,
            operation: "upsert_i18n",
            locale: existing.locale,
            payload: fullPayload as unknown as Record<string, unknown>,
          });
          res.status(503).json({ error: "Convex source write failed; translation was queued for retry", retryable: true, outbox: true });
          return;
        }
      }

      const rowId = db.transaction(() => upsertMasterPlantRow(db, {
        ...fullPayload,
        sync_origin: syncService?.isEnabled() ? "mirror" : current.sync_origin,
      }))();
      const updated = db.prepare(`SELECT * FROM master_plant_i18n WHERE master_plant_id = ? AND locale = ?`).get(rowId, existing.locale) as I18nRow;
      res.json({ data: normalizeI18n(updated) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const existing = db.prepare(`SELECT * FROM master_plant_i18n WHERE id = ?`).get(id) as I18nRow | undefined;
      if (!existing) {
        res.status(404).json({ error: "i18n row not found" });
        return;
      }
      if (existing.locale === "vi" || existing.locale === "en") {
        res.status(400).json({ error: "vi and en translations are required" });
        return;
      }
      const current = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(existing.master_plant_id) as any;
      const i18n = canonicalI18nPayload(db, existing.master_plant_id);
      delete i18n[existing.locale];
      const fullPayload = withSourceIdentity(buildMasterPlantPayload(db, current, ensureRequiredLocales(db, current.id, i18n, current.common_name)));

      if (syncService?.isEnabled()) {
        try {
          await syncService.syncUpsert(fullPayload as unknown as Record<string, unknown>);
        } catch (error) {
          enqueueSyncOutbox(db, {
            entityType: "master_plant",
            sourceSystem: fullPayload.source_system,
            sourceId: fullPayload.source_id!,
            operation: "delete_i18n",
            locale: existing.locale,
            payload: fullPayload as unknown as Record<string, unknown>,
          });
          res.status(503).json({ error: "Convex source write failed; translation deletion was queued for retry", retryable: true, outbox: true });
          return;
        }
      }
      db.transaction(() => upsertMasterPlantRow(db, {
        ...fullPayload,
        sync_origin: syncService?.isEnabled() ? "mirror" : current.sync_origin,
      }))();
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
