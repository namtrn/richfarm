import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { ZodError, z } from "zod";

import type { ConvexPlantLibraryItem, ConvexSyncService } from "./convex-sync";
import type { SqliteDatabase } from "./db";

const growthStageSchema = z.enum(["seedling", "vegetative", "flowering", "harvest"]);

const masterPlantObjectSchema = z.object({
  plant_code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/),
  common_name: z.string().trim().min(1).max(120).optional(),
  scientific_name: z.string().trim().max(160).nullish(),
  category: z.string().trim().min(1).max(80).default("general"),
  group: z.string().trim().min(1).max(80).default("other"),
  family: z.string().trim().max(120).nullish(),
  purposes: z.array(z.string()).default([]),
  growth_stage: growthStageSchema.default("seedling"),
  typical_days_to_harvest: z.number().int().min(0).nullish(),
  germination_days: z.number().int().min(0).nullish(),
  soil_ph_min: z.number().min(0).max(14).nullish(),
  soil_ph_max: z.number().min(0).max(14).nullish(),
  moisture_target: z.number().int().min(0).max(100).nullish(),
  light_hours: z.number().int().min(0).max(24).nullish(),
  spacing_cm: z.number().min(0).nullish(),
  water_liters_per_m2: z.number().min(0).nullish(),
  yield_kg_per_m2: z.number().min(0).nullish(),
  image_url: z.string().url().nullish(),
  is_active: z.boolean().default(true),
  notes: z.string().max(5000).nullish(),
  metadata_json: z.record(z.string(), z.unknown()).default({}),
  i18n: z
    .object({
      vi: z.object({
        common_name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(2000).optional(),
      }),
      en: z.object({
        common_name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(2000).optional(),
      }),
    })
    .optional(),
});

const createMasterPlantSchema = masterPlantObjectSchema
  .superRefine((data, ctx) => {
    if (!data.common_name && !data.i18n?.vi?.common_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "common_name or i18n.vi.common_name is required",
        path: ["common_name"],
      });
    }

    if (!data.i18n?.vi || !data.i18n?.en) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "i18n with both vi and en is required",
        path: ["i18n"],
      });
    }

    if (
      typeof data.soil_ph_min === "number" &&
      typeof data.soil_ph_max === "number" &&
      data.soil_ph_min > data.soil_ph_max
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "soil_ph_min must be <= soil_ph_max",
        path: ["soil_ph_min"],
      });
    }
  });

const updateMasterPlantSchema = masterPlantObjectSchema
  .partial()
  .superRefine((data, ctx) => {
    if (data.i18n && (!data.i18n.vi || !data.i18n.en)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "i18n must include both vi and en",
        path: ["i18n"],
      });
    }

    if (
      typeof data.soil_ph_min === "number" &&
      typeof data.soil_ph_max === "number" &&
      data.soil_ph_min > data.soil_ph_max
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "soil_ph_min must be <= soil_ph_max",
        path: ["soil_ph_min"],
      });
    }
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field is required for update",
  });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  is_active: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) => {
      if (!value) {
        return undefined;
      }

      return value === "true" || value === "1";
    }),
});

