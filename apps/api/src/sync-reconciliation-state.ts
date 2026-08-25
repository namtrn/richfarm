import { getSyncCatalogRevision, type SqliteDatabase } from "./db";

export type FindingSeverity = "info" | "warning" | "blocked";
export type FindingResolutionStatus = "open" | "resolved" | "dismissed";

export interface ReconciliationHealthCounts {
  /** Plants without an active finding for the current persisted evidence. */
  healthy: number;
  warning: number;
  blocked: number;
  info: number;
}

export interface ReconciliationStateOptions {
  findingSeverity?: FindingSeverity | "all";
  findingStatus?: FindingResolutionStatus | "all";
  findingCategory?: string;
  findingSearch?: string;
  findingLimit?: number;
  outboxStatus?: string | "all";
  outboxLimit?: number;
  proposalStatus?: string | "all";
  proposalLimit?: number;
  role?: "admin" | "editor";
}

export interface ReconciliationStateSnapshot {
  generatedAt: string;
  freshness: {
    state: "fresh" | "stale" | "incomplete" | "unavailable";
    reason: string | null;
    sqliteCatalogRevision: string;
    sqliteOutboxWatermark: number;
    snapshotRevision: string | null;
    expectedCount: number | null;
    receivedCount: number | null;
    snapshotComplete: boolean;
    lastRun: Record<string, unknown> | null;
  };
  health: {
    status: "healthy" | "warning" | "blocked" | "incomplete" | "stale" | "unavailable";
    counts: ReconciliationHealthCounts;
    activeFindingCount: number;
    affectedIdentityCount: number;
  };
  findings: Array<Record<string, unknown>>;
  affectedIdentities: Array<Record<string, unknown>>;
  outbox: {
    counts: Record<string, number>;
    items: Array<Record<string, unknown>>;
  };
  proposals: Array<Record<string, unknown>>;
  controls: {
    canResolve: boolean;
    canDismiss: boolean;
    canRequeue: boolean;
    canOverride: boolean;
    canCreateProposal: boolean;
    canApproveProposal: boolean;
  };
}

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value: unknown): Array<Record<string, unknown>> {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
      : [];
  } catch {
    return [];
  }
}

function boundedLimit(value: number | undefined, fallback: number, max: number): number {
  return Number.isSafeInteger(value) ? Math.max(1, Math.min(max, value as number)) : fallback;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

function rowRun(row: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id ?? null,
    source: row.source,
    mode: row.mode ?? "audit",
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    remoteCount: row.remote_count,
    localCount: row.local_count,
    driftBefore: row.drift_before,
    driftAfter: row.drift_after,
    error: row.error,
    sqliteDataRevision: row.sqlite_data_revision ?? null,
    sqliteCatalogRevision: row.sqlite_catalog_revision ?? null,
    sqliteOutboxWatermark: row.sqlite_outbox_watermark ?? null,
    snapshotRevision: row.convex_snapshot_revision ?? null,
    expectedCount: row.expected_count ?? null,
    receivedCount: row.received_count ?? null,
    pageCount: row.page_count ?? 0,
    terminalCursor: row.terminal_cursor ?? null,
    sourceDataChanged: row.source_data_changed === 1,
    snapshotComplete: row.snapshot_complete === 1,
    findingCount: row.finding_count ?? 0,
    operatorId: row.operator_id ?? null,
  };
}

function findingMatchesSearch(row: Record<string, unknown>, search: string): boolean {
  if (!search) return true;
  const haystack = [
    row.code,
    row.category,
    row.canonical_key,
    row.resolution_status,
    row.sqlite_identity_json,
    row.convex_identity_json,
    row.evidence_json,
  ].map((value) => String(value ?? "")).join(" ").toLowerCase();
  return haystack.includes(search);
}

function findingView(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    runId: row.run_id ?? null,
    severity: row.severity,
    code: row.code,
    category: row.category,
    canonicalKey: row.canonical_key ?? null,
    sqliteIdentities: parseJsonArray(row.sqlite_identity_json),
    convexIdentities: parseJsonArray(row.convex_identity_json),
    evidence: parseJson(row.evidence_json),
    resolutionStatus: row.resolution_status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    occurrenceCount: row.occurrence_count,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    resolutionReason: row.resolution_reason,
    sqliteCatalogRevision: row.sqlite_catalog_revision ?? null,
    sqliteDataRevision: row.sqlite_data_revision ?? null,
    outboxWatermark: row.outbox_watermark ?? null,
    snapshotRevision: row.convex_snapshot_revision ?? null,
  };
}

function identityKey(identity: Record<string, unknown>): string {
  const sourceSystem = String(identity.sourceSystem ?? identity.source_system ?? "");
  const sourceId = String(identity.sourceId ?? identity.source_id ?? "");
  const id = String(identity.id ?? "");
  const plantCode = String(identity.plantCode ?? identity.plant_code ?? "");
  return [sourceSystem, sourceId, id, plantCode].join("|");
}

