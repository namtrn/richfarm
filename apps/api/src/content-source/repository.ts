import crypto from "node:crypto";

import type { SqliteDatabase } from "../db";
import { stableJson } from "../content-manifests";
import {
  CONTENT_SOURCE_ROOTS,
  assertReviewTransition,
  isTerminalReviewState,
  type ContentCheckpointKind,
  type ContentDetectorSource,
  type ContentEventType,
  type ContentEntityKind,
  type ContentOwnerStatus,
  type ContentReviewState,
  type ContentRunMode,
  type ContentRunStatus,
  type ContentSourceFileKind,
  type ContentSourceFileState,
} from "./contract";
import { caseFoldCollisionKey } from "./paths";

export function nowIso(): string {
  return new Date().toISOString();
}

export interface ContentSourceFileObservation {
  path: string;
  rootKey: string;
  entityKind: ContentEntityKind;
  entityKey?: string | null;
  locale?: string | null;
  fileKind: ContentSourceFileKind;
  owningManifestPath?: string | null;
  observedMtimeMs?: number | null;
  byteSize?: number | null;
  sha256?: string | null;
  contentVersion?: number | null;
  ownerStatus?: ContentOwnerStatus | null;
  validationSummary?: Record<string, unknown>;
}

export interface ContentSourceFileRow {
  id: number;
  path: string;
  root_key: string;
  entity_kind: string;
  entity_key: string | null;
  locale: string | null;
  file_kind: string;
  owning_manifest_path: string | null;
  observed_mtime_ms: number | null;
  byte_size: number | null;
  sha256: string | null;
  content_version: number | null;
  owner_status: ContentOwnerStatus | null;
  evidence_revision: number;
  state: ContentSourceFileState;
  error: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_hashed_at: string | null;
  deleted_at: string | null;
}

export interface UpsertSourceFileResult {
  fileId: number;
  evidenceRevision: number;
  changed: boolean;
  state: ContentSourceFileState;
}

function rowToFileRow(row: unknown): ContentSourceFileRow {
  return row as ContentSourceFileRow;
}

export function getSourceFile(
  db: SqliteDatabase,
  relPath: string,
): ContentSourceFileRow | null {
  const row = db.prepare(`SELECT * FROM content_source_files WHERE path = ?`).get(relPath);
  return row ? rowToFileRow(row) : null;
}

/**
 * Idempotent index upsert. Identical re-observations only refresh
 * last_seen_at; any observable change (digest, size, mtime, manifest binding)
 * bumps the per-file monotonic evidence revision used by scoped watermarks.
 */
