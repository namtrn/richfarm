// RichFarm — Adaptation taxonomy mirror routes (design doc §2.4)
// SQLite mirrors the Convex term catalog; Convex remains authoritative.
// GET  /api/adaptation-terms        — read the mirror (editor+admin)
// POST /api/adaptation-terms/refresh — hydrate the mirror from Convex (admin)

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { ConvexSyncService } from "./convex-sync";
import type { SqliteDatabase } from "./db";
import { adaptationTermsHealth } from "./master-plants";

interface MirrorTerm {
  code: string;
  dimension: string;
  status: string;
  sortOrder: number;
}

interface MirrorTranslation {
  locale: string;
  label: string;
  description: string | null;
  translationStatus: string;
}

interface ConvexAdaptationTerm {
  _id: string;
  code: string;
  dimension: string;
  status: string;
  sortOrder: number;
  usageCount: number;
  translations: Array<{
    locale: string;
    label: string;
    description?: string;
    translationStatus: string;
  }>;
}

const DIMENSION_ORDER = new Map<string, number>([
  ["temperature", 0],
  ["moisture", 1],
  ["climate", 2],
  ["season", 3],
]);

function listMirrorTerms(db: SqliteDatabase) {
  const terms = db.prepare(
    `SELECT code, dimension, status, sort_order AS sortOrder FROM adaptation_terms`,
  ).all() as MirrorTerm[];
  const translations = db.prepare(
    `SELECT term_code AS termCode, locale, label, description, translation_status AS translationStatus
     FROM adaptation_term_i18n`,
  ).all() as Array<MirrorTranslation & { termCode: string }>;
  const usage = db.prepare(
    `SELECT term_code AS termCode, COUNT(*) AS n FROM plant_adaptation_terms GROUP BY term_code`,
  ).all() as Array<{ termCode: string; n: number }>;
  const usageByCode = new Map(usage.map((row) => [row.termCode, row.n]));
  const translationsByCode = new Map<string, MirrorTranslation[]>();
  for (const row of translations) {
    const list = translationsByCode.get(row.termCode) ?? [];
    list.push({
      locale: row.locale,
      label: row.label,
      description: row.description,
      translationStatus: row.translationStatus,
    });
    translationsByCode.set(row.termCode, list);
  }

  return terms
    .sort((left, right) => {
      const leftDimension = DIMENSION_ORDER.get(left.dimension) ?? 999;
      const rightDimension = DIMENSION_ORDER.get(right.dimension) ?? 999;
      if (leftDimension !== rightDimension) return leftDimension - rightDimension;
      return left.sortOrder - right.sortOrder;
    })
    .map((term) => ({
      code: term.code,
      dimension: term.dimension,
      status: term.status,
      sortOrder: term.sortOrder,
      usageCount: usageByCode.get(term.code) ?? 0,
      translations: translationsByCode.get(term.code) ?? [],
    }));
}

export function createAdaptationTermsRouter(
  db: SqliteDatabase,
  syncService?: ConvexSyncService,
): Router {
  const router = Router();

  router.get("/", (_req: Request, res: Response) => {
    res.json({ data: listMirrorTerms(db) });
  });

  router.post("/refresh", async (req: Request, res: Response, next: NextFunction) => {
    if (req.authUser?.role !== "admin") {
      res.status(403).json({ error: "Forbidden: adaptation-terms refresh is admin-only" });
      return;
    }
    if (!syncService?.isAdminProxyEnabled?.()) {
      res.status(503).json({
        error: "Convex admin proxy is not configured; cannot refresh the taxonomy mirror",
        code: "CONVEX_ADMIN_PROXY_NOT_CONFIGURED",
        retryable: false,
      });
      return;
    }

    try {
      const terms = await syncService.adminQuery<ConvexAdaptationTerm[]>(
        "plantAdmin:listAdaptationTerms",
        {},
      );
      // Guard: never wipe a populated mirror from an empty Convex response
      // (unseeded target). This keeps the fail-closed authoring boundary.
      const mirrorCount = (db.prepare(`SELECT COUNT(*) AS n FROM adaptation_terms`).get() as { n: number }).n;
      if (terms.length === 0 && mirrorCount > 0) {
        res.status(502).json({
          error: "Convex returned no adaptation terms; refusing to wipe the existing mirror",
          retryable: true,
        });
        return;
      }

      const apply = db.transaction(() => {
        db.prepare(`DELETE FROM adaptation_term_i18n`).run();
        db.prepare(`DELETE FROM adaptation_terms`).run();
        const insertTerm = db.prepare(
          `INSERT INTO adaptation_terms (code, dimension, status, sort_order) VALUES (?, ?, ?, ?)`,
        );
        const insertI18n = db.prepare(
          `INSERT INTO adaptation_term_i18n (term_code, locale, label, description, translation_status) VALUES (?, ?, ?, ?, ?)`,
        );
        for (const term of terms) {
          insertTerm.run(term.code, term.dimension, term.status, term.sortOrder);
          for (const translation of term.translations) {
            insertI18n.run(
              term.code,
              translation.locale,
              translation.label,
              translation.description ?? null,
              translation.translationStatus,
            );
          }
        }
      });
      apply();

      res.json({ data: adaptationTermsHealth(db) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
