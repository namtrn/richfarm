import crypto from "node:crypto";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { requireRole } from "./auth";
import {
  auditCanonicalIdentity,
  type CanonicalAuditFinding,
  type CanonicalConvexSnapshot,
  type CanonicalIdentityAuditReport,
} from "./canonical-identity-audit";
import { getSyncCatalogRevision, type SqliteDatabase } from "./db";
import type { ConvexSyncService } from "./convex-sync";
import {
  overrideBlockedSyncOutbox,
  requeueResolvedSyncOutbox,
} from "./sync-outbox";
import { readSyncReconciliationState } from "./sync-reconciliation-state";

/** A single bounded page returned by the Convex admin snapshot projection. */
export interface ConvexSnapshotPage {
  rows: readonly unknown[];
  nextCursor: string | null;
  snapshotRevision: string | null;
  expectedCount: number | null;
  sourceDataChanged: boolean;
}

export interface ConvexCatalogMetadata {
  snapshotRevision: string | null;
  expectedCount: number | null;
  /** Missing/false is intentionally treated as an uninitialized catalog. */
  initialized?: boolean | null;
}

export interface ConvexSnapshotAdapter {
  readPage(args: {
    locale: string;
    cursor: string | null;
    limit: number;
  }): Promise<ConvexSnapshotPage>;
  /** Re-read the source metadata after the terminal page. */
  readMetadata?(args: { locale: string }): Promise<ConvexCatalogMetadata>;
}

export interface CompleteConvexSnapshot {
  snapshot: CanonicalConvexSnapshot;
  complete: boolean;
  reason: string | null;
  expectedCount: number | null;
  receivedCount: number;
  pageCount: number;
  terminalCursor: string | null;
}

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 1000;
const DEFAULT_MAX_ROWS = 500_000;