export function upsertSourceFile(
  db: SqliteDatabase,
  observation: ContentSourceFileObservation,
  options: { at?: string; hashedAt?: string } = {},
): UpsertSourceFileResult {
  const at = options.at ?? nowIso();
  const prior = getSourceFile(db, observation.path);
  const casefold = caseFoldCollisionKey(observation.path);

  if (!prior) {
    const result = db
      .prepare(
        `INSERT INTO content_source_files (
           path, casefold_key, root_key, entity_kind, entity_key, locale, file_kind,
           owning_manifest_path, observed_mtime_ms, byte_size, sha256, content_version,
           validation_summary_json, owner_status, evidence_revision, state,
           last_hashed_at, last_seen_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'new', ?, ?)`,
      )
      .run(
        observation.path,
        casefold,
        observation.rootKey,
        observation.entityKind,
        observation.entityKey ?? null,
        observation.locale ?? null,
        observation.fileKind,
        observation.owningManifestPath ?? null,
        observation.observedMtimeMs ?? null,
        observation.byteSize ?? null,
        observation.sha256 ?? null,
        observation.contentVersion ?? null,
        stableJson(observation.validationSummary ?? {}),
        observation.ownerStatus ?? null,
        options.hashedAt ?? at,
        at,
      );
    return {
      fileId: Number(result.lastInsertRowid),
      evidenceRevision: 1,
      changed: true,
      state: "new",
    };
  }

  const reappearedAfterDelete = prior.deleted_at !== null;
  const unchanged =
    !reappearedAfterDelete &&
    prior.sha256 === (observation.sha256 ?? null) &&
    prior.byte_size === (observation.byteSize ?? null) &&
    prior.observed_mtime_ms === (observation.observedMtimeMs ?? null) &&
    prior.file_kind === observation.fileKind &&
    prior.entity_kind === observation.entityKind &&
    prior.root_key === observation.rootKey &&
    prior.locale === (observation.locale ?? null) &&
    prior.entity_key === (observation.entityKey ?? null) &&
    prior.owning_manifest_path === (observation.owningManifestPath ?? null) &&
    prior.content_version === (observation.contentVersion ?? null) &&
    prior.owner_status === (observation.ownerStatus ?? null);

  if (unchanged) {
    db.prepare(
      `UPDATE content_source_files SET last_seen_at = ? WHERE id = ?`,
    ).run(at, prior.id);
    return {
      fileId: prior.id,
      evidenceRevision: prior.evidence_revision,
      changed: false,
      state: prior.state,
    };
  }

  let nextState: ContentSourceFileState;
  const digestChanged = prior.sha256 !== (observation.sha256 ?? null);
  const bindingLost =
    (observation.ownerStatus ?? null) !== prior.owner_status &&
    (observation.ownerStatus === "missing_manifest" ||
      observation.ownerStatus === "legacy_missing_manifest");
  if (reappearedAfterDelete) {
    nextState = digestChanged ? "changed" : "clean";
  } else if (bindingLost) {
    nextState = "invalid";
  } else if (digestChanged) {
    nextState = "changed";
  } else {
    nextState = "clean";
  }

  const nextRevision = prior.evidence_revision + 1;
  db.prepare(
    `UPDATE content_source_files SET
       casefold_key = ?, root_key = ?, entity_kind = ?, entity_key = ?, locale = ?,
       file_kind = ?, owning_manifest_path = ?, observed_mtime_ms = ?, byte_size = ?,
       sha256 = ?, content_version = ?, validation_summary_json = ?, owner_status = ?,
       evidence_revision = ?, state = ?, last_hashed_at = COALESCE(?, last_hashed_at),
       last_seen_at = ?, deleted_at = NULL
     WHERE id = ?`,
  ).run(
    casefold,
    observation.rootKey,
    observation.entityKind,
    observation.entityKey ?? null,
    observation.locale ?? null,
    observation.fileKind,
    observation.owningManifestPath ?? null,
    observation.observedMtimeMs ?? null,
    observation.byteSize ?? null,
    observation.sha256 ?? null,
    observation.contentVersion ?? null,
    stableJson(observation.validationSummary ?? {}),
    observation.ownerStatus ?? null,
    nextRevision,
    nextState,
    options.hashedAt ?? null,
    at,
    prior.id,
  );
  return {
    fileId: prior.id,
    evidenceRevision: nextRevision,
    changed: true,
    state: nextState,
  };
}

export function markSourceFileDeleted(
  db: SqliteDatabase,
  relPath: string,
  options: { at?: string; sha256?: string | null } = {},
): UpsertSourceFileResult | null {
  const prior = getSourceFile(db, relPath);
  if (!prior || prior.deleted_at !== null) {
    return null;
  }
  const at = options.at ?? nowIso();
  const nextRevision = prior.evidence_revision + 1;
  db.prepare(
    `UPDATE content_source_files
     SET evidence_revision = ?, state = 'deleted', deleted_at = ?, last_seen_at = ?,
         sha256 = COALESCE(?, sha256)
     WHERE id = ?`,
  ).run(nextRevision, at, at, options.sha256 ?? null, prior.id);
  return {
    fileId: prior.id,
    evidenceRevision: nextRevision,
    changed: true,
    state: "deleted",
  };
}

export function markSourceFileState(
  db: SqliteDatabase,
  relPath: string,
  state: Extract<ContentSourceFileState, "invalid" | "unreadable">,
  error?: string,
  options: { bumpRevision?: boolean; at?: string } = {},
): number | null {
  const prior = getSourceFile(db, relPath);
  if (!prior) {
    return null;
  }
  const nextRevision =
    options.bumpRevision === false
      ? prior.evidence_revision
      : prior.evidence_revision + 1;
  db.prepare(
    `UPDATE content_source_files
     SET state = ?, error = ?, evidence_revision = ?, last_seen_at = ?
     WHERE id = ?`,
  ).run(state, error ?? null, nextRevision, options.at ?? nowIso(), prior.id);
  return nextRevision;
}

