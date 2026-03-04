import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import type { ConvexSyncService } from "./convex-sync";
import type { SqliteDatabase } from "./db";

const i18nSchema = z.object({
    master_plant_id: z.number().int().positive(),
    locale: z.enum(["vi", "en"]),
    common_name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(5000).nullish(),
    care_content_json: z.record(z.string(), z.unknown()).default({}),
});

const updateI18nSchema = i18nSchema.omit({ master_plant_id: true, locale: true }).partial();

interface I18nRow {
    id: number;
    master_plant_id: number;
    locale: string;
    common_name: string;
    description: string | null;
    care_content_json: string;
    content_version: number;
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
        care_content_json: JSON.parse(row.care_content_json || "{}"),
        content_version: row.content_version,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
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
            const payload = i18nSchema.parse(req.body);

            const result = db.prepare(`
        INSERT INTO master_plant_i18n (
          master_plant_id, locale, common_name, description, care_content_json
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(master_plant_id, locale) DO UPDATE SET
          common_name = excluded.common_name,
          description = excluded.description,
          care_content_json = excluded.care_content_json,
          content_version = content_version + 1,
          updated_at = datetime('now')
      `).run(
                payload.master_plant_id,
                payload.locale,
                payload.common_name,
                payload.description ?? null,
                JSON.stringify(payload.care_content_json)
            );

            const rowId = result.lastInsertRowid === 0n ?
                (db.prepare(`SELECT id FROM master_plant_i18n WHERE master_plant_id = ? AND locale = ?`).get(payload.master_plant_id, payload.locale) as { id: number }).id :
                Number(result.lastInsertRowid);

            const row = db.prepare(`SELECT * FROM master_plant_i18n WHERE id = ?`).get(rowId) as I18nRow;

            // Note: In a real app, we might want to sync this to Convex as well.
            // For now, masterSync.ts in Convex seems to take common_name from the main table.
            // We should probably update Convex to support i18n sync.

            res.status(201).json({ data: normalizeI18n(row) });
        } catch (error) {
            next(error);
        }
    });

    router.delete("/:id", (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = z.coerce.number().int().positive().parse(req.params.id);
            db.prepare(`DELETE FROM master_plant_i18n WHERE id = ?`).run(id);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    });

    return router;
}
