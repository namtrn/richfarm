import type { SqliteDatabase } from "./db";
import { evaluateCareLocaleApproval } from "./sync-outbox";

export type PendingCareApproval = {
  plantId: number;
  plantCode: string;
  displayName: string;
  scientificName: string | null;
  locales: string[];
  updatedAt: string | null;
};

export type PendingCareApprovalSummary = {
  count: number;
  pendingLocaleCount: number;
  items: PendingCareApproval[];
};

type PendingCareApprovalRow = {
  plant_id: number;
  plant_code: string;
  display_name: string;
  scientific_name: string | null;
  locale: string;
  care_content: string | null;
  content_status: string | null;
  review_status: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  locale_updated_at: string | null;
  plant_updated_at: string | null;
};

function isMoreRecent(candidate: string | null, current: string | null): boolean {
  if (!candidate) return false;
  if (!current) return true;
  const candidateTime = Date.parse(candidate);
  const currentTime = Date.parse(current);
  if (Number.isFinite(candidateTime) && Number.isFinite(currentTime)) {
    return candidateTime > currentTime;
  }
  return candidate > current;
}

/**
 * List the second-stage care approvals that still need an admin/editor action.
 * This deliberately reads SQLite authoring state, not the outbox: a row is
 * only ready for the outbox after this approval has been completed.
 */
export function listPendingCareApprovals(db: SqliteDatabase): PendingCareApprovalSummary {
  const rows = db.prepare(`
    SELECT
      mp.id AS plant_id,
      mp.plant_code,
      COALESCE(
        NULLIF(TRIM(vi.common_name), ''),
        NULLIF(TRIM(mp.common_name), ''),
        NULLIF(TRIM(mp.scientific_name), ''),
        mp.plant_code
      ) AS display_name,
      mp.scientific_name,
      i.locale,
      i.care_content,
      i.content_status,
      i.review_status,
      i.reviewed_at,
      i.reviewed_by,
      i.updated_at AS locale_updated_at,
      mp.updated_at AS plant_updated_at
    FROM master_plant_i18n i
    JOIN master_plants mp ON mp.id = i.master_plant_id
    LEFT JOIN master_plant_i18n vi
      ON vi.master_plant_id = mp.id AND vi.locale = 'vi'
    WHERE i.care_content IS NOT NULL AND TRIM(i.care_content) <> ''
    ORDER BY i.updated_at DESC, mp.id ASC, i.locale ASC
  `).all() as PendingCareApprovalRow[];

  const grouped = new Map<number, PendingCareApproval>();
  let pendingLocaleCount = 0;
  for (const row of rows) {
    const approval = evaluateCareLocaleApproval({
      care_content: row.care_content,
      content_status: row.content_status,
      review_status: row.review_status,
      reviewed_at: row.reviewed_at,
      reviewed_by: row.reviewed_by,
    }, row.locale);
    if (approval.allowed) continue;

    pendingLocaleCount++;
    const updatedAt = row.locale_updated_at ?? row.plant_updated_at;
    const existing = grouped.get(row.plant_id);
    if (existing) {
      existing.locales.push(row.locale);
      if (isMoreRecent(updatedAt, existing.updatedAt)) existing.updatedAt = updatedAt;
      continue;
    }
    grouped.set(row.plant_id, {
      plantId: row.plant_id,
      plantCode: row.plant_code,
      displayName: row.display_name,
      scientificName: row.scientific_name,
      locales: [row.locale],
      updatedAt,
    });
  }

  const items = Array.from(grouped.values())
    .map((item) => ({
      ...item,
      locales: item.locales.slice().sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => {
      if (a.updatedAt && b.updatedAt && a.updatedAt !== b.updatedAt) {
        return b.updatedAt.localeCompare(a.updatedAt);
      }
      return a.displayName.localeCompare(b.displayName, "vi") || a.plantId - b.plantId;
    });

  return { count: items.length, pendingLocaleCount, items };
}