function buildAffectedIdentities(rows: readonly Record<string, unknown>[]): Array<Record<string, unknown>> {
  const byKey = new Map<string, {
    canonicalKey: string | null;
    identities: Record<string, unknown>[];
    findingIds: number[];
    severities: Set<string>;
  }>();
  for (const row of rows) {
    const findingId = Number(row.id);
    const canonicalKey = typeof row.canonicalKey === "string" ? row.canonicalKey : null;
    const identities = [
      ...(Array.isArray(row.sqliteIdentities) ? row.sqliteIdentities : []),
      ...(Array.isArray(row.convexIdentities) ? row.convexIdentities : []),
    ].filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
    const candidates = identities.length > 0 ? identities : [{ canonicalKey }];
    for (const identity of candidates) {
      const key = canonicalKey ?? identityKey(identity);
      const existing = byKey.get(key) ?? {
        canonicalKey,
        identities: [],
        findingIds: [],
        severities: new Set<string>(),
      };
      if (canonicalKey) existing.canonicalKey = canonicalKey;
      if (!existing.identities.some((item) => identityKey(item) === identityKey(identity))) existing.identities.push(identity);
      if (Number.isSafeInteger(findingId) && !existing.findingIds.includes(findingId)) existing.findingIds.push(findingId);
      if (typeof row.severity === "string") existing.severities.add(row.severity);
      byKey.set(key, existing);
    }
  }
  return [...byKey.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => ({
    key,
    canonicalKey: value.canonicalKey,
    identities: value.identities,
    findingIds: value.findingIds.sort((left, right) => left - right),
    severities: [...value.severities].sort(),
  }));
}

function outboxView(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    dedupeKey: row.dedupe_key,
    entityType: row.entity_type,
    sourceSystem: row.source_system,
    sourceId: row.source_id,
    operation: row.operation,
    locale: row.locale,
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at,
    lastAttemptAt: row.last_attempt_at,
    lastError: row.last_error,
    blockedFindingId: row.blocked_finding_id,
    blockedAt: row.blocked_at,
    blockedBy: row.blocked_by,
    blockedReason: row.blocked_reason,
    overrideId: row.override_id,
    overrideReason: row.override_reason,
    overrideExpiresAt: row.override_expires_at,
    supersededBy: row.superseded_by,
    supersededAt: row.superseded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payload: parseJson(row.payload_json),
  };
}

function proposalView(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    runId: row.run_id,
    action: row.action,
    status: row.status,
    payload: parseJson(row.payload_json),
    evidence: parseJson(row.evidence_json),
    sqliteCatalogRevision: row.sqlite_catalog_revision,
    sqliteDataRevision: row.sqlite_data_revision,
    outboxWatermark: row.outbox_watermark,
    snapshotRevision: row.convex_snapshot_revision,
    expectedCount: row.convex_expected_count ?? null,
    receivedCount: row.convex_received_count ?? null,
    pageCount: row.convex_page_count ?? null,
    terminalCursor: row.convex_terminal_cursor ?? null,
    sourceDataChanged: row.source_data_changed === 1,
    snapshotComplete: row.snapshot_complete === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    approvalReason: row.approval_reason ?? null,
    appliedBy: row.applied_by,
    appliedAt: row.applied_at,
    rejectionReason: row.rejection_reason,
    updatedAt: row.updated_at,
  };
}