function validCount(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Read every Convex page with fail-closed cursor/count/revision checks.  A
 * partial result is returned as incomplete evidence; callers must not treat
 * it as an authoritative snapshot or use it to approve/apply repairs.
 */
export async function readCompleteConvexSnapshot(
  adapter: ConvexSnapshotAdapter,
  options: {
    locale?: string;
    pageSize?: number;
    maxPages?: number;
    maxRows?: number;
  } = {},
): Promise<CompleteConvexSnapshot> {
  const locale = options.locale?.trim() || "vi";
  const pageSize = Math.max(1, Math.min(5000, options.pageSize ?? DEFAULT_PAGE_SIZE));
  const maxPages = Math.max(1, Math.min(DEFAULT_MAX_PAGES, options.maxPages ?? DEFAULT_MAX_PAGES));
  const maxRows = Math.max(pageSize, Math.min(DEFAULT_MAX_ROWS, options.maxRows ?? DEFAULT_MAX_ROWS));
  const rows: unknown[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let expectedCount: number | null = null;
  let snapshotRevision: string | null = null;
  let sourceDataChanged = false;
  let pageCount = 0;
  let terminalCursor: string | null = null;
  let terminalPageReached = false;
  let reason: string | null = null;

  while (reason === null && pageCount < maxPages) {
    const cursorKey = cursor === null ? "<initial>" : cursor;
    if (seenCursors.has(cursorKey)) {
      reason = "repeated_cursor";
      break;
    }
    seenCursors.add(cursorKey);

    let page: ConvexSnapshotPage;
    try {
      page = await adapter.readPage({ locale, cursor, limit: pageSize });
    } catch (error) {
      reason = `adapter_error:${error instanceof Error ? error.message : String(error)}`;
      break;
    }
    pageCount++;

    if (!page || !Array.isArray(page.rows)) {
      reason = "invalid_page_rows";
      break;
    }
    if (typeof page.snapshotRevision !== "string" || page.snapshotRevision.trim() === "") {
      reason = "missing_snapshot_revision";
      break;
    }
    if (!validCount(page.expectedCount)) {
      reason = "missing_expected_count";
      break;
    }
    if (snapshotRevision === null) {
      snapshotRevision = page.snapshotRevision;
      expectedCount = page.expectedCount;
    } else if (page.snapshotRevision !== snapshotRevision) {
      reason = "snapshot_revision_changed";
      break;
    } else if (page.expectedCount !== expectedCount) {
      reason = "expected_count_changed";
      break;
    }

    sourceDataChanged ||= page.sourceDataChanged === true;
    rows.push(...page.rows);
    if (rows.length > maxRows) {
      reason = "row_limit_exceeded";
      break;
    }
    if (expectedCount !== null && rows.length > expectedCount) {
      reason = "received_count_exceeded";
      break;
    }

    const nextCursor = page.nextCursor === null || page.nextCursor === undefined
      ? null
      : String(page.nextCursor).trim();
    if (nextCursor === "") {
      reason = "empty_nonterminal_cursor";
      break;
    }
    if (nextCursor === cursor && nextCursor !== null) {
      reason = "repeated_cursor";
      break;
    }
    if (nextCursor === null) {
      terminalCursor = null;
      terminalPageReached = true;
      break;
    }
    cursor = nextCursor;
  }

  if (reason === null && !terminalPageReached && pageCount >= maxPages) {
    reason = "page_limit_exceeded";
  }
  if (reason === null && expectedCount === null) {
    reason = "missing_expected_count";
  }
  if (reason === null && expectedCount !== rows.length) {
    reason = "received_count_mismatch";
  }
  if (reason === null && adapter.readMetadata) {
    try {
      const endMetadata = await adapter.readMetadata({ locale });
      if (typeof endMetadata.snapshotRevision !== "string" || endMetadata.snapshotRevision.trim() === "") {
        reason = "missing_end_snapshot_revision";
      } else if (!validCount(endMetadata.expectedCount)) {
        reason = "missing_end_expected_count";
      } else if (endMetadata.snapshotRevision !== snapshotRevision) {
        reason = "snapshot_revision_changed_at_end";
      } else if (endMetadata.expectedCount !== expectedCount) {
        reason = "expected_count_changed_at_end";
      }
    } catch (error) {
      reason = `end_metadata_error:${error instanceof Error ? error.message : String(error)}`;
    }
  }
  if (reason === null && sourceDataChanged) {
    reason = "source_changed_during_read";
  }

  const complete = reason === null;
  return {
    snapshot: {
      rows,
      revision: snapshotRevision,
      expectedCount,
      pageCount,
      terminalCursor,
      complete,
      sourceDataChanged,
    },
    complete,
    reason,
    expectedCount,
    receivedCount: rows.length,
    pageCount,
    terminalCursor,
  };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function fingerprintFinding(finding: CanonicalAuditFinding): string {
  return crypto.createHash("sha256").update(stableJson({
    id: finding.id,
    severity: finding.severity,
    code: finding.code,
    canonicalKey: finding.canonicalKey,
    sqliteIdentities: finding.sqliteIdentities,
    convexIdentities: finding.convexIdentities,
  })).digest("hex");
}

export interface ReconciliationAuditRecord {
  runId: string;
  runRowId: number;
  findingCount: number;
}

function runStatus(report: CanonicalIdentityAuditReport): string {
  switch (report.status) {
    case "incomplete": return "incomplete";
    case "blocked": return "blocked";
    default: return "completed";
  }
}

/** Persist one read-only audit's evidence without changing plant/outbox data. */
export function persistReconciliationAudit(
  db: SqliteDatabase,
  report: CanonicalIdentityAuditReport,
  options: {
    runId?: string;
    source?: string;
    operatorId?: string;
    mode?: "audit" | "dry_run";
  } = {},
): ReconciliationAuditRecord {
  const runId = options.runId?.trim() || `cid7-${report.auditId}-${crypto.randomUUID()}`;
  const boundary = report.freshnessBoundary;
  let runRowId = 0;
  db.transaction(() => {
    const started = db.prepare(`
      INSERT INTO sync_reconciliation_runs (
        source, started_at, finished_at, remote_count, local_count,
        drift_before, drift_after, status, run_id, mode,
        sqlite_data_revision, sqlite_catalog_revision, sqlite_outbox_watermark,
        convex_snapshot_revision, expected_count, received_count, page_count,
        terminal_cursor, source_data_changed, snapshot_complete, finding_count,
        operator_id
      ) VALUES (?, datetime('now'), datetime('now'), ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      options.source ?? "convex",
      report.summary.convexRows ?? 0,
      report.summary.sqliteRows,
      runStatus(report),
      runId,
      options.mode ?? "audit",
      boundary.sqliteDataRevision,
      boundary.sqliteCatalogRevision,
      boundary.sqliteOutboxWatermark,
      boundary.convexSnapshotRevision,
      boundary.convexExpectedCount,
      boundary.convexReceivedCount,
      boundary.convexPageCount,
      boundary.convexTerminalCursor,
      boundary.sourceDataChangedDuringRead ? 1 : 0,
      boundary.snapshotComplete ? 1 : 0,
      report.findings.length,
      options.operatorId ?? null,
    );
    runRowId = Number(started.lastInsertRowid);

    const insert = db.prepare(`
      INSERT INTO sync_findings (
        fingerprint, run_id, severity, code, category, canonical_key,
        sqlite_identity_json, convex_identity_json, evidence_json,
        resolution_status, sqlite_catalog_revision, sqlite_data_revision,
        outbox_watermark, convex_snapshot_revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
      ON CONFLICT(fingerprint) DO UPDATE SET
        run_id = excluded.run_id,
        severity = excluded.severity,
        code = excluded.code,
        category = excluded.category,
        canonical_key = excluded.canonical_key,
        sqlite_identity_json = excluded.sqlite_identity_json,
        convex_identity_json = excluded.convex_identity_json,
        evidence_json = excluded.evidence_json,
        resolution_status = 'open',
        resolved_at = NULL,
        resolved_by = NULL,
        resolution_reason = NULL,
        sqlite_catalog_revision = excluded.sqlite_catalog_revision,
        sqlite_data_revision = excluded.sqlite_data_revision,
        outbox_watermark = excluded.outbox_watermark,
        convex_snapshot_revision = excluded.convex_snapshot_revision,
        occurrence_count = sync_findings.occurrence_count + 1,
        last_seen_at = datetime('now'),
        updated_at = datetime('now')
    `);
    for (const finding of report.findings) {
      insert.run(
        fingerprintFinding(finding),
        runId,
        finding.severity,
        finding.code,
        finding.category,
        finding.canonicalKey,
        JSON.stringify(finding.sqliteIdentities),
        JSON.stringify(finding.convexIdentities),
        JSON.stringify(finding.evidence),
        boundary.sqliteCatalogRevision,
        boundary.sqliteDataRevision,
        boundary.sqliteOutboxWatermark,
        boundary.convexSnapshotRevision,
      );
    }
  })();
  return { runId, runRowId, findingCount: report.findings.length };
}

export function resolveSyncFinding(
  db: SqliteDatabase,
  findingId: number,
  operatorId: string,
  reason: string,
): void {
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("Finding resolution reason is required");
  const result = db.prepare(`
    UPDATE sync_findings
    SET resolution_status = 'resolved', resolved_at = datetime('now'),
        resolved_by = ?, resolution_reason = ?, updated_at = datetime('now')
    WHERE id = ? AND resolution_status = 'open'
  `).run(operatorId.trim(), trimmedReason, findingId);
  if (result.changes === 0) throw new Error("Finding is missing or already resolved");
}

/** Dismiss a finding without deleting its evidence or its operator audit. */
export function dismissSyncFinding(
  db: SqliteDatabase,
  findingId: number,
  operatorId: string,
  reason: string,
): void {
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("Finding dismissal reason is required");
  const result = db.prepare(`
    UPDATE sync_findings
    SET resolution_status = 'dismissed', resolved_at = datetime('now'),
        resolved_by = ?, resolution_reason = ?, updated_at = datetime('now')
    WHERE id = ? AND resolution_status = 'open'
  `).run(operatorId.trim(), trimmedReason, findingId);
  if (result.changes === 0) throw new Error("Finding is missing or already resolved");
}

export function cleanupResolvedFindingEvidence(
  db: SqliteDatabase,
  options: { retentionDays?: number; limit?: number } = {},
): number {
  const retentionDays = Math.max(1, Math.min(3650, options.retentionDays ?? 180));
  const limit = Math.max(1, Math.min(10_000, options.limit ?? 500));
  const ids = db.prepare(`
    SELECT id FROM sync_findings
    WHERE resolution_status IN ('resolved', 'dismissed')
      AND last_seen_at < datetime('now', ?)
      AND (evidence_json <> '{}' OR sqlite_identity_json <> '[]' OR convex_identity_json <> '[]')
    ORDER BY id ASC LIMIT ?
  `).all(`-${retentionDays} days`, limit) as Array<{ id: number }>;
  if (ids.length === 0) return 0;
  const update = db.prepare(`
    UPDATE sync_findings
    SET evidence_json = '{}', sqlite_identity_json = '[]', convex_identity_json = '[]',
        updated_at = datetime('now')
    WHERE id = ? AND resolution_status IN ('resolved', 'dismissed')
  `);
  const run = db.transaction(() => ids.reduce((count, row) => count + update.run(row.id).changes, 0));
  return run();
}

const proposalActionSchema = z.enum(["merge", "link", "republish", "quarantine", "archive"]);

class SyncReconciliationActionError extends Error {
  constructor(
    readonly code:
      | "PROPOSAL_NOT_FOUND"
      | "PROPOSAL_NOT_PROPOSED"
      | "PROPOSAL_INCOMPLETE"
      | "PROPOSAL_STALE"
      | "PROPOSAL_CONFLICT"
      | "PROPOSAL_REMOTE_UNAVAILABLE"
      | "PROPOSAL_REMOTE_INCOMPLETE"
      | "PROPOSAL_REMOTE_STALE",
    message: string,
  ) {
    super(message);
    this.name = "SyncReconciliationActionError";
  }
}

interface ProposalFreshnessBoundary {
  sqliteCatalogRevision: string;
  sqliteDataRevision: string;
  outboxWatermark: number;
  convexSnapshotRevision: string | null;
  convexExpectedCount: number | null;
  convexReceivedCount: number | null;
  convexPageCount: number;
  convexTerminalCursor: string | null;
  sourceDataChanged: boolean;
  snapshotComplete: boolean;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function nullableSafeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) ? Number(value) : null;
}

function readLocalProposalBoundary(db: SqliteDatabase): Pick<ProposalFreshnessBoundary, "sqliteCatalogRevision" | "sqliteDataRevision" | "outboxWatermark"> {
  const report = auditCanonicalIdentity(db);
  return {
    sqliteCatalogRevision: String(report.freshnessBoundary.sqliteCatalogRevision ?? ""),
    sqliteDataRevision: report.freshnessBoundary.sqliteDataRevision,
    outboxWatermark: report.freshnessBoundary.sqliteOutboxWatermark,
  };
}

function sameProposalBoundary(
  left: ProposalFreshnessBoundary,
  right: ProposalFreshnessBoundary,
): boolean {
  return left.sqliteCatalogRevision === right.sqliteCatalogRevision
    && left.sqliteDataRevision === right.sqliteDataRevision
    && left.outboxWatermark === right.outboxWatermark
    && left.convexSnapshotRevision === right.convexSnapshotRevision
    && left.convexExpectedCount === right.convexExpectedCount
    && left.convexReceivedCount === right.convexReceivedCount
    && left.convexPageCount === right.convexPageCount
    && left.convexTerminalCursor === right.convexTerminalCursor
    && left.sourceDataChanged === right.sourceDataChanged
    && left.snapshotComplete === right.snapshotComplete;
}

function sameLocalBoundary(
  left: Pick<ProposalFreshnessBoundary, "sqliteCatalogRevision" | "sqliteDataRevision" | "outboxWatermark">,
  right: Pick<ProposalFreshnessBoundary, "sqliteCatalogRevision" | "sqliteDataRevision" | "outboxWatermark">,
): boolean {
  return left.sqliteCatalogRevision === right.sqliteCatalogRevision
    && left.sqliteDataRevision === right.sqliteDataRevision
    && left.outboxWatermark === right.outboxWatermark;
}

async function requireLiveConvexCatalogMetadata(
  adapter: ConvexSnapshotAdapter | undefined,
  boundary: Pick<ProposalFreshnessBoundary, "convexSnapshotRevision" | "convexExpectedCount" | "snapshotComplete">,
  locale = "vi",
): Promise<ConvexCatalogMetadata> {
  if (!adapter?.readMetadata) {
    throw new SyncReconciliationActionError(
      "PROPOSAL_REMOTE_UNAVAILABLE",
      "Live Convex catalog metadata is unavailable",
    );
  }
  let metadata: ConvexCatalogMetadata;
  try {
    metadata = await adapter.readMetadata({ locale });
  } catch (error) {
    throw new SyncReconciliationActionError(
      "PROPOSAL_REMOTE_UNAVAILABLE",
      `Live Convex catalog metadata is unavailable${error instanceof Error && error.message ? `: ${error.message}` : ""}`,
    );
  }
  if (
    !metadata
    || metadata.initialized !== true
    || typeof metadata.snapshotRevision !== "string"
    || metadata.snapshotRevision.trim() === ""
    || !validCount(metadata.expectedCount)
    || boundary.snapshotComplete !== true
    || boundary.convexSnapshotRevision === null
    || boundary.convexExpectedCount === null
  ) {
    throw new SyncReconciliationActionError(
      "PROPOSAL_REMOTE_INCOMPLETE",
      "Live Convex catalog metadata is missing or uninitialized",
    );
  }
  if (
    metadata.snapshotRevision !== boundary.convexSnapshotRevision
    || metadata.expectedCount !== boundary.convexExpectedCount
  ) {
    throw new SyncReconciliationActionError(
      "PROPOSAL_REMOTE_STALE",
      "Live Convex catalog metadata drifted from the stored audit boundary",
    );
  }
  return metadata;
}

export interface SyncRepairProposal {
  proposalId: string;
  runId: string;
  action: z.infer<typeof proposalActionSchema>;
  payload: Record<string, unknown>;
  evidence: Record<string, unknown>;
  createdBy: string;
}

export function createSyncRepairProposal(
  db: SqliteDatabase,
  proposal: SyncRepairProposal,
): string {
  const run = db.prepare(`
    SELECT run_id, status, snapshot_complete, sqlite_catalog_revision,
      sqlite_data_revision, sqlite_outbox_watermark, convex_snapshot_revision,
      expected_count, received_count, page_count, terminal_cursor,
      source_data_changed
    FROM sync_reconciliation_runs WHERE run_id = ?
  `).get(proposal.runId) as {
    run_id: string;
    status: string;
    snapshot_complete: number;
    sqlite_catalog_revision: string | null;
    sqlite_data_revision: string | null;
    sqlite_outbox_watermark: number | null;
    convex_snapshot_revision: string | null;
    expected_count: number | null;
    received_count: number | null;
    page_count: number | null;
    terminal_cursor: string | null;
    source_data_changed: number;
  } | undefined;
  if (!run || run.snapshot_complete !== 1 || run.status === "incomplete") {
    throw new Error("Cannot propose a repair from incomplete reconciliation evidence");
  }
  const action = proposalActionSchema.parse(proposal.action);
  const proposalId = proposal.proposalId.trim() || `proposal-${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO sync_repair_proposals (
      proposal_id, run_id, action, payload_json, evidence_json,
      sqlite_catalog_revision, sqlite_data_revision, outbox_watermark,
      convex_snapshot_revision, convex_expected_count, convex_received_count,
      convex_page_count, convex_terminal_cursor, source_data_changed,
      snapshot_complete, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    proposalId,
    run.run_id,
    action,
    JSON.stringify(proposal.payload),
    JSON.stringify(proposal.evidence),
    run.sqlite_catalog_revision ?? "",
    run.sqlite_data_revision ?? "",
    run.sqlite_outbox_watermark ?? 0,
    run.convex_snapshot_revision,
    run.expected_count,
    run.received_count,
    run.page_count ?? 0,
    run.terminal_cursor,
    run.source_data_changed ? 1 : 0,
    run.snapshot_complete ? 1 : 0,
    proposal.createdBy.trim(),
  );
  return proposalId;
}

interface ApprovalCandidate {
  proposalBoundary: ProposalFreshnessBoundary;
  runBoundary: ProposalFreshnessBoundary;
}

function readApprovalCandidate(db: SqliteDatabase, proposalId: string): ApprovalCandidate {
  const proposal = db.prepare(`
    SELECT p.proposal_id, p.status, p.run_id,
      p.sqlite_catalog_revision, p.sqlite_data_revision, p.outbox_watermark,
      p.convex_snapshot_revision, p.convex_expected_count,
      p.convex_received_count, p.convex_page_count,
      p.convex_terminal_cursor, p.source_data_changed,
      p.snapshot_complete,
      r.status AS run_status, r.snapshot_complete AS run_snapshot_complete,
      r.sqlite_catalog_revision AS run_sqlite_catalog_revision,
      r.sqlite_data_revision AS run_sqlite_data_revision,
      r.sqlite_outbox_watermark AS run_outbox_watermark,
      r.convex_snapshot_revision AS run_convex_snapshot_revision,
      r.expected_count AS run_expected_count,
      r.received_count AS run_received_count,
      r.page_count AS run_page_count,
      r.terminal_cursor AS run_terminal_cursor,
      r.source_data_changed AS run_source_data_changed
    FROM sync_repair_proposals p
    LEFT JOIN sync_reconciliation_runs r ON r.run_id = p.run_id
    WHERE p.proposal_id = ?
  `).get(proposalId) as {
    status: string;
    sqlite_catalog_revision: string;
    sqlite_data_revision: string;
    outbox_watermark: number;
    convex_snapshot_revision: string | null;
    convex_expected_count: number | null;
    convex_received_count: number | null;
    convex_page_count: number | null;
    convex_terminal_cursor: string | null;
    source_data_changed: number;
    snapshot_complete: number;
    run_status: string | null;
    run_snapshot_complete: number | null;
    run_sqlite_catalog_revision: string | null;
    run_sqlite_data_revision: string | null;
    run_outbox_watermark: number | null;
    run_convex_snapshot_revision: string | null;
    run_expected_count: number | null;
    run_received_count: number | null;
    run_page_count: number | null;
    run_terminal_cursor: string | null;
    run_source_data_changed: number | null;
  } | undefined;
  if (!proposal) throw new SyncReconciliationActionError("PROPOSAL_NOT_FOUND", "Repair proposal not found");
  if (proposal.status !== "proposed") {
    throw new SyncReconciliationActionError("PROPOSAL_NOT_PROPOSED", `Repair proposal is not proposed (${proposal.status})`);
  }

  const runBoundary: ProposalFreshnessBoundary = {
    sqliteCatalogRevision: proposal.run_sqlite_catalog_revision ?? "",
    sqliteDataRevision: proposal.run_sqlite_data_revision ?? "",
    outboxWatermark: proposal.run_outbox_watermark ?? 0,
    convexSnapshotRevision: nullableString(proposal.run_convex_snapshot_revision),
    convexExpectedCount: nullableSafeInteger(proposal.run_expected_count),
    convexReceivedCount: nullableSafeInteger(proposal.run_received_count),
    convexPageCount: nullableSafeInteger(proposal.run_page_count) ?? 0,
    convexTerminalCursor: nullableString(proposal.run_terminal_cursor),
    sourceDataChanged: proposal.run_source_data_changed === 1,
    snapshotComplete: proposal.run_snapshot_complete === 1,
  };
  if (
    !proposal.run_status
    || proposal.run_snapshot_complete !== 1
    || proposal.run_status === "incomplete"
    || proposal.run_source_data_changed === 1
  ) {
    throw new SyncReconciliationActionError("PROPOSAL_INCOMPLETE", "Repair proposal requires a complete, unchanged reconciliation snapshot");
  }

  const proposalBoundary: ProposalFreshnessBoundary = {
    sqliteCatalogRevision: proposal.sqlite_catalog_revision,
    sqliteDataRevision: proposal.sqlite_data_revision,
    outboxWatermark: proposal.outbox_watermark,
    convexSnapshotRevision: nullableString(proposal.convex_snapshot_revision),
    convexExpectedCount: nullableSafeInteger(proposal.convex_expected_count),
    convexReceivedCount: nullableSafeInteger(proposal.convex_received_count),
    convexPageCount: nullableSafeInteger(proposal.convex_page_count) ?? 0,
    convexTerminalCursor: nullableString(proposal.convex_terminal_cursor),
    sourceDataChanged: proposal.source_data_changed === 1,
    snapshotComplete: proposal.snapshot_complete === 1,
  };
  const currentLocal = readLocalProposalBoundary(db);
  if (
    !sameProposalBoundary(proposalBoundary, runBoundary)
    || !sameLocalBoundary(currentLocal, runBoundary)
    || runBoundary.sourceDataChanged
    || !runBoundary.snapshotComplete
  ) {
    throw new SyncReconciliationActionError("PROPOSAL_STALE", "Repair proposal freshness boundary is stale; rerun reconciliation");
  }
  return { proposalBoundary, runBoundary };
}

/**
 * Approve a proposal only after revalidating the exact run/local boundary and
 * a live Convex catalog metadata token. The adapter is required at the
 * direct helper boundary; an absent adapter is an explicit fail-closed path.
 */
export async function approveSyncRepairProposal(
  db: SqliteDatabase,
  proposalId: string,
  operatorId: string,
  reason: string,
  adapter: ConvexSnapshotAdapter | undefined,
  options: { locale?: string } = {},
): Promise<ProposalFreshnessBoundary> {
  const trimmedProposalId = proposalId.trim();
  const trimmedOperatorId = operatorId.trim();
  const trimmedReason = reason.trim();
  if (!trimmedProposalId) throw new SyncReconciliationActionError("PROPOSAL_NOT_FOUND", "Repair proposal not found");
  if (!trimmedOperatorId) throw new Error("Proposal approver is required");
  if (!trimmedReason) throw new Error("Proposal approval reason is required");

  const candidate = readApprovalCandidate(db, trimmedProposalId);
  await requireLiveConvexCatalogMetadata(adapter, candidate.runBoundary, options.locale);

  return db.transaction(() => {
    let current: ApprovalCandidate;
    try {
      current = readApprovalCandidate(db, trimmedProposalId);
    } catch (error) {
      if (error instanceof SyncReconciliationActionError) {
        throw new SyncReconciliationActionError("PROPOSAL_CONFLICT", "Repair proposal approval conflicted with another update");
      }
      throw error;
    }
    if (
      !sameProposalBoundary(current.proposalBoundary, candidate.proposalBoundary)
      || !sameProposalBoundary(current.runBoundary, candidate.runBoundary)
    ) {
      throw new SyncReconciliationActionError("PROPOSAL_CONFLICT", "Repair proposal approval conflicted with another update");
    }
    const result = db.prepare(`
      UPDATE sync_repair_proposals
      SET status = 'approved', approved_by = ?, approved_at = datetime('now'),
          approval_reason = ?,
          sqlite_catalog_revision = ?, sqlite_data_revision = ?, outbox_watermark = ?,
          convex_snapshot_revision = ?, convex_expected_count = ?, convex_received_count = ?,
          convex_page_count = ?, convex_terminal_cursor = ?, source_data_changed = ?,
          snapshot_complete = ?, updated_at = datetime('now')
      WHERE proposal_id = ? AND status = 'proposed'
        AND sqlite_catalog_revision = ? AND sqlite_data_revision = ? AND outbox_watermark = ?
    `).run(
      trimmedOperatorId,
      trimmedReason,
      current.runBoundary.sqliteCatalogRevision,
      current.runBoundary.sqliteDataRevision,
      current.runBoundary.outboxWatermark,
      current.runBoundary.convexSnapshotRevision,
      current.runBoundary.convexExpectedCount,
      current.runBoundary.convexReceivedCount,
      current.runBoundary.convexPageCount,
      current.runBoundary.convexTerminalCursor,
      current.runBoundary.sourceDataChanged ? 1 : 0,
      current.runBoundary.snapshotComplete ? 1 : 0,
      trimmedProposalId,
      current.proposalBoundary.sqliteCatalogRevision,
      current.proposalBoundary.sqliteDataRevision,
      current.proposalBoundary.outboxWatermark,
    );
    if (result.changes !== 1) {
      throw new SyncReconciliationActionError("PROPOSAL_CONFLICT", "Repair proposal approval conflicted with another update");
    }
    return current.runBoundary;
  })();
}

export async function applySyncRepairProposal(
  db: SqliteDatabase,
  proposalId: string,
  operatorId: string,
  reason: string,
  apply: (proposal: {
    proposalId: string;
    action: string;
    payload: Record<string, unknown>;
  }) => void | Promise<void>,
  adapter: ConvexSnapshotAdapter | undefined,
  options: { locale?: string } = {},
): Promise<void> {
  if (!reason.trim()) throw new Error("Proposal apply reason is required");
  const proposal = db.prepare(`SELECT * FROM sync_repair_proposals WHERE proposal_id = ?`).get(proposalId) as {
    proposal_id: string;
    action: string;
    status: string;
    payload_json: string;
    sqlite_catalog_revision: string;
    sqlite_data_revision: string;
    outbox_watermark: number;
    convex_snapshot_revision: string | null;
    convex_expected_count: number | null;
    convex_received_count: number | null;
    convex_page_count: number | null;
    convex_terminal_cursor: string | null;
    source_data_changed: number;
    snapshot_complete: number;
    approved_by: string | null;
    approved_at: string | null;
  } | undefined;
  if (!proposal) throw new Error("Repair proposal not found");
  if (proposal.status !== "approved") {
    if (proposal.status === "proposed") {
      throw new Error("Repair proposal must be approved by a prior admin (status is proposed)");
    }
    throw new Error(`Repair proposal is not applicable (${proposal.status})`);
  }
  const approver = proposal.approved_by?.trim() ?? "";
  const operator = operatorId.trim();
  if (!operator || !approver || !proposal.approved_at?.trim() || approver === operator) {
    throw new Error("Repair proposal requires prior distinct admin approval");
  }
  const currentRevision = String(getSyncCatalogRevision(db));
  const currentWatermark = (db.prepare(`SELECT COALESCE(MAX(id), 0) AS watermark FROM sync_outbox`).get() as { watermark: number }).watermark;
  const currentDataRevision = auditCanonicalIdentity(db).freshnessBoundary.sqliteDataRevision;
  if (
    currentRevision !== proposal.sqlite_catalog_revision
    || currentDataRevision !== proposal.sqlite_data_revision
    || currentWatermark !== proposal.outbox_watermark
  ) {
    db.prepare(`UPDATE sync_repair_proposals SET status = 'stale', updated_at = datetime('now') WHERE proposal_id = ?`).run(proposalId);
    throw new Error("Repair proposal freshness boundary is stale");
  }
  try {
    await requireLiveConvexCatalogMetadata(adapter, {
      convexSnapshotRevision: nullableString(proposal.convex_snapshot_revision),
      convexExpectedCount: nullableSafeInteger(proposal.convex_expected_count),
      snapshotComplete: proposal.snapshot_complete === 1,
    }, options.locale);
  } catch (error) {
    if (
      error instanceof SyncReconciliationActionError
      && (error.code === "PROPOSAL_REMOTE_STALE" || error.code === "PROPOSAL_REMOTE_INCOMPLETE")
    ) {
      db.prepare(`UPDATE sync_repair_proposals SET status = 'stale', updated_at = datetime('now') WHERE proposal_id = ? AND status = 'approved'`).run(proposalId);
    }
    throw error;
  }
  await apply({
    proposalId: proposal.proposal_id,
    action: proposal.action,
    payload: JSON.parse(proposal.payload_json) as Record<string, unknown>,
  });
  const result = db.prepare(`
    UPDATE sync_repair_proposals
    SET status = 'applied', applied_by = ?, applied_at = datetime('now'),
        updated_at = datetime('now')
    WHERE proposal_id = ? AND status = 'approved'
  `).run(operator, proposalId);
  if (result.changes !== 1) {
    throw new Error("Repair proposal apply conflicted with another update");
  }
}

function serviceSnapshotAdapter(syncService?: ConvexSyncService): ConvexSnapshotAdapter | undefined {
  const reader = (syncService as unknown as {
    fetchAdminMasterPlantsPage?: (locale: string, cursor: string | null, limit: number) => Promise<ConvexSnapshotPage>;
  } | undefined)?.fetchAdminMasterPlantsPage;
  if (typeof reader !== "function") return undefined;
  return {
    readPage: ({ locale, cursor, limit }) => reader.call(syncService, locale, cursor, limit),
    readMetadata: () => {
      const metadataReader = (syncService as unknown as {
        fetchAdminMasterPlantsMetadata?: () => Promise<{
          snapshotRevision: string | null;
          expectedCount: number | null;
          initialized: boolean;
        }>;
      }).fetchAdminMasterPlantsMetadata;
      return typeof metadataReader === "function"
        ? metadataReader.call(syncService)
        : Promise.resolve({ snapshotRevision: null, expectedCount: null, initialized: false });
    },
  };
}

const auditQuerySchema = z.object({
  locale: z.string().trim().min(2).max(12).default("vi"),
  page_size: z.coerce.number().int().min(1).max(5000).default(DEFAULT_PAGE_SIZE),
});

const stateQuerySchema = z.object({
  finding_severity: z.enum(["all", "info", "warning", "blocked"]).default("all"),
  finding_status: z.enum(["all", "open", "resolved", "dismissed"]).default("all"),
  finding_category: z.string().trim().max(120).default(""),
  finding_search: z.string().trim().max(200).default(""),
  finding_limit: z.coerce.number().int().min(1).max(500).default(200),
  outbox_status: z.enum(["all", "pending", "processing", "applied", "failed", "blocked", "superseded"]).default("all"),
  outbox_limit: z.coerce.number().int().min(1).max(500).default(200),
  proposal_status: z.enum(["all", "proposed", "approved", "applied", "rejected", "stale"]).default("all"),
  proposal_limit: z.coerce.number().int().min(1).max(500).default(100),
});

const proposalSchema = z.object({
  proposal_id: z.string().trim().max(160).default(""),
  run_id: z.string().trim().min(1).max(200),
  action: proposalActionSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  evidence: z.record(z.string(), z.unknown()).default({}),
});

/** Read-only audit surface and a separate, admin-only proposal boundary. */
export function createSyncReconciliationRouter(
  db: SqliteDatabase,
  syncService?: ConvexSyncService,
  options: { adapter?: ConvexSnapshotAdapter; serviceAuditToken?: string } = {},
): Router {
  const router = Router();
  const adapter = options.adapter ?? serviceSnapshotAdapter(syncService);

  // The app normally supplies JWT auth before this router. Keeping this
  // boundary local makes direct embedding/tests fail closed as well, while a
  // narrowly scoped service token can read/persist audits but never mutate.
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (req.authUser) {
      next();
      return;
    }
    const serviceToken = req.headers["x-sync-service-token"];
    if (options.serviceAuditToken && serviceToken === options.serviceAuditToken) {
      next();
      return;
    }
    res.status(401).json({ error: "Unauthorized" });
  });

  const readState = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const query = stateQuerySchema.parse(req.query);
      res.json({
        ok: true,
        state: readSyncReconciliationState(db, {
          findingSeverity: query.finding_severity,
          findingStatus: query.finding_status,
          findingCategory: query.finding_category,
          findingSearch: query.finding_search,
          findingLimit: query.finding_limit,
          outboxStatus: query.outbox_status,
          outboxLimit: query.outbox_limit,
          proposalStatus: query.proposal_status,
          proposalLimit: query.proposal_limit,
          role: req.authUser?.role,
        }),
      });
    } catch (error) {
      next(error);
    }
  };

  // Dashboard reads persisted evidence only. Unlike /audit this route never
  // calls Convex or creates a reconciliation run.
  router.get("/status", readState);
  router.get("/overview", readState);

  router.get("/audit", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!adapter) {
        res.status(503).json({ error: "Convex paginated snapshot adapter is not configured", code: "SNAPSHOT_ADAPTER_UNAVAILABLE" });
        return;
      }
      const query = auditQuerySchema.parse(req.query);
      const snapshot = await readCompleteConvexSnapshot(adapter, {
        locale: query.locale,
        pageSize: query.page_size,
      });
      const report = auditCanonicalIdentity(db, {
        convexSnapshot: snapshot.snapshot,
        runId: `audit-${crypto.randomUUID()}`,
      });
      const record = persistReconciliationAudit(db, report, {
        mode: "audit",
        operatorId: req.authUser?.email ?? "service-token",
      });
      res.json({ ok: true, complete: snapshot.complete, reason: snapshot.reason, run: record, report });
    } catch (error) {
      next(error);
    }
  });

  router.post("/proposals", requireRole(["admin"]), (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = proposalSchema.parse(req.body);
      const proposalId = createSyncRepairProposal(db, {
        proposalId: payload.proposal_id,
        runId: payload.run_id,
        action: payload.action,
        payload: payload.payload,
        evidence: payload.evidence,
        createdBy: req.authUser?.email ?? "admin",
      });
      res.status(201).json({ ok: true, proposal_id: proposalId });
    } catch (error) {
      next(error);
    }
  });

  router.post("/proposals/:proposalId/approve", requireRole(["admin"]), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proposalId = z.string().trim().min(1).max(160).parse(req.params.proposalId);
      const reason = z.object({ reason: z.string().trim().min(1).max(1000) }).parse(req.body).reason;
      const boundary = await approveSyncRepairProposal(db, proposalId, req.authUser!.email, reason, adapter);
      res.json({
        ok: true,
        proposal_id: proposalId,
        status: "approved",
        approved_by: req.authUser!.email,
        freshness: boundary,
      });
    } catch (error) {
      if (error instanceof SyncReconciliationActionError) {
        const status = error.code === "PROPOSAL_NOT_FOUND" ? 404 : 409;
        res.status(status).json({ error: error.message, code: error.code });
        return;
      }
      next(error);
    }
  });

  router.post("/findings/:findingId/resolve", requireRole(["admin"]), (req: Request, res: Response, next: NextFunction) => {
    try {
      const findingId = z.coerce.number().int().positive().parse(req.params.findingId);
      const reason = z.object({ reason: z.string().trim().min(1).max(1000) }).parse(req.body).reason;
      const row = db.prepare(`SELECT id FROM sync_findings WHERE id = ?`).get(findingId) as { id: number } | undefined;
      if (!row) {
        res.status(404).json({ error: "Finding not found" });
        return;
      }
      // The shared resolver is the only mutation boundary for finding state.
      // It records operator identity and refuses duplicate resolution.
      resolveSyncFinding(db, findingId, req.authUser!.email, reason);
      res.json({ ok: true, finding_id: findingId, status: "resolved" });
    } catch (error) {
      next(error);
    }
  });

  router.post("/findings/:findingId/dismiss", requireRole(["admin"]), (req: Request, res: Response, next: NextFunction) => {
    try {
      const findingId = z.coerce.number().int().positive().parse(req.params.findingId);
      const reason = z.object({ reason: z.string().trim().min(1).max(1000) }).parse(req.body).reason;
      const row = db.prepare(`SELECT id FROM sync_findings WHERE id = ?`).get(findingId) as { id: number } | undefined;
      if (!row) {
        res.status(404).json({ error: "Finding not found" });
        return;
      }
      dismissSyncFinding(db, findingId, req.authUser!.email, reason);
      res.json({ ok: true, finding_id: findingId, status: "dismissed" });
    } catch (error) {
      next(error);
    }
  });

  router.post("/outbox/:outboxId/requeue", requireRole(["admin"]), (req: Request, res: Response, next: NextFunction) => {
    try {
      const outboxId = z.coerce.number().int().positive().parse(req.params.outboxId);
      const reason = z.object({ reason: z.string().trim().min(1).max(1000) }).parse(req.body).reason;
      requeueResolvedSyncOutbox(db, outboxId, req.authUser!.email, reason);
      res.json({ ok: true, outbox_id: outboxId, status: "pending" });
    } catch (error) {
      next(error);
    }
  });

  router.post("/outbox/:outboxId/override", requireRole(["admin"]), (req: Request, res: Response, next: NextFunction) => {
    try {
      const outboxId = z.coerce.number().int().positive().parse(req.params.outboxId);
      const payload = z.object({
        reason: z.string().trim().min(1).max(1000),
        expires_at: z.string().datetime().nullish(),
      }).parse(req.body);
      const overrideId = overrideBlockedSyncOutbox(db, outboxId, req.authUser!.email, payload.reason, payload.expires_at);
      res.json({ ok: true, outbox_id: outboxId, status: "pending", override_id: overrideId });
    } catch (error) {
      next(error);
    }
  });

  router.post("/proposals/:proposalId/apply", requireRole(["admin"]), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proposalId = z.string().trim().min(1).max(160).parse(req.params.proposalId);
      const reason = z.object({ reason: z.string().trim().min(1).max(1000) }).parse(req.body).reason;
      // Plant/content mutation handlers are deliberately injected by the
      // caller in a future explicit repair deployment.  This route still
      // enforces role and freshness, but cannot claim an apply without one.
      res.status(501).json({
        error: "Repair proposal apply handler is not configured",
        code: "PROPOSAL_APPLY_HANDLER_UNAVAILABLE",
        proposal_id: proposalId,
        reason,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
