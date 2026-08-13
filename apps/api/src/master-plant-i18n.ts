import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import type { ConvexSyncService } from "./convex-sync";
import type { SqliteDatabase } from "./db";
import { requireRole } from "./auth";
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
  care_content: z.string().max(50000).nullish(),
  content_version: z.number().int().positive().optional(),
  source: z.string().trim().max(240).nullish(),
  source_url: z.string().url().nullish(),
  content_status: z.enum(["draft", "published", "needs_review", "archived"]).optional(),
  review_status: z.enum(["unreviewed", "in_review", "reviewed"]).optional(),
  reviewed_at: z.string().datetime().nullish(),
  reviewed_by: z.string().trim().max(240).nullish(),
  content_origin: z.enum(["authored", "inherited", "imported"]).optional(),
  source_refs: z.array(z.object({
    sourceSystem: z.string().trim().max(80).nullish(),
    sourceName: z.string().trim().max(240).nullish(),
    sourceUrl: z.string().url().nullish(),
    sourceLocator: z.string().trim().max(240).nullish(),
  })).max(50).optional(),
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
  care_content: string | null;
  content_version: number;
  source: string | null;
  source_url: string | null;
  content_status: string;
  review_status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  content_origin: string;
  source_refs_json: string;
  created_at: string;
  updated_at: string;
}

function normalizeI18n(row: I18nRow) {
  return {
    id: row.id,
    master_plant_id: row.master_plant_id,
    locale: row.locale,
    common_name: row.common_name,
    description: row.description,
    care_content: row.care_content,
    content_version: row.content_version,
    source: row.source,
    source_url: row.source_url,
    content_status: row.content_status,
    review_status: row.review_status,
    reviewed_at: row.reviewed_at,
    reviewed_by: row.reviewed_by,
    content_origin: row.content_origin,
    source_refs: (() => {
      try {
        const parsed = JSON.parse(row.source_refs_json || "[]");
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined;
      } catch {
        return undefined;
      }
    })(),
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
      ...(row.care_content ? { care_content: row.care_content } : {}),
      content_version: row.content_version,
      ...(row.source ? { source: row.source } : {}),
      ...(row.source_url ? { source_url: row.source_url } : {}),
      content_status: row.content_status,
      review_status: row.review_status,
      ...(row.reviewed_at ? { reviewed_at: row.reviewed_at } : {}),
      ...(row.reviewed_by ? { reviewed_by: row.reviewed_by } : {}),
      content_origin: row.content_origin,
      ...(row.source_refs_json ? { source_refs: (() => {
        try {
          const parsed = JSON.parse(row.source_refs_json);
          return Array.isArray(parsed) ? parsed : undefined;
        } catch {
          return undefined;
        }
      })() } : {}),
    };
    return result;
  }, {});
}

function ensureRequiredLocales(db: SqliteDatabase, plantId: number, i18n: Record<string, any>, commonName: string) {
  for (const locale of ["vi", "en"]) {
    if (i18n[locale]?.common_name?.trim()) continue;
    i18n[locale] = {
      common_name: commonName,
      care_content: null,
      content_version: 1,
      content_status: "published",
      review_status: "unreviewed",
    };
  }
  return i18n;
}

export function createMasterPlantI18nRouter(db: SqliteDatabase, syncService?: ConvexSyncService): Router {
  const router = Router();

  // Dashboard i18n management is SQLite-local. Keep Convex out of this read
  // path and expose numeric SQLite ids explicitly so callers never mistake a
  // Convex document id for a writable row id.
  router.get("/", (req: Request, res: Response, next: NextFunction) => {
    try {
      const locale = typeof req.query.locale === "string" ? req.query.locale.trim().toLowerCase() : "";
      const rows = db.prepare(`
        SELECT i.*, mp.scientific_name AS plant_scientific_name, mp."group" AS plant_group
        FROM master_plant_i18n i
        JOIN master_plants mp ON mp.id = i.master_plant_id
        ${locale ? "WHERE i.locale = ?" : ""}
        ORDER BY i.common_name COLLATE NOCASE ASC, i.id ASC
      `).all(...(locale ? [locale] : [])) as Array<I18nRow & {
        plant_scientific_name: string | null;
        plant_group: string | null;
      }>;
      res.json({
        data: rows.map((row) => ({
          ...normalizeI18n(row),
          plant_scientific_name: row.plant_scientific_name,
          plant_group: row.plant_group,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

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

      const queued = true;
      const rowId = db.transaction(() => {
        const id = upsertMasterPlantRow(db, { ...fullPayload, sync_origin: "local" });
        if (queued) {
          enqueueSyncOutbox(db, {
            entityType: "master_plant",
            sourceSystem: fullPayload.source_system,
            sourceId: fullPayload.source_id!,
            operation: "upsert_i18n",
            locale: payload.locale,
            payload: fullPayload as unknown as Record<string, unknown>,
          });
        }
        return id;
      })();
      const saved = db.prepare(`SELECT * FROM master_plant_i18n WHERE master_plant_id = ? AND locale = ?`).get(rowId, payload.locale) as I18nRow;
      res.status(201).json({ data: normalizeI18n(saved), queued });
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

      const queued = true;
      const rowId = db.transaction(() => {
        const id = upsertMasterPlantRow(db, {
          ...fullPayload,
          sync_origin: "local",
        });
        if (queued) {
          enqueueSyncOutbox(db, {
            entityType: "master_plant",
            sourceSystem: fullPayload.source_system,
            sourceId: fullPayload.source_id!,
            operation: "upsert_i18n",
            locale: existing.locale,
            payload: fullPayload as unknown as Record<string, unknown>,
          });
        }
        return id;
      })();
      const updated = db.prepare(`SELECT * FROM master_plant_i18n WHERE master_plant_id = ? AND locale = ?`).get(rowId, existing.locale) as I18nRow;
      res.json({ data: normalizeI18n(updated), queued });
    } catch (error) {
      next(error);
    }
  });

  // Translation-row deletion is admin-only under the Phase 3.1 role contract.
  router.delete("/:id", requireRole(["admin"]), async (req: Request, res: Response, next: NextFunction) => {
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

      const queued = true;
      db.transaction(() => {
        upsertMasterPlantRow(db, {
          ...fullPayload,
          sync_origin: "local",
        });
        if (queued) {
          enqueueSyncOutbox(db, {
            entityType: "master_plant",
            sourceSystem: fullPayload.source_system,
            sourceId: fullPayload.source_id!,
            operation: "delete_i18n",
            locale: existing.locale,
            payload: fullPayload as unknown as Record<string, unknown>,
          });
        }
      })();
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