export function countSourceFilesByOwnerStatus(
  db: SqliteDatabase,
  ownerStatus: ContentOwnerStatus,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM content_source_files
       WHERE owner_status = ? AND deleted_at IS NULL`,
    )
    .get(ownerStatus) as { count: number };
  return row.count;
}

export function listSourceFilePathsByOwnerStatus(
  db: SqliteDatabase,
  ownerStatus: ContentOwnerStatus,
  limit = 10,
): string[] {
  return (
    db
      .prepare(
        `SELECT path FROM content_source_files
         WHERE owner_status = ? AND deleted_at IS NULL
         ORDER BY path ASC LIMIT ?`,
      )
      .all(ownerStatus, limit) as Array<{ path: string }>
  ).map((row) => row.path);
}

export function findIndexedCaseFoldCollisions(
  db: SqliteDatabase,
): Map<string, string[]> {
  const rows = db
    .prepare(
      `SELECT casefold_key, path FROM content_source_files
       WHERE casefold_key IN (
         SELECT casefold_key FROM content_source_files GROUP BY casefold_key HAVING COUNT(*) > 1
       ) ORDER BY casefold_key, path ASC`,
    )
    .all() as Array<{ casefold_key: string; path: string }>;
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const existing = grouped.get(row.casefold_key);
    if (existing) existing.push(row.path);
    else grouped.set(row.casefold_key, [row.path]);
  }
  return grouped;
}

export interface ContentChangeEventInput {
  eventId?: string;
  path: string;
  rootKey: string;
  entityKind: ContentEntityKind;
  entityKey?: string | null;
  locale?: string | null;
  owningManifestPath?: string | null;
  eventType: ContentEventType;
  oldSha256?: string | null;
  newSha256?: string | null;
  oldByteSize?: number | null;
  newByteSize?: number | null;
  detectorSource: ContentDetectorSource;
  evidenceRevision: number;
  findings?: Record<string, unknown>;
}

export interface RecordChangeEventResult {
  eventId: string;
  coalescedIntoExisting: boolean;
  ignoredAsTerminalDuplicate: boolean;
}

export function computeEventIdempotencyKey(input: {
  path: string;
  eventType: ContentEventType;
  oldSha256?: string | null;
  newSha256?: string | null;
  detectorSource: ContentDetectorSource;
  evidenceRevision: number;
}): string {
  return crypto
    .createHash("sha256")
    .update(
      stableJson([
        input.path,
        input.eventType,
        input.oldSha256 ?? null,
        input.newSha256 ?? null,
        input.detectorSource,
        input.evidenceRevision,
      ]),
    )
    .digest("hex");
}

/**
 * Durable append-oriented journal insert. Redelivery of the same final
 * path/digest/evidence revision coalesces into the live row instead of
 * duplicating it; a redelivery matching a terminal row is a no-op.
 */
export function recordContentChangeEvent(
  db: SqliteDatabase,
  input: ContentChangeEventInput,
  options: { supersedePriorForPath?: boolean; at?: string } = {},
): RecordChangeEventResult {
  const at = options.at ?? nowIso();
  const eventId = input.eventId ?? crypto.randomUUID();
  const idempotencyKey = computeEventIdempotencyKey({
    path: input.path,
    eventType: input.eventType,
    oldSha256: input.oldSha256,
    newSha256: input.newSha256,
    detectorSource: input.detectorSource,
    evidenceRevision: input.evidenceRevision,
  });

  return db.transaction(() => {
    const existing = db
      .prepare(`SELECT id, event_id, review_state FROM content_change_events WHERE idempotency_key = ?`)
      .get(idempotencyKey) as { id: number; event_id: string; review_state: ContentReviewState } | undefined;

    if (existing) {
      if (isTerminalReviewState(existing.review_state)) {
        return {
          eventId: existing.event_id,
          coalescedIntoExisting: false,
          ignoredAsTerminalDuplicate: true,
        };
      }
      db.prepare(
        `UPDATE content_change_events
         SET coalesced_count = coalesced_count + 1, last_detected_at = ?
         WHERE id = ?`,
      ).run(at, existing.id);
      return {
        eventId: existing.event_id,
        coalescedIntoExisting: true,
        ignoredAsTerminalDuplicate: false,
      };
    }

    if (options.supersedePriorForPath) {
      db.prepare(
        `UPDATE content_change_events
         SET review_state = 'superseded', superseded_by_event_id = ?
         WHERE path = ? AND review_state IN ('pending', 'approved')`,
      ).run(eventId, input.path);
    }

    db.prepare(
      `INSERT INTO content_change_events (
         event_id, idempotency_key, root_key, path, owning_manifest_path,
         entity_kind, entity_key, locale, event_type,
         old_sha256, new_sha256, old_byte_size, new_byte_size,
         detector_source, evidence_revision, findings_json, review_state,
         first_detected_at, last_detected_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    ).run(
      eventId,
      idempotencyKey,
      input.rootKey,
      input.path,
      input.owningManifestPath ?? null,
      input.entityKind,
      input.entityKey ?? null,
      input.locale ?? null,
      input.eventType,
      input.oldSha256 ?? null,
      input.newSha256 ?? null,
      input.oldByteSize ?? null,
      input.newByteSize ?? null,
      input.detectorSource,
      input.evidenceRevision,
      stableJson(input.findings ?? {}),
      at,
      at,
    );
    return {
      eventId,
      coalescedIntoExisting: false,
      ignoredAsTerminalDuplicate: false,
    };
  })();
}