/** Read only persisted CID-7 state for the dashboard. Never calls Convex. */
export function readSyncReconciliationState(
  db: SqliteDatabase,
  options: ReconciliationStateOptions = {},
): ReconciliationStateSnapshot {
  const findingLimit = boundedLimit(options.findingLimit, 200, 500);
  const outboxLimit = boundedLimit(options.outboxLimit, 200, 500);
  const proposalLimit = boundedLimit(options.proposalLimit, 100, 500);
  const currentCatalogRevision = String(getSyncCatalogRevision(db));
  const watermark = Number((db.prepare(`SELECT COALESCE(MAX(id), 0) AS watermark FROM sync_outbox`).get() as { watermark: number }).watermark ?? 0);
  const lastRunRow = db.prepare(`SELECT * FROM sync_reconciliation_runs ORDER BY id DESC LIMIT 1`).get() as Record<string, unknown> | undefined;
  const lastRun = rowRun(lastRunRow);
  const runCatalogRevision = typeof lastRun?.sqliteCatalogRevision === "string" ? lastRun.sqliteCatalogRevision : null;
  const runWatermark = typeof lastRun?.sqliteOutboxWatermark === "number" ? lastRun.sqliteOutboxWatermark : null;
  let freshnessState: ReconciliationStateSnapshot["freshness"]["state"] = "unavailable";
  let freshnessReason: string | null = "no_reconciliation_run";
  if (lastRun) {
    if (lastRun.snapshotComplete !== true || lastRun.status === "incomplete" || lastRun.sourceDataChanged === true) {
      freshnessState = "incomplete";
      freshnessReason = lastRun.sourceDataChanged === true ? "source_changed_during_read" : "snapshot_incomplete";
    } else if (runCatalogRevision !== currentCatalogRevision || runWatermark !== watermark) {
      freshnessState = "stale";
      freshnessReason = "local_freshness_boundary_changed";
    } else {
      freshnessState = "fresh";
      freshnessReason = null;
    }
  }

  const findingStatus = options.findingStatus ?? "all";
  const findingSeverity = options.findingSeverity ?? "all";
  const findingCategory = options.findingCategory?.trim() ?? "";
  const findingSearch = options.findingSearch?.trim().toLowerCase() ?? "";
  const allFindingRows = db.prepare(`SELECT * FROM sync_findings ORDER BY id DESC`).all() as Array<Record<string, unknown>>;
  const activeRows = allFindingRows.filter((row) => row.resolution_status === "open");
  const activeViews = activeRows.map(findingView);
  const affectedIdentities = buildAffectedIdentities(activeViews);
  const plantCount = Number((db.prepare(`SELECT COUNT(*) AS count FROM master_plants`).get() as { count: number }).count ?? 0);
  const severityCounts: ReconciliationHealthCounts = {
    healthy: Math.max(0, plantCount - affectedIdentities.length),
    warning: activeRows.filter((row) => row.severity === "warning").length,
    blocked: activeRows.filter((row) => row.severity === "blocked").length,
    info: activeRows.filter((row) => row.severity === "info").length,
  };
  const filteredFindings = allFindingRows
    .filter((row) => findingStatus === "all" || row.resolution_status === findingStatus)
    .filter((row) => findingSeverity === "all" || row.severity === findingSeverity)
    .filter((row) => !findingCategory || row.category === findingCategory)
    .filter((row) => findingMatchesSearch(row, findingSearch))
    .slice(0, findingLimit)
    .map(findingView);

  const outboxStatus = options.outboxStatus ?? "all";
  const allOutboxRows = db.prepare(`SELECT * FROM sync_outbox ORDER BY id DESC`).all() as Array<Record<string, unknown>>;
  const outboxCounts: Record<string, number> = {
    pending: 0,
    processing: 0,
    applied: 0,
    failed: 0,
    blocked: 0,
    superseded: 0,
  };
  for (const row of allOutboxRows) {
    if (typeof row.status === "string") outboxCounts[row.status] = (outboxCounts[row.status] ?? 0) + 1;
  }
  const outboxItems = allOutboxRows
    .filter((row) => outboxStatus === "all" || row.status === outboxStatus)
    .slice(0, outboxLimit)
    .map(outboxView);

  const proposalStatus = options.proposalStatus ?? "all";
  const proposals = (db.prepare(`SELECT * FROM sync_repair_proposals ORDER BY id DESC`).all() as Array<Record<string, unknown>>)
    .filter((row) => proposalStatus === "all" || row.status === proposalStatus)
    .slice(0, proposalLimit)
    .map(proposalView);

  const healthStatus: ReconciliationStateSnapshot["health"]["status"] = freshnessState === "unavailable"
    ? "unavailable"
    : freshnessState === "incomplete"
      ? "incomplete"
      : freshnessState === "stale"
        ? "stale"
        : severityCounts.blocked > 0
          ? "blocked"
          : severityCounts.warning > 0
            ? "warning"
            : "healthy";

  return {
    generatedAt: new Date().toISOString(),
    freshness: {
      state: freshnessState,
      reason: freshnessReason,
      sqliteCatalogRevision: currentCatalogRevision,
      sqliteOutboxWatermark: watermark,
      snapshotRevision: typeof lastRun?.snapshotRevision === "string" ? lastRun.snapshotRevision : null,
      expectedCount: typeof lastRun?.expectedCount === "number" ? lastRun.expectedCount : null,
      receivedCount: typeof lastRun?.receivedCount === "number" ? lastRun.receivedCount : null,
      snapshotComplete: lastRun?.snapshotComplete === true,
      lastRun,
    },
    health: {
      status: healthStatus,
      counts: severityCounts,
      activeFindingCount: activeRows.length,
      affectedIdentityCount: affectedIdentities.length,
    },
    findings: filteredFindings,
    affectedIdentities,
    outbox: { counts: outboxCounts, items: outboxItems },
    proposals,
    controls: {
      canResolve: options.role === "admin",
      canDismiss: options.role === "admin",
      canRequeue: options.role === "admin",
      canOverride: options.role === "admin",
      canCreateProposal: options.role === "admin",
      canApproveProposal: options.role === "admin",
    },
  };
}
