import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { ZodError, z } from "zod";

import type { ConvexSyncService } from "./convex-sync";
import type { SqliteDatabase } from "./db";

const growthStageSchema = z.enum(["seedling", "vegetative", "flowering", "harvest"]);

const masterPlantObjectSchema = z.object({
  plant_code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/),
  common_name: z.string().trim().min(1).max(120),
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
});

const createMasterPlantSchema = masterPlantObjectSchema
  .superRefine((data, ctx) => {
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

function toSqliteBoolean(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

export function createMasterPlantsRouter(db: SqliteDatabase, syncService?: ConvexSyncService): Router {
  const router = Router();

  router.get("/", (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listQuerySchema.parse(req.query);
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

      res.json({
        data: rows.map(normalizeMasterPlant),
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

      res.json({ data: normalizeMasterPlant(row) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = createMasterPlantSchema.parse(req.body);

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
          payload.common_name,
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

      if (row && syncService) {
        await syncService.syncUpsert(normalizeMasterPlant(row));
      }

      res.status(201).json({ data: row ? normalizeMasterPlant(row) : null });
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

      const mergedPayload = createMasterPlantSchema.parse({
        ...normalizeMasterPlant(currentRow),
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
      if (syncService) {
        await syncService.syncUpsert(normalizeMasterPlant(updatedRow));
      }
      res.json({ data: normalizeMasterPlant(updatedRow) });
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
