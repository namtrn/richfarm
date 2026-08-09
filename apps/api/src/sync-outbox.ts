import type { ConvexSyncService } from "./convex-sync";
import type { SqliteDatabase } from "./db";

export type SyncOutboxOperation =
  | "upsert_plant"
  | "delete_plant"
  | "upsert_i18n"
  | "delete_i18n";

export interface SyncOutboxItem {
  entityType: "master_plant";
  sourceSystem: string;
  sourceId: string;
  operation: SyncOutboxOperation;
  locale?: string;
  payload: Record<string, unknown>;
}

export interface SyncOutboxApplyHooks {
  applyUpsert?: (payload: Record<string, unknown>) => void;
  applyDelete?: (identity: { sourceSystem: string; sourceId: string }) => void;
}

export function enqueueSyncOutbox(db: SqliteDatabase, item: SyncOutboxItem): number {
  const dedupeKey = [item.operation, item.entityType, item.sourceSystem, item.sourceId, item.locale ?? ""]
    .join(":");
  const result = db.prepare(`
    INSERT INTO sync_outbox (
      dedupe_key, entity_type, source_system, source_id, operation, locale,
      payload_json, status, attempt_count, next_attempt_at, last_error,
      updated_at, applied_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, datetime('now'), NULL, datetime('now'), NULL)
    ON CONFLICT(dedupe_key) DO UPDATE SET
      payload_json = excluded.payload_json,
      status = 'pending',
      next_attempt_at = datetime('now'),
      last_error = NULL,
      updated_at = datetime('now'),
      applied_at = NULL
  `).run(
    dedupeKey,
    item.entityType,
    item.sourceSystem,
    item.sourceId,
    item.operation,
    item.locale ?? null,
    JSON.stringify(item.payload),
  );
  return Number(result.lastInsertRowid);
}

function nextAttemptDelaySeconds(attempt: number): number {
  return Math.min(3600, Math.max(5, 2 ** Math.min(attempt, 9)));
}

export async function processSyncOutbox(
  db: SqliteDatabase,
  syncService: ConvexSyncService | undefined,
  limit = 25,
  hooks: SyncOutboxApplyHooks = {},
) {
  if (!syncService?.isEnabled()) {
    return { processed: 0, applied: 0, failed: 0, skipped: true };
  }

  const rows = db.prepare(`
    SELECT * FROM sync_outbox
    WHERE status IN ('pending', 'failed')
      AND next_attempt_at <= datetime('now')
    ORDER BY id ASC
    LIMIT ?
  `).all(Math.max(1, Math.min(100, limit))) as Array<{
    id: number;
    operation: SyncOutboxOperation;
    source_system: string;
    source_id: string;
    payload_json: string;
    attempt_count: number;
  }>;

  let applied = 0;
  let failed = 0;
  for (const row of rows) {
    const claimed = db.prepare(`
      UPDATE sync_outbox
      SET status = 'processing', last_attempt_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND status IN ('pending', 'failed')
    `).run(row.id);
    if (claimed.changes === 0) continue;

    try {
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      if (row.operation === "delete_plant") {
        await syncService.syncDelete({
          id: typeof payload.id === "number" ? payload.id : undefined,
          sourceSystem: row.source_system,
          sourceId: row.source_id,
        });
        hooks.applyDelete?.({
          sourceSystem: row.source_system,
          sourceId: row.source_id,
        });
      } else {
        await syncService.syncUpsert(payload);
        hooks.applyUpsert?.(payload);
      }

      db.prepare(`
        UPDATE sync_outbox
        SET status = 'applied', applied_at = datetime('now'), updated_at = datetime('now'), last_error = NULL
        WHERE id = ?
      `).run(row.id);
      applied++;
    } catch (error) {
      const attemptCount = row.attempt_count + 1;
      const status = attemptCount >= 10 ? "failed" : "pending";
      const delay = nextAttemptDelaySeconds(attemptCount);
      const message = error instanceof Error ? error.message : String(error);
      db.prepare(`
        UPDATE sync_outbox
        SET status = ?, attempt_count = ?, next_attempt_at = datetime('now', ?),
            last_error = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(status, attemptCount, `+${delay} seconds`, message.slice(0, 1000), row.id);
      failed++;
    }
  }

  return { processed: rows.length, applied, failed, skipped: false };
}

export function retryFailedSyncOutbox(db: SqliteDatabase): number {
  const result = db.prepare(`
    UPDATE sync_outbox
    SET status = 'pending', next_attempt_at = datetime('now'), last_error = NULL, updated_at = datetime('now')
    WHERE status = 'failed'
  `).run();
  return result.changes;
}
