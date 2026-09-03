import type { ConvexSyncService } from "./convex-sync";
import { bumpSyncCatalogRevision, getSyncCatalogRevision, type SqliteDatabase } from "./db";

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

export interface SyncOutboxGateResult {
  allowed: boolean;
  findingId?: number;
  reason?: string;
}

const OUTBOX_LEASE_SECONDS = 300;

interface OutboxGateRow {
  id: number;
  source_system: string;
  source_id: string;
  payload_json: string;
  override_expires_at?: string | null;
  override_reason?: string | null;
}

function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function overrideIsActive(row: OutboxGateRow): boolean {
  if (!row.override_reason?.trim()) return false;
  if (!row.override_expires_at) return false;
  const expires = Date.parse(row.override_expires_at);
  return Number.isFinite(expires) && expires > Date.now();
}

/**
 * Care-content approval gate (CAP-2026-08-31).
 *
 * A locale is publishable when:
 * - it carries no care content → only `content_status` must be `published`;
 * - it carries non-empty care content → additionally `review_status` must be
 *   `reviewed`, with a non-empty `reviewed_by` and a valid `reviewed_at`.
 *
 * The payload is the complete plant snapshot, so the check walks every locale
 * it carries. The dashboard/SQLite approval action is the only writer that
 * stamps the audit metadata, which keeps the gate server-side and
 * unbypassable by direct API calls.
 */
export function evaluatePayloadApproval(payload: Record<string, unknown>): SyncOutboxGateResult {
  const i18n = payload.i18n;
  if (!i18n || typeof i18n !== "object" || Array.isArray(i18n)) return { allowed: true };
  for (const [locale, row] of Object.entries(i18n as Record<string, unknown>)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const result = evaluateCareLocaleApproval(row as Record<string, unknown>, locale);
    if (!result.allowed) return result;
  }
  return { allowed: true };
}

/**
 * Evaluate one locale using the same rule as the enqueue/send gate.  The
 * dashboard uses this for pending-care notifications, so the notification
 * cannot claim a locale is ready while publication would still reject it.
 */
export function evaluateCareLocaleApproval(
  localeRow: Record<string, unknown>,
  locale = "locale",
): SyncOutboxGateResult {
  const careContent =
    typeof localeRow.care_content === "string" && localeRow.care_content.trim() !== ""
      ? localeRow.care_content
      : null;
  // Absent content_status is the legacy published default everywhere (SQLite
  // column default and the Convex public filter both treat it as published).
  const contentStatus = typeof localeRow.content_status === "string" ? localeRow.content_status : "";
  if (contentStatus !== "" && contentStatus !== "published") {
    return {
      allowed: false,
      reason: `CONTENT_NOT_APPROVED:${locale}:content_status=${contentStatus || "<absent>"}`,
    };
  }
  if (!careContent) return { allowed: true };
  const reviewStatus = typeof localeRow.review_status === "string" ? localeRow.review_status : "";
  const reviewedBy = typeof localeRow.reviewed_by === "string" ? localeRow.reviewed_by.trim() : "";
  const reviewedAt = typeof localeRow.reviewed_at === "string" ? localeRow.reviewed_at.trim() : "";
  if (reviewStatus !== "reviewed") {
    return {
      allowed: false,
      reason: `CONTENT_NOT_APPROVED:${locale}:review_status=${reviewStatus}`,
    };
  }
  if (!reviewedBy) {
    return { allowed: false, reason: `CONTENT_NOT_APPROVED:${locale}:reviewed_by_missing` };
  }
  if (!reviewedAt || !Number.isFinite(Date.parse(reviewedAt))) {
    return { allowed: false, reason: `CONTENT_NOT_APPROVED:${locale}:reviewed_at_invalid` };
  }
  return { allowed: true };
}

/** Throwing form of the approval gate, used as the enqueue-time backstop. */
export function assertPayloadApproved(payload: Record<string, unknown>): void {
  const result = evaluatePayloadApproval(payload);
  if (!result.allowed) {
    throw new Error(result.reason ?? "CONTENT_NOT_APPROVED");
  }
}

/**
 * Authoritative pre-send data-quality gate.  Only a blocked finding captured
 * at the current catalog revision and exact outbox watermark can block a
 * row; stale audit evidence is reported as no block and must be re-audited.
 */