interface MasterPlantRow {
  id: number;
  plant_code: string;
  common_name: string;
  scientific_name: string | null;
  category: string;
  group: string;
  family: string | null;
  purposes_json: string;
  growth_stage: string;
  typical_days_to_harvest: number | null;
  germination_days: number | null;
  soil_ph_min: number | null;
  soil_ph_max: number | null;
  moisture_target: number | null;
  light_hours: number | null;
  spacing_cm: number | null;
  water_liters_per_m2: number | null;
  yield_kg_per_m2: number | null;
  image_url: string | null;
  is_active: number;
  notes: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

interface MasterPlantI18nRow {
  id: number;
  master_plant_id: number;
  locale: "vi" | "en";
  common_name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

function parseJson(rawValue: string): any {
  try {
    const parsed = JSON.parse(rawValue);
    return parsed;
  } catch {
    return null;
  }
}

function normalizeMasterPlant(row: MasterPlantRow) {
  return {
    id: row.id,
    plant_code: row.plant_code,
    common_name: row.common_name,
    scientific_name: row.scientific_name,
    category: row.category,
    group: row.group,
    family: row.family,
    purposes: parseJson(row.purposes_json) ?? [],
    growth_stage: row.growth_stage,
    typical_days_to_harvest: row.typical_days_to_harvest,
    germination_days: row.germination_days,
    soil_ph_min: row.soil_ph_min,
    soil_ph_max: row.soil_ph_max,
    moisture_target: row.moisture_target,
    light_hours: row.light_hours,
    spacing_cm: row.spacing_cm,
    water_liters_per_m2: row.water_liters_per_m2,
    yield_kg_per_m2: row.yield_kg_per_m2,
    image_url: row.image_url,
    is_active: Boolean(row.is_active),
    notes: row.notes,
    metadata_json: parseJson(row.metadata_json) || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeI18n(rows: MasterPlantI18nRow[]) {
  const result: Record<"vi" | "en", { common_name: string; description?: string }> = {
    vi: { common_name: "" },
    en: { common_name: "" },
  };

  for (const row of rows) {
    result[row.locale] = {
      common_name: row.common_name,
      ...(row.description ? { description: row.description } : {}),
    };
  }

  return result;
}

function upsertI18n(
  db: SqliteDatabase,
  masterPlantId: number,
  i18n: { vi: { common_name: string; description?: string }; en: { common_name: string; description?: string } },
) {
  const locales: Array<["vi" | "en", { common_name: string; description?: string }]> = [
    ["vi", i18n.vi],
    ["en", i18n.en],
  ];

  for (const [locale, payload] of locales) {
    db.prepare(
      `INSERT INTO master_plant_i18n (master_plant_id, locale, common_name, description)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(master_plant_id, locale) DO UPDATE SET
         common_name = excluded.common_name,
         description = excluded.description,
         updated_at = datetime('now')`,
    ).run(masterPlantId, locale, payload.common_name, payload.description ?? null);
  }
}

function fetchI18n(db: SqliteDatabase, masterPlantId: number) {
  const rows = db
    .prepare(`SELECT * FROM master_plant_i18n WHERE master_plant_id = ?`)
    .all(masterPlantId) as MasterPlantI18nRow[];
  return normalizeI18n(rows);
}

function toSqliteBoolean(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

function normalizeConvexPlant(plant: ConvexPlantLibraryItem) {
  const i18n = {
    vi: { common_name: plant.displayName },
    en: { common_name: plant.scientificName },
  };

  for (const row of plant.i18nRows ?? []) {
    if (row.locale === "vi") {
      i18n.vi = {
        common_name: row.commonName,
        ...(row.description ? { description: row.description } : {}),
      };
    }
    if (row.locale === "en") {
      i18n.en = {
        common_name: row.commonName,
        ...(row.description ? { description: row.description } : {}),
      };
    }
  }

  return {
    id: plant._id,
    plant_code: plant.scientificName,
    common_name: plant.displayName,
    scientific_name: plant.scientificName,
    category: "general",
    group: plant.group ?? "other",
    family: null,
    purposes: plant.purposes ?? [],
    growth_stage: "seedling",
    typical_days_to_harvest: plant.typicalDaysToHarvest ?? null,
    germination_days: plant.germinationDays ?? null,
    soil_ph_min: null,
    soil_ph_max: null,
    moisture_target: null,
    light_hours: null,
    spacing_cm: plant.spacingCm ?? null,
    water_liters_per_m2: plant.waterLitersPerM2 ?? null,
    yield_kg_per_m2: plant.yieldKgPerM2 ?? null,
    image_url: plant.imageUrl ?? null,
    is_active: true,
    notes: plant.description ?? null,
    metadata_json: {
      source: plant.source ?? "convex",
    },
    created_at: null,
    updated_at: null,
    i18n,
  };
}

const bulkSchema = z.object({
  action: z.enum(["activate", "deactivate", "delete"]),
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

const exportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  is_active: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true" || v === "1")),
});

function toCsv(rows: ReturnType<typeof normalizeMasterPlant>[], i18nMap: Map<number, ReturnType<typeof normalizeI18n>>): string {
  const headers = [
    "id", "plant_code", "common_name", "scientific_name", "category", "group", "family",
    "growth_stage", "typical_days_to_harvest", "germination_days",
    "soil_ph_min", "soil_ph_max", "moisture_target", "light_hours",
    "spacing_cm", "water_liters_per_m2", "yield_kg_per_m2",
    "image_url", "is_active", "notes",
    "vi_common_name", "vi_description", "en_common_name", "en_description",
    "created_at", "updated_at",
  ];
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const str = String(v);
    if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
      return `"${str.replace(/"/g, "\"\"")}"`;
    }
    return str;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    const i18n = i18nMap.get(row.id) ?? { vi: { common_name: "" }, en: { common_name: "" } };
    lines.push([
      row.id, row.plant_code, row.common_name, row.scientific_name, row.category, row.group, row.family,
      row.growth_stage, row.typical_days_to_harvest, row.germination_days,
      row.soil_ph_min, row.soil_ph_max, row.moisture_target, row.light_hours,
      row.spacing_cm, row.water_liters_per_m2, row.yield_kg_per_m2,
      row.image_url, row.is_active, row.notes,
      i18n.vi.common_name, i18n.vi.description ?? "",
      i18n.en.common_name, i18n.en.description ?? "",
      row.created_at, row.updated_at,
    ].map(escape).join(","));
  }
  return lines.join("\n");
}

export function createMasterPlantsRouter(db: SqliteDatabase, syncService?: ConvexSyncService): Router {
  const router = Router();

  // ── GET /stats ───────────────────────────────────────
  router.get("/stats", (_req: Request, res: Response, next: NextFunction) => {
    try {
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM master_plants`).get() as { n: number }).n;
      const active = (db.prepare(`SELECT COUNT(*) AS n FROM master_plants WHERE is_active = 1`).get() as { n: number }).n;
      const inactive = (db.prepare(`SELECT COUNT(*) AS n FROM master_plants WHERE is_active = 0`).get() as { n: number }).n;
      const missingVi = (db.prepare(`
        SELECT COUNT(*) AS n FROM master_plants mp
        WHERE NOT EXISTS (
          SELECT 1 FROM master_plant_i18n i
          WHERE i.master_plant_id = mp.id AND i.locale = 'vi' AND i.common_name != ''
        )`).get() as { n: number }).n;
      const missingEn = (db.prepare(`
        SELECT COUNT(*) AS n FROM master_plants mp
        WHERE NOT EXISTS (
          SELECT 1 FROM master_plant_i18n i
          WHERE i.master_plant_id = mp.id AND i.locale = 'en' AND i.common_name != ''
        )`).get() as { n: number }).n;
      const missingImage = (db.prepare(`SELECT COUNT(*) AS n FROM master_plants WHERE image_url IS NULL OR image_url = ''`).get() as { n: number }).n;

      res.json({ total, active, inactive, missingVi, missingEn, missingImage });
    } catch (error) {
      next(error);
    }
  });

  // ── POST /bulk ────────────────────────────────────────
  router.post("/bulk", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = bulkSchema.parse(req.body);
      const placeholders = payload.ids.map(() => "?").join(",");

      if (payload.action === "activate") {
        const result = db
          .prepare(`UPDATE master_plants SET is_active = 1, updated_at = datetime('now') WHERE id IN (${placeholders})`)
          .run(...payload.ids);
        res.json({ affected: result.changes });
      } else if (payload.action === "deactivate") {
        const result = db
          .prepare(`UPDATE master_plants SET is_active = 0, updated_at = datetime('now') WHERE id IN (${placeholders})`)
          .run(...payload.ids);
        res.json({ affected: result.changes });
      } else if (payload.action === "delete") {
        // delete within a transaction so i18n cascade fires correctly
        const deleteFn = db.transaction(() => {
          for (const id of payload.ids) {
            db.prepare(`DELETE FROM master_plants WHERE id = ?`).run(id);
          }
        });
        deleteFn();

        if (syncService) {
          for (const id of payload.ids) {
            try { await syncService.syncDelete(id); } catch { /* best-effort */ }
          }
        }
        res.json({ affected: payload.ids.length });
      }
    } catch (error) {
      next(error);
    }
  });

  // ── GET /export ───────────────────────────────────────
  router.get("/export", (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = exportQuerySchema.parse(req.query);
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (typeof query.is_active === "boolean") {
        conditions.push("is_active = ?");
        params.push(toSqliteBoolean(query.is_active));
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const rows = db
        .prepare(`SELECT * FROM master_plants ${where} ORDER BY id ASC`)
        .all(...params) as MasterPlantRow[];

      const normalized = rows.map(normalizeMasterPlant);

      if (query.format === "csv") {
        const i18nMap = new Map<number, ReturnType<typeof normalizeI18n>>();
        for (const row of rows) {
          i18nMap.set(row.id, fetchI18n(db, row.id));
        }
        const csv = toCsv(normalized, i18nMap);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="master-plants-${Date.now()}.csv"`);
        res.send(csv);
      } else {
        const withI18n = normalized.map((row) => ({ ...row, i18n: fetchI18n(db, row.id) }));
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="master-plants-${Date.now()}.json"`);
        res.json(withI18n);
      }
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listQuerySchema.parse(req.query);

      if (syncService?.canReadFromConvex()) {
        const remotePlants = await syncService.fetchMasterPlants("vi");
        const normalized = (remotePlants ?? []).map(normalizeConvexPlant);
        const filtered = normalized.filter((plant) => {
          if (typeof query.is_active === "boolean" && plant.is_active !== query.is_active) {
            return false;
          }
          if (!query.search) {
            return true;
          }
          const needle = query.search.toLowerCase();
          return [plant.plant_code, plant.common_name, plant.scientific_name]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(needle));
        });

        const offset = (query.page - 1) * query.page_size;
        const data = filtered.slice(offset, offset + query.page_size);

        res.json({
          data,
          pagination: {
            page: query.page,
            page_size: query.page_size,
            total: filtered.length,
          },
        });
        return;
      }

      const offset = (query.page - 1) * query.page_size;

      const conditions: string[] = [];
      const conditionParams: unknown[] = [];

      if (query.search) {
        conditions.push("(plant_code LIKE ? OR common_name LIKE ? OR scientific_name LIKE ?)");
        const value = `%${query.search}%`;
        conditionParams.push(value, value, value);
      }

      if (typeof query.is_active === "boolean") {
        conditions.push("is_active = ?");
        conditionParams.push(toSqliteBoolean(query.is_active));
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const totalRow = db
        .prepare(`SELECT COUNT(*) AS total FROM master_plants ${whereClause}`)
        .get(...conditionParams) as { total: number };

      const rows = db
        .prepare(
          `SELECT * FROM master_plants ${whereClause} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .all(...conditionParams, query.page_size, offset) as MasterPlantRow[];

      const normalized = rows.map((row) => ({
        ...normalizeMasterPlant(row),
        i18n: fetchI18n(db, row.id),
      }));

      res.json({
        data: normalized,
        pagination: {
          page: query.page,
          page_size: query.page_size,
          total: totalRow.total,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const row = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(id) as
        | MasterPlantRow
        | undefined;

      if (!row) {
        res.status(404).json({ error: "Master plant not found" });
        return;
      }

      res.json({ data: { ...normalizeMasterPlant(row), i18n: fetchI18n(db, row.id) } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = createMasterPlantSchema.parse(req.body);
      const i18nPayload = payload.i18n!;
      const resolvedCommonName = payload.common_name ?? i18nPayload.vi.common_name;

      const result = db
        .prepare(
          `INSERT INTO master_plants (
            plant_code,
            common_name,
            scientific_name,
            category,
            "group",
            family,
            purposes_json,
            growth_stage,
            typical_days_to_harvest,
            germination_days,
            soil_ph_min,
            soil_ph_max,
            moisture_target,
            light_hours,
            spacing_cm,
            water_liters_per_m2,
            yield_kg_per_m2,
            image_url,
            is_active,
            notes,
            metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          payload.plant_code,
          resolvedCommonName,
          payload.scientific_name ?? null,
          payload.category,
          payload.group,
          payload.family ?? null,
          JSON.stringify(payload.purposes),
          payload.growth_stage,
          payload.typical_days_to_harvest ?? null,
          payload.germination_days ?? null,
          payload.soil_ph_min ?? null,
          payload.soil_ph_max ?? null,
          payload.moisture_target ?? null,
          payload.light_hours ?? null,
          payload.spacing_cm ?? null,
          payload.water_liters_per_m2 ?? null,
          payload.yield_kg_per_m2 ?? null,
          payload.image_url ?? null,
          toSqliteBoolean(payload.is_active),
          payload.notes ?? null,
          JSON.stringify(payload.metadata_json),
        );

      const row = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(result.lastInsertRowid) as
        | MasterPlantRow
        | undefined;

      if (row) {
        upsertI18n(db, row.id, i18nPayload);
      }

      if (row && syncService) {
        await syncService.syncUpsert({
          ...normalizeMasterPlant(row),
          i18n: i18nPayload,
        });
      }

      res.status(201).json({
        data: row
          ? {
            ...normalizeMasterPlant(row),
            i18n: fetchI18n(db, row.id),
          }
          : null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const payload = updateMasterPlantSchema.parse(req.body);

      const currentRow = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(id) as
        | MasterPlantRow
        | undefined;

      if (!currentRow) {
        res.status(404).json({ error: "Master plant not found" });
        return;
      }

      const currentI18n = fetchI18n(db, currentRow.id);
      const mergedPayload = createMasterPlantSchema.parse({
        ...normalizeMasterPlant(currentRow),
        i18n: currentI18n,
        ...payload,
      });

      db.prepare(
        `UPDATE master_plants SET
          plant_code = ?,
          common_name = ?,
          scientific_name = ?,
          category = ?,
          "group" = ?,
          family = ?,
          purposes_json = ?,
          growth_stage = ?,
          typical_days_to_harvest = ?,
          germination_days = ?,
          soil_ph_min = ?,
          soil_ph_max = ?,
          moisture_target = ?,
          light_hours = ?,
          spacing_cm = ?,
          water_liters_per_m2 = ?,
          yield_kg_per_m2 = ?,
          image_url = ?,
          is_active = ?,
          notes = ?,
          metadata_json = ?,
          updated_at = datetime('now')
        WHERE id = ?`,
      ).run(
        mergedPayload.plant_code,
        mergedPayload.common_name,
        mergedPayload.scientific_name ?? null,
        mergedPayload.category,
        mergedPayload.group,
        mergedPayload.family ?? null,
        JSON.stringify(mergedPayload.purposes),
        mergedPayload.growth_stage,
        mergedPayload.typical_days_to_harvest ?? null,
        mergedPayload.germination_days ?? null,
        mergedPayload.soil_ph_min ?? null,
        mergedPayload.soil_ph_max ?? null,
        mergedPayload.moisture_target ?? null,
        mergedPayload.light_hours ?? null,
        mergedPayload.spacing_cm ?? null,
        mergedPayload.water_liters_per_m2 ?? null,
        mergedPayload.yield_kg_per_m2 ?? null,
        mergedPayload.image_url ?? null,
        toSqliteBoolean(mergedPayload.is_active),
        mergedPayload.notes ?? null,
        JSON.stringify(mergedPayload.metadata_json),
        id,
      );

      const updatedRow = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(id) as MasterPlantRow;
      const updatedI18n = mergedPayload.i18n!;
      upsertI18n(db, id, updatedI18n);

      if (syncService) {
        await syncService.syncUpsert({
          ...normalizeMasterPlant(updatedRow),
          i18n: updatedI18n,
        });
      }
      res.json({ data: { ...normalizeMasterPlant(updatedRow), i18n: fetchI18n(db, id) } });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const result = db.prepare(`DELETE FROM master_plants WHERE id = ?`).run(id);

      if (result.changes === 0) {
        res.status(404).json({ error: "Master plant not found" });
        return;
      }

      if (syncService) {
        await syncService.syncDelete(id);
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function handleMasterPlantsError(error: unknown, res: Response): boolean {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: error.flatten(),
    });
    return true;
  }

  if (error instanceof Error && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "");

    if (code === "SQLITE_CONSTRAINT_UNIQUE") {
      res.status(409).json({ error: "A master plant with this plant_code already exists" });
      return true;
    }

    if (code.startsWith("SQLITE_CONSTRAINT")) {
      res.status(400).json({ error: error.message });
      return true;
    }
  }

  return false;
}