export interface ChangeEventRow {
  id: number;
  event_id: string;
  correlation_group_id: string | null;
  path: string;
  owning_manifest_path: string | null;
  root_key: string;
  entity_kind: string;
  entity_key: string | null;
  locale: string | null;
  event_type: ContentEventType;
  old_sha256: string | null;
  new_sha256: string | null;
  detector_source: ContentDetectorSource;
  evidence_revision: number;
  findings_json: string;
  review_state: ContentReviewState;
  reviewer_id: string | null;
  reviewer_role: string | null;
  review_reason: string | null;
  reviewed_at: string | null;
  apply_result_json: string;
  proposal_id: string | null;
  sqlite_revision: string | null;
  outbox_item_id: number | null;
  finding_id: number | null;
  superseded_by_event_id: string | null;
  coalesced_count: number;
  first_detected_at: string;
  last_detected_at: string;
}

export function getChangeEvent(
  db: SqliteDatabase,
  eventId: string,
): ChangeEventRow | null {
  const row = db
    .prepare(`SELECT * FROM content_change_events WHERE event_id = ?`)
    .get(eventId);
  return row ? (row as ChangeEventRow) : null;
}

export function transitionChangeEventReviewState(
  db: SqliteDatabase,
  eventId: string,
  to: ContentReviewState,
  actor: { reviewerId: string; reviewerRole: string; reason: string },
  options: { at?: string; applyResult?: Record<string, unknown>; refs?: { proposalId?: string; sqliteRevision?: string; outboxItemId?: number; findingId?: number } } = {},
): void {
  const row = getChangeEvent(db, eventId);
  if (!row) {
    throw new Error(`CONTENT_CHANGE_EVENT_NOT_FOUND: ${eventId}`);
  }
  assertReviewTransition(row.review_state, to);
  const at = options.at ?? nowIso();
  db.prepare(
    `UPDATE content_change_events SET
       review_state = ?, reviewer_id = ?, reviewer_role = ?, review_reason = ?,
       reviewed_at = ?, apply_result_json = ?,
       proposal_id = COALESCE(?, proposal_id),
       sqlite_revision = COALESCE(?, sqlite_revision),
       outbox_item_id = COALESCE(?, outbox_item_id),
       finding_id = COALESCE(?, finding_id)
     WHERE event_id = ?`,
  ).run(
    to,
    actor.reviewerId,
    actor.reviewerRole,
    actor.reason,
    at,
    stableJson(options.applyResult ?? {}),
    options.refs?.proposalId ?? null,
    options.refs?.sqliteRevision ?? null,
    options.refs?.outboxItemId ?? null,
    options.refs?.findingId ?? null,
    eventId,
  );
}

/** Rename evidence is delete + create; correlate both rows into one group. */
export function correlateRenameEvents(
  db: SqliteDatabase,
  deletedEventId: string,
  createdEventId: string,
  groupId?: string,
): string {
  const group = groupId ?? crypto.randomUUID();
  const update = db.prepare(
    `UPDATE content_change_events
     SET correlation_group_id = ?
     WHERE event_id = ? AND review_state IN ('pending', 'blocked')
       AND event_type IN ('deleted', 'created', 'renamed')`,
  );
  const result = db.transaction(() => {
    const first = update.run(group, deletedEventId);
    const second = update.run(group, createdEventId);
    if (first.changes !== 1 || second.changes !== 1) {
      throw new Error("RENAME_CORRELATION_TARGETS_INVALID");
    }
    return group;
  })();
  return result;
}

export interface ListChangeEventsFilter {
  reviewStates?: readonly ContentReviewState[];
  entityKind?: ContentEntityKind;
  detectorSources?: readonly ContentDetectorSource[];
  limit?: number;
  offset?: number;
}

export interface PaginatedChangeEvents {
  items: ChangeEventRow[];
  total: number;
  limit: number;
  offset: number;
}

