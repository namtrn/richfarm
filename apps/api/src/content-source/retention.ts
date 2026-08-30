import fs from "node:fs";
import path from "node:path";

import type { SqliteDatabase } from "../db";
import {
  RETENTION_MAX_DATABASE_BYTES_DEFAULT,
  RETENTION_TERMINAL_EVENT_DAYS_DEFAULT,
} from "./contract";

export interface ContentSourceRetentionOptions {
  /**
   * Deletion stays disabled until backup/rebuild behavior has been proven on
   * the target database, per MCD-2.
   */
  enabled?: boolean;
  terminalEventDays?: number;
  maxDatabaseBytes?: number;
  /** Daily maintenance pass compacts regardless of the size trigger. */
  maintenancePass?: boolean;
  nowMs?: number;
}

export interface ContentSourceCompactionReport {
  ran: boolean;
  enabled: boolean;
  trigger: "disabled" | "size" | "maintenance" | "none";
  databaseBytes: number;
  maxDatabaseBytes: number;
  terminalEventsDeleted: number;
  preservedLatestPerPath: number;
  cutoffIso: string;
}

export function getDatabaseByteSize(db: SqliteDatabase): number {
  const row = db
    .prepare(`PRAGMA page_count`)
    .get() as { page_count?: number } | undefined;
  const pageSize = db.prepare(`PRAGMA page_size`).get() as
    | { page_size?: number }
    | undefined;
  return (row?.page_count ?? 0) * (pageSize?.page_size ?? 0);
}

/**
 * Journal retention: pending/blocked/approved and supersession evidence are
 * never deleted; terminal (applied/dismissed) events older than the cutoff are
 * removed except the latest event per path, preserving one audit anchor per
 * entity/path. Monitor run metrics are aggregated evidence and are kept.
 */
export function compactContentSourceJournal(
  db: SqliteDatabase,
  options: ContentSourceRetentionOptions = {},
): ContentSourceCompactionReport {
  const enabled = options.enabled ?? false;
  const terminalEventDays = options.terminalEventDays ?? RETENTION_TERMINAL_EVENT_DAYS_DEFAULT;
  const maxDatabaseBytes = options.maxDatabaseBytes ?? RETENTION_MAX_DATABASE_BYTES_DEFAULT;
  const nowMs = options.nowMs ?? Date.now();
  const databaseBytes = getDatabaseByteSize(db);

  if (!enabled) {
    return {
      ran: false,
      enabled: false,
      trigger: "disabled",
      databaseBytes,
      maxDatabaseBytes,
      terminalEventsDeleted: 0,
      preservedLatestPerPath: 0,
      cutoffIso: new Date(nowMs - terminalEventDays * 86_400_000).toISOString(),
    };
  }

  const trigger: ContentSourceCompactionReport["trigger"] =
    options.maintenancePass === true || databaseBytes > maxDatabaseBytes
      ? options.maintenancePass === true
        ? "maintenance"
        : "size"
      : "none";

  if (trigger === "none") {
    return {
      ran: false,
      enabled: true,
      trigger,
      databaseBytes,
      maxDatabaseBytes,
      terminalEventsDeleted: 0,
      preservedLatestPerPath: 0,
      cutoffIso: new Date(nowMs - terminalEventDays * 86_400_000).toISOString(),
    };
  }

  const cutoffIso = new Date(nowMs - terminalEventDays * 86_400_000).toISOString();
  return db.transaction(() => {
    const preservedRow = db
      .prepare(
        `SELECT COUNT(*) AS count FROM (
           SELECT MAX(id) AS keep_id FROM content_change_events GROUP BY path
         ) WHERE keep_id IN (
           SELECT id FROM content_change_events
           WHERE review_state IN ('applied', 'dismissed') AND reviewed_at < ?
         )`,
      )
      .get(cutoffIso) as { count: number };
    const result = db
      .prepare(
        `DELETE FROM content_change_events
         WHERE review_state IN ('applied', 'dismissed')
           AND reviewed_at < ?
           AND id NOT IN (SELECT MAX(id) FROM content_change_events GROUP BY path)`,
      )
      .run(cutoffIso);
    return {
      ran: true,
      enabled: true,
      trigger,
      databaseBytes,
      maxDatabaseBytes,
      terminalEventsDeleted: result.changes,
      preservedLatestPerPath: preservedRow.count,
      cutoffIso,
    };
  })();
}

/** File-level backup used before any deletion-capable operation or migration. */
export function backupSqliteDatabaseFile(
  dbPath: string,
  backupPath: string,
): { bytes: number } {
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(dbPath, backupPath);
  return { bytes: fs.statSync(backupPath).size };
}