export function evaluateSyncOutboxGate(
  db: SqliteDatabase,
  row: OutboxGateRow,
): SyncOutboxGateResult {
  if (overrideIsActive(row)) return { allowed: true, reason: "active_admin_override" };
  const currentRevision = String(getSyncCatalogRevision(db));
  const currentWatermark = (db.prepare(
    `SELECT COALESCE(MAX(id), 0) AS watermark FROM sync_outbox`,
  ).get() as { watermark: number }).watermark;
  const payload = parseJson(row.payload_json);
  const canonicalKey = typeof payload.canonical_key === "string" ? payload.canonical_key : null;
  const plantCode = typeof payload.plant_code === "string" ? payload.plant_code : null;
  const findings = db.prepare(`
    SELECT id, canonical_key, sqlite_identity_json, evidence_json,
      sqlite_catalog_revision, outbox_watermark
    FROM sync_findings
    WHERE resolution_status = 'open' AND severity = 'blocked'
    ORDER BY id ASC
  `).all() as Array<{
    id: number;
    canonical_key: string | null;
    sqlite_identity_json: string;
    evidence_json: string;
    sqlite_catalog_revision: string | null;
    outbox_watermark: number | null;
  }>;
  for (const finding of findings) {
    if (finding.sqlite_catalog_revision !== currentRevision || finding.outbox_watermark !== currentWatermark) {
      continue;
    }
    let identities: Array<Record<string, unknown>> = [];
    try {
      const parsed = JSON.parse(finding.sqlite_identity_json) as unknown;
      if (Array.isArray(parsed)) identities = parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
    } catch {
      identities = [];
    }
    let evidence = parseJson(finding.evidence_json);
    const sourceMatch = identities.some((identity) => (
      String(identity.sourceSystem ?? "") === row.source_system
      && String(identity.sourceId ?? "") === row.source_id
    ));
    const codeMatch = plantCode !== null && identities.some((identity) => String(identity.plantCode ?? "") === plantCode);
    const keyMatch = canonicalKey !== null && finding.canonical_key === canonicalKey;
    const rowIdMatch = typeof evidence.rowId === "number" && typeof payload.id === "number" && evidence.rowId === payload.id;
    if (sourceMatch || codeMatch || keyMatch || rowIdMatch) {
      return {
        allowed: false,
        findingId: finding.id,
        reason: `blocked_by_finding:${finding.id}`,
      };
    }
  }
  return { allowed: true };
}