export function listChangeEvents(
  db: SqliteDatabase,
  filter: ListChangeEventsFilter = {},
): PaginatedChangeEvents {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.reviewStates?.length) {
    conditions.push(
      `review_state IN (${filter.reviewStates.map(() => "?").join(", ")})`,
    );
    params.push(...filter.reviewStates);
  }
  if (filter.entityKind) {
    conditions.push(`entity_kind = ?`);
    params.push(filter.entityKind);
  }
  if (filter.detectorSources?.length) {
    conditions.push(
      `detector_source IN (${filter.detectorSources.map(() => "?").join(", ")})`,
    );
    params.push(...filter.detectorSources);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.max(1, filter.limit ?? 50);
  const offset = Math.max(0, filter.offset ?? 0);
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS count FROM content_change_events ${where}`)
      .get(...params) as { count: number }
  ).count;
  const items = db
    .prepare(
      `SELECT * FROM content_change_events ${where}
       ORDER BY first_detected_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as ChangeEventRow[];
  return { items, total, limit, offset };
}

export interface CheckpointRow {
  root_key: string;
  shard_key: string;
  checkpoint_kind: ContentCheckpointKind;
  checkpoint_value: string;
  evidence_revision_watermark: number;
  updated_at: string;
}

export function getCheckpoint(
  db: SqliteDatabase,
  rootKey: string,
  shardKey: string,
  kind: ContentCheckpointKind,
): CheckpointRow | null {
  const row = db
    .prepare(
      `SELECT * FROM content_source_checkpoints
       WHERE root_key = ? AND shard_key = ? AND checkpoint_kind = ?`,
    )
    .get(rootKey, shardKey, kind);
  return row ? (row as CheckpointRow) : null;
}

export function setCheckpoint(
  db: SqliteDatabase,
  rootKey: string,
  shardKey: string,
  kind: ContentCheckpointKind,
  value: string,
  evidenceRevisionWatermark: number,
  options: { at?: string } = {},
): void {
  db.prepare(
    `INSERT INTO content_source_checkpoints
       (root_key, shard_key, checkpoint_kind, checkpoint_value, evidence_revision_watermark, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(root_key, shard_key, checkpoint_kind) DO UPDATE SET
       checkpoint_value = excluded.checkpoint_value,
       evidence_revision_watermark = excluded.evidence_revision_watermark,
       updated_at = excluded.updated_at`,
  ).run(rootKey, shardKey, kind, value, evidenceRevisionWatermark, options.at ?? nowIso());
}

export function isBaselineSealed(
  db: SqliteDatabase,
  rootKey: string,
): boolean {
  return (
    db
      .prepare(
        `SELECT 1 FROM content_source_checkpoints
         WHERE checkpoint_kind = 'baseline' AND root_key = ? LIMIT 1`,
      )
      .get(rootKey) !== undefined
  );
}

export interface BaselineFileInput extends ContentSourceFileObservation {
  /** Manifestless Markdown is forced invalid + legacy status; bound files land clean. */
  manifestless?: boolean;
}

/**
 * One-time legacy baseline: persist pre-existing content as individual index
 * rows WITHOUT inbox events and atomically seal the baseline checkpoint.
 * Manifestless Markdown becomes `legacy_missing_manifest`/invalid; manifest-
 * bound files become clean. Any failure rolls back every row and the seal, so
 * a later run cannot half-classify the tree.
 */
export function sealLegacyBaseline(
  db: SqliteDatabase,
  input: { rootKey: string; shardKey?: string; sealedAt?: string; files: BaselineFileInput[] },
): { indexed: number; representativePaths: string[] } {
  const sealedAt = input.sealedAt ?? nowIso();
  return db.transaction(() => {
    let indexed = 0;
    const paths: string[] = [];
    for (const file of input.files) {
      const manifestless = file.manifestless ?? true;
      const result = upsertSourceFile(db, {
        ...file,
        ownerStatus: manifestless ? "legacy_missing_manifest" : file.ownerStatus ?? "manifest_ok",
      }, { at: sealedAt });
      db.prepare(
        `UPDATE content_source_files SET state = ? WHERE id = ?`,
      ).run(manifestless ? "invalid" : "clean", result.fileId);
      indexed += 1;
      if (paths.length < 10) paths.push(file.path);
    }
    setCheckpoint(db, input.rootKey, input.shardKey ?? "", "baseline", sealedAt, 0, { at: sealedAt });
    return { indexed, representativePaths: paths };
  })();
}

export interface QuarantineEntry {
  path: string;
  reason: string;
  error: string | null;
  retry_count: number;
  first_failed_at: string;
  last_failed_at: string;
  next_retry_at: string;
  resolved_at: string | null;
}