export function enqueueSyncOutbox(db: SqliteDatabase, item: SyncOutboxItem): number {
  assertPayloadApproved(item.payload);
  const dedupeKey = [item.operation, item.entityType, item.sourceSystem, item.sourceId, item.locale ?? ""]
    .join(":");
  db.prepare(`
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
  const row = db.prepare(`SELECT id FROM sync_outbox WHERE dedupe_key = ?`).get(dedupeKey) as { id: number };
  // This is reached inside the same writer transaction for normal API
  // mutations. Keep the freshness revision and outbox watermark atomic.
  bumpSyncCatalogRevision(db);
  return Number(row.id);
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
    return { processed: 0, applied: 0, failed: 0, blocked: 0, skipped: true };
  }

  const rows = db.prepare(`
    SELECT * FROM sync_outbox
    WHERE (
      status IN ('pending', 'failed')
      AND next_attempt_at <= datetime('now')
    ) OR (
      status = 'processing'
      AND coalesce(lease_expires_at, datetime('now')) <= datetime('now')
    )
    ORDER BY id ASC
    LIMIT ?
  `).all(Math.max(1, Math.min(100, limit))) as Array<{
    id: number;
    operation: SyncOutboxOperation;
    source_system: string;
    source_id: string;
    payload_json: string;
    attempt_count: number;
    lease_expires_at?: string | null;
  }>;

  let applied = 0;
  let failed = 0;
  let blocked = 0;
  const items: Array<{
    id: number;
    operation: SyncOutboxOperation;
    sourceId: string;
    status: "applied" | "failed" | "blocked" | "superseded" | "skipped";
    error?: string;
  }> = [];
  for (const row of rows) {
    const recordItem = (status: "applied" | "failed" | "blocked" | "superseded" | "skipped", error?: string) => {
      items.push({ id: row.id, operation: row.operation, sourceId: row.source_id, status, error });
    };
    const newerSnapshot = db.prepare(`
      SELECT id FROM sync_outbox
      WHERE source_system = ? AND source_id = ? AND id > ?
        AND status IN ('pending', 'failed', 'processing', 'blocked')
      ORDER BY id ASC LIMIT 1
    `).get(row.source_system, row.source_id, row.id) as { id: number } | undefined;
    if (newerSnapshot) {
      db.prepare(`
        UPDATE sync_outbox
        SET status = 'superseded', superseded_by = ?, superseded_at = datetime('now'),
            last_error = 'superseded_by_newer_plant_snapshot', updated_at = datetime('now'),
            lease_expires_at = NULL
        WHERE id = ? AND status IN ('pending', 'failed', 'processing')
      `).run(newerSnapshot.id, row.id);
      recordItem("superseded");
      continue;
    }
    const preClaimGate = evaluateSyncOutboxGate(db, row);
    if (!preClaimGate.allowed) {
      db.prepare(`
        UPDATE sync_outbox
        SET status = 'blocked', blocked_finding_id = ?, blocked_at = datetime('now'),
            blocked_reason = ?, lease_expires_at = NULL, updated_at = datetime('now')
        WHERE id = ? AND (
          status IN ('pending', 'failed')
          OR (status = 'processing' AND coalesce(lease_expires_at, datetime('now')) <= datetime('now'))
        )
      `).run(preClaimGate.findingId ?? null, preClaimGate.reason ?? "blocked_by_data_quality", row.id);
      blocked++;
      recordItem("blocked", preClaimGate.reason ?? "blocked_by_data_quality");
      continue;
    }
    const preClaimApproval = evaluatePayloadApproval(parseJson(row.payload_json));
    if (!preClaimApproval.allowed) {
      db.prepare(`
        UPDATE sync_outbox
        SET status = 'blocked', blocked_finding_id = NULL, blocked_at = datetime('now'),
            blocked_reason = ?, lease_expires_at = NULL, updated_at = datetime('now')
        WHERE id = ? AND (
          status IN ('pending', 'failed')
          OR (status = 'processing' AND coalesce(lease_expires_at, datetime('now')) <= datetime('now'))
        )
      `).run(preClaimApproval.reason ?? "CONTENT_NOT_APPROVED", row.id);
      blocked++;
      recordItem("blocked", preClaimApproval.reason ?? "CONTENT_NOT_APPROVED");
      continue;
    }
    const claimed = db.prepare(`
      UPDATE sync_outbox
      SET status = 'processing', last_attempt_at = datetime('now'),
          lease_expires_at = datetime('now', '+${OUTBOX_LEASE_SECONDS} seconds'),
          updated_at = datetime('now')
      WHERE id = ? AND (
        status IN ('pending', 'failed')
        OR (status = 'processing' AND coalesce(lease_expires_at, datetime('now')) <= datetime('now'))
      )
    `).run(row.id);
    if (claimed.changes === 0) continue;

    try {
      // Recheck immediately before the external call so a finding created
      // while this item was being claimed cannot be bypassed.
      const sendGate = evaluateSyncOutboxGate(db, row);
      if (!sendGate.allowed) {
        db.prepare(`
          UPDATE sync_outbox
          SET status = 'blocked', blocked_finding_id = ?, blocked_at = datetime('now'),
              blocked_reason = ?, lease_expires_at = NULL, updated_at = datetime('now')
          WHERE id = ? AND status = 'processing'
        `).run(sendGate.findingId ?? null, sendGate.reason ?? "blocked_by_data_quality", row.id);
        blocked++;
        recordItem("blocked", sendGate.reason ?? "blocked_by_data_quality");
        continue;
      }
      const newerBeforeSend = db.prepare(`
        SELECT id FROM sync_outbox
        WHERE source_system = ? AND source_id = ? AND id > ?
          AND status IN ('pending', 'failed', 'processing', 'blocked')
        ORDER BY id ASC LIMIT 1
      `).get(row.source_system, row.source_id, row.id) as { id: number } | undefined;
      if (newerBeforeSend) {
        db.prepare(`
          UPDATE sync_outbox
          SET status = 'superseded', superseded_by = ?, superseded_at = datetime('now'),
              last_error = 'superseded_by_newer_plant_snapshot', lease_expires_at = NULL,
              updated_at = datetime('now')
          WHERE id = ? AND status = 'processing'
        `).run(newerBeforeSend.id, row.id);
        recordItem("superseded");
        continue;
      }
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      // Delivery-time approval recheck: a row that was approved when queued
      // can still be stale or manually altered; an unapproved care payload is
      // never sent, mirroring the enqueue gate.
      const sendApproval = evaluatePayloadApproval(payload);
      if (!sendApproval.allowed) {
        db.prepare(`
          UPDATE sync_outbox
          SET status = 'blocked', blocked_finding_id = NULL, blocked_at = datetime('now'),
              blocked_reason = ?, lease_expires_at = NULL, updated_at = datetime('now')
          WHERE id = ? AND status = 'processing'
        `).run(sendApproval.reason ?? "CONTENT_NOT_APPROVED", row.id);
        blocked++;
        recordItem("blocked", sendApproval.reason ?? "CONTENT_NOT_APPROVED");
        continue;
      }
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
        SET status = 'applied', applied_at = datetime('now'), lease_expires_at = NULL,
            updated_at = datetime('now'), last_error = NULL
        WHERE id = ?
      `).run(row.id);
      applied++;
      recordItem("applied");
    } catch (error) {
      const attemptCount = row.attempt_count + 1;
      const status = attemptCount >= 10 ? "failed" : "pending";
      const delay = nextAttemptDelaySeconds(attemptCount);
      const message = error instanceof Error ? error.message : String(error);
      db.prepare(`
        UPDATE sync_outbox
        SET status = ?, attempt_count = ?, next_attempt_at = datetime('now', ?),
            last_error = ?, lease_expires_at = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(status, attemptCount, `+${delay} seconds`, message.slice(0, 1000), row.id);
      failed++;
      recordItem("failed", message.slice(0, 1000));
    }
  }

  return { processed: rows.length, applied, failed, blocked, skipped: false, items };
}

export function retryFailedSyncOutbox(db: SqliteDatabase): number {
  const result = db.prepare(`
    UPDATE sync_outbox
    SET status = 'pending', next_attempt_at = datetime('now'), last_error = NULL, updated_at = datetime('now')
    WHERE status = 'failed'
  `).run();
  return result.changes;
}

function writeOutboxAudit(
  db: SqliteDatabase,
  outboxId: number,
  findingId: number | null,
  action: "requeue" | "override",
  operatorId: string,
  reason: string,
  expiresAt: string | null,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): void {
  db.prepare(`
    INSERT INTO sync_outbox_audit (
      outbox_id, finding_id, action, operator_id, reason, expires_at,
      before_json, after_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    outboxId,
    findingId,
    action,
    operatorId.trim(),
    reason.trim(),
    expiresAt,
    JSON.stringify(before),
    JSON.stringify(after),
  );
}

/** Requeue only after the referenced finding has been explicitly resolved. */
export function requeueResolvedSyncOutbox(
  db: SqliteDatabase,
  outboxId: number,
  operatorId: string,
  reason: string,
): void {
  if (!operatorId.trim() || !reason.trim()) throw new Error("Operator and reason are required");
  const row = db.prepare(`SELECT * FROM sync_outbox WHERE id = ? AND status = 'blocked'`).get(outboxId) as (OutboxGateRow & {
    status: string;
    blocked_finding_id: number | null;
  }) | undefined;
  if (!row) throw new Error("Blocked outbox item not found");
  if (row.blocked_finding_id === null) throw new Error("Blocked outbox item has no finding");
  const finding = db.prepare(`SELECT resolution_status FROM sync_findings WHERE id = ?`).get(row.blocked_finding_id) as { resolution_status: string } | undefined;
  if (!finding || finding.resolution_status !== "resolved") {
    throw new Error("Finding must be resolved before requeue");
  }
  db.transaction(() => {
    db.prepare(`
      UPDATE sync_outbox
      SET status = 'pending', blocked_finding_id = NULL, blocked_at = NULL,
          blocked_by = ?, blocked_reason = NULL, next_attempt_at = datetime('now'),
          last_error = NULL, updated_at = datetime('now')
      WHERE id = ? AND status = 'blocked'
    `).run(operatorId.trim(), outboxId);
    writeOutboxAudit(db, outboxId, row.blocked_finding_id, "requeue", operatorId, reason, null,
      { status: "blocked", blocked_finding_id: row.blocked_finding_id },
      { status: "pending" });
  })();
}

/** Requeue with a bounded, explicit admin override and durable audit row. */
export function overrideBlockedSyncOutbox(
  db: SqliteDatabase,
  outboxId: number,
  operatorId: string,
  reason: string,
  expiresAt?: string | null,
): string {
  if (!operatorId.trim() || !reason.trim()) throw new Error("Operator and reason are required");
  const overrideId = `outbox-override-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const row = db.prepare(`SELECT * FROM sync_outbox WHERE id = ? AND status = 'blocked'`).get(outboxId) as (OutboxGateRow & {
    status: string;
    blocked_finding_id: number | null;
  }) | undefined;
  if (!row) throw new Error("Blocked outbox item not found");
  const expires = expiresAt?.trim() || "";
  if (!expires || !Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= Date.now()) {
    throw new Error("Override expiry must be a future timestamp");
  }
  db.transaction(() => {
    db.prepare(`
      UPDATE sync_outbox
      SET status = 'pending', blocked_at = NULL, blocked_by = ?,
          blocked_reason = NULL, next_attempt_at = datetime('now'),
          last_error = NULL, override_id = ?, override_reason = ?,
          override_expires_at = ?, updated_at = datetime('now')
      WHERE id = ? AND status = 'blocked'
    `).run(operatorId.trim(), overrideId, reason.trim(), expires, outboxId);
    writeOutboxAudit(db, outboxId, row.blocked_finding_id, "override", operatorId, reason, expires,
      { status: "blocked", blocked_finding_id: row.blocked_finding_id },
      { status: "pending", override_id: overrideId, override_expires_at: expires });
  })();
  return overrideId;
}