export function quarantinePath(
  db: SqliteDatabase,
  path: string,
  reason: string,
  error?: string,
  options: { nextRetryAt?: string; at?: string } = {},
): QuarantineEntry {
  const at = options.at ?? nowIso();
  const nextRetryAt = options.nextRetryAt ?? at;
  db.prepare(
    `INSERT INTO content_source_quarantine
       (path, reason, error, retry_count, first_failed_at, last_failed_at, next_retry_at)
     VALUES (?, ?, ?, 0, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET
       reason = excluded.reason,
       error = excluded.error,
       retry_count = content_source_quarantine.retry_count + 1,
       last_failed_at = excluded.last_failed_at,
       next_retry_at = excluded.next_retry_at,
       resolved_at = NULL`,
  ).run(path, reason, error ?? null, at, at, nextRetryAt);
  return getQuarantineEntry(db, path) as QuarantineEntry;
}

export function getQuarantineEntry(
  db: SqliteDatabase,
  path: string,
): QuarantineEntry | null {
  const row = db.prepare(`SELECT * FROM content_source_quarantine WHERE path = ?`).get(path);
  return row ? (row as QuarantineEntry) : null;
}

export function resolveQuarantine(db: SqliteDatabase, path: string, at?: string): void {
  db.prepare(
    `UPDATE content_source_quarantine SET resolved_at = ? WHERE path = ?`,
  ).run(at ?? nowIso(), path);
}

export function listDueQuarantinePaths(
  db: SqliteDatabase,
  nowIsoValue: string,
  limit = 100,
): QuarantineEntry[] {
  return db
    .prepare(
      `SELECT * FROM content_source_quarantine
       WHERE resolved_at IS NULL AND next_retry_at <= ?
       ORDER BY next_retry_at ASC LIMIT ?`,
    )
    .all(nowIsoValue, limit) as QuarantineEntry[];
}

export interface MonitorLease {
  root_key: string;
  owner_id: string;
  acquired_at: string;
  renewed_at: string;
  expires_at: string;
}

export function getMonitorLease(
  db: SqliteDatabase,
  rootKey: string,
): MonitorLease | null {
  const row = db
    .prepare(`SELECT * FROM content_source_monitor_leases WHERE root_key = ?`)
    .get(rootKey);
  return row ? (row as MonitorLease) : null;
}

export function tryAcquireMonitorLease(
  db: SqliteDatabase,
  rootKey: string,
  ownerId: string,
  ttlMs: number,
  nowMs: number,
): boolean {
  return db.transaction(() => {
    const existing = getMonitorLease(db, rootKey);
    const now = new Date(nowMs).toISOString();
    const expires = new Date(nowMs + ttlMs).toISOString();
    const free = !existing || existing.expires_at <= now || existing.owner_id === ownerId;
    if (!free) {
      return false;
    }
    db.prepare(
      `INSERT INTO content_source_monitor_leases
         (root_key, owner_id, acquired_at, renewed_at, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(root_key) DO UPDATE SET
         owner_id = excluded.owner_id,
         acquired_at = CASE WHEN content_source_monitor_leases.owner_id = excluded.owner_id
           THEN content_source_monitor_leases.acquired_at ELSE excluded.acquired_at END,
         renewed_at = excluded.renewed_at,
         expires_at = excluded.expires_at`,
    ).run(rootKey, ownerId, now, now, expires);
    return true;
  })();
}

export function renewMonitorLease(
  db: SqliteDatabase,
  rootKey: string,
  ownerId: string,
  ttlMs: number,
  nowMs: number,
): boolean {
  return db.transaction(() => {
    const existing = getMonitorLease(db, rootKey);
    const now = new Date(nowMs).toISOString();
    if (!existing || existing.owner_id !== ownerId || existing.expires_at <= now) {
      return false;
    }
    db.prepare(
      `UPDATE content_source_monitor_leases
       SET renewed_at = ?, expires_at = ? WHERE root_key = ?`,
    ).run(now, new Date(nowMs + ttlMs).toISOString(), rootKey);
    return true;
  })();
}

export function releaseMonitorLease(
  db: SqliteDatabase,
  rootKey: string,
  ownerId: string,
): boolean {
  const result = db
    .prepare(
      `DELETE FROM content_source_monitor_leases WHERE root_key = ? AND owner_id = ?`,
    )
    .run(rootKey, ownerId);
  return result.changes > 0;
}

export interface ReviewProposalInput {
  proposalId: string;
  scopeDefinition: Record<string, unknown>;
  scopeCardinality: number;
  scopePaths: readonly string[];
  scopeMaxEvidenceRevision: number;
  scopeDigests: Readonly<Record<string, string>>;
  createdBy?: string;
}

export interface ReviewProposalRow {
  proposal_id: string;
  status: string;
  scope_fingerprint: string;
  scope_definition_json: string;
  scope_cardinality: number;
  scope_paths_json: string;
  scope_max_evidence_revision: number;
  scope_digests_json: string;
  stale_reason: string | null;
  created_by: string | null;
}

export function computeScopeFingerprint(input: {
  scopePaths: readonly string[];
  scopeCardinality: number;
  scopeMaxEvidenceRevision: number;
  scopeDigests: Readonly<Record<string, string>>;
}): string {
  return crypto
    .createHash("sha256")
    .update(
      stableJson({
        cardinality: input.scopeCardinality,
        maxEvidenceRevision: input.scopeMaxEvidenceRevision,
        paths: [...input.scopePaths].sort(),
        digests: Object.entries(input.scopeDigests).sort(([a], [b]) => (a < b ? -1 : 1)),
      }),
    )
    .digest("hex");
}

export function createReviewProposal(
  db: SqliteDatabase,
  input: ReviewProposalInput,
): ReviewProposalRow {
  const fingerprint = computeScopeFingerprint(input);
  db.prepare(
    `INSERT INTO content_review_proposals (
       proposal_id, status, scope_fingerprint, scope_definition_json, scope_cardinality,
       scope_paths_json, scope_max_evidence_revision, scope_digests_json, created_by
     ) VALUES (?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.proposalId,
    fingerprint,
    stableJson(input.scopeDefinition),
    input.scopeCardinality,
    stableJson([...input.scopePaths].sort()),
    input.scopeMaxEvidenceRevision,
    stableJson(input.scopeDigests),
    input.createdBy ?? null,
  );
  return getReviewProposal(db, input.proposalId) as ReviewProposalRow;
}

export function getReviewProposal(
  db: SqliteDatabase,
  proposalId: string,
): ReviewProposalRow | null {
  const row = db
    .prepare(`SELECT * FROM content_review_proposals WHERE proposal_id = ?`)
    .get(proposalId);
  return row ? (row as ReviewProposalRow) : null;
}

const PROPOSAL_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["ready", "rejected", "dismissed"],
  ready: ["approved", "applied", "stale", "rejected", "dismissed"],
  approved: ["applied", "stale"],
  applied: [],
  stale: ["ready"],
  rejected: [],
  dismissed: [],
};

export function transitionReviewProposalStatus(
  db: SqliteDatabase,
  proposalId: string,
  to: "draft" | "ready" | "approved" | "applied" | "stale" | "rejected" | "dismissed",
  options: { reason?: string; approvedBy?: string; at?: string } = {},
): void {
  const current = getReviewProposal(db, proposalId);
  if (!current) {
    throw new Error(`CONTENT_REVIEW_PROPOSAL_NOT_FOUND: ${proposalId}`);
  }
  if (!PROPOSAL_TRANSITIONS[current.status]?.includes(to)) {
    throw new Error(
      `REVIEW_PROPOSAL_TRANSITION_INVALID: ${current.status} -> ${to}`,
    );
  }
  const at = options.at ?? nowIso();
  db.prepare(
    `UPDATE content_review_proposals SET
       status = ?, stale_reason = CASE WHEN ? <> '' THEN ? ELSE stale_reason END,
       approved_by = COALESCE(?, approved_by),
       approved_at = CASE WHEN ? = 'approved' THEN ? ELSE approved_at END,
       applied_at = CASE WHEN ? = 'applied' THEN ? ELSE applied_at END
     WHERE proposal_id = ?`,
  ).run(
    to,
    options.reason ?? "",
    options.reason ?? "",
    options.approvedBy ?? null,
    to,
    at,
    to,
    at,
    proposalId,
  );
}

/**
 * Scoped stale gate: recompute the fingerprint over the exact persisted path
 * set using CURRENT index evidence. Unrelated paths outside the scope cannot
 * influence the outcome; any digest/evidence change inside the scope stales
 * the proposal.
 */
export function verifyProposalScopeEvidence(
  db: SqliteDatabase,
  proposalId: string,
): { ok: true; fingerprint: string } | { ok: false; reason: string } {
  const proposal = getReviewProposal(db, proposalId);
  if (!proposal) {
    return { ok: false, reason: "CONTENT_REVIEW_PROPOSAL_NOT_FOUND" };
  }
  const storedPaths = JSON.parse(proposal.scope_paths_json) as string[];
  if (storedPaths.length !== proposal.scope_cardinality) {
    return { ok: false, reason: "SCOPE_CARDINALITY_MISMATCH" };
  }
  const storedDigests = JSON.parse(proposal.scope_digests_json) as Record<string, string>;
  const currentDigests: Record<string, string> = {};
  let maxRevision = 0;
  const select = db.prepare(
    `SELECT path, sha256, evidence_revision FROM content_source_files WHERE path = ?`,
  );
  for (const relPath of storedPaths) {
    const row = select.get(relPath) as
      | { path: string; sha256: string | null; evidence_revision: number }
      | undefined;
    if (!row || row.sha256 === null) {
      return { ok: false, reason: `SCOPE_PATH_MISSING_EVIDENCE: ${relPath}` };
    }
    currentDigests[relPath] = row.sha256;
    maxRevision = Math.max(maxRevision, row.evidence_revision);
  }
  const recomputed = computeScopeFingerprint({
    scopePaths: storedPaths,
    scopeCardinality: storedPaths.length,
    scopeMaxEvidenceRevision: maxRevision,
    scopeDigests: currentDigests,
  });
  const expected = computeScopeFingerprint({
    scopePaths: storedPaths,
    scopeCardinality: proposal.scope_cardinality,
    scopeMaxEvidenceRevision: proposal.scope_max_evidence_revision,
    scopeDigests: storedDigests,
  });
  if (recomputed !== expected || recomputed !== proposal.scope_fingerprint) {
    return { ok: false, reason: "SCOPE_FINGERPRINT_MISMATCH" };
  }
  return { ok: true, fingerprint: recomputed };
}

export interface MonitorRunStartInput {
  runId: string;
  detectorMode: ContentRunMode;
  sourceRevisionBefore?: number | null;
  repositoryCheckpoint?: string | null;
}

export function startMonitorRun(db: SqliteDatabase, input: MonitorRunStartInput): void {
  db.prepare(
    `INSERT INTO content_source_monitor_runs
       (run_id, detector_mode, status, repository_checkpoint, last_heartbeat_at, source_revision_before)
     VALUES (?, ?, 'running', ?, ?, ?)`,
  ).run(
    input.runId,
    input.detectorMode,
    input.repositoryCheckpoint ?? null,
    nowIso(),
    input.sourceRevisionBefore ?? null,
  );
}

export function heartbeatMonitorRun(db: SqliteDatabase, runId: string): void {
  db.prepare(
    `UPDATE content_source_monitor_runs SET last_heartbeat_at = ? WHERE run_id = ? AND status = 'running'`,
  ).run(nowIso(), runId);
}

export interface MonitorRunFinishInput {
  status: ContentRunStatus;
  complete: boolean;
  error?: string | null;
  pathsInspected?: number;
  metadataComparisons?: number;
  filesHashed?: number;
  eventsProduced?: number;
  sourceRevisionAfter?: number | null;
}

export function finishMonitorRun(
  db: SqliteDatabase,
  runId: string,
  input: MonitorRunFinishInput,
): void {
  db.prepare(
    `UPDATE content_source_monitor_runs SET
       status = ?, complete = ?, error = ?, finished_at = ?,
       paths_inspected = ?, metadata_comparisons = ?, files_hashed = ?,
       events_produced = ?, source_revision_after = ?
     WHERE run_id = ?`,
  ).run(
    input.status,
    input.complete ? 1 : 0,
    input.error ?? null,
    nowIso(),
    input.pathsInspected ?? 0,
    input.metadataComparisons ?? 0,
    input.filesHashed ?? 0,
    input.eventsProduced ?? 0,
    input.sourceRevisionAfter ?? null,
    runId,
  );
}

export function getMonitorRun(
  db: SqliteDatabase,
  runId: string,
): Record<string, unknown> | null {
  const row = db
    .prepare(`SELECT * FROM content_source_monitor_runs WHERE run_id = ?`)
    .get(runId);
  return row ? (row as Record<string, unknown>) : null;
}

export function getContentSourceRevision(db: SqliteDatabase): number {
  const row = db
    .prepare(`SELECT revision FROM content_source_revision WHERE id = 1`)
    .get() as { revision?: number } | undefined;
  return Number.isSafeInteger(row?.revision) ? Number(row!.revision) : 0;
}

export function bumpContentSourceRevision(db: SqliteDatabase): number {
  db.prepare(
    `UPDATE content_source_revision SET revision = revision + 1, updated_at = datetime('now') WHERE id = 1`,
  ).run();
  return getContentSourceRevision(db);
}

export const WATCHED_ROOT_KEYS: readonly string[] = CONTENT_SOURCE_ROOTS.map(
  (root) => root.rootKey,
);
