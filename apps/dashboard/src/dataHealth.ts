export type DataHealthFreshnessState = "fresh" | "stale" | "incomplete" | "unavailable";
export type DataHealthStatus = "healthy" | "warning" | "blocked" | "incomplete" | "stale" | "unavailable";
export type DataHealthSeverity = "info" | "warning" | "blocked";
export type DataHealthFindingStatus = "open" | "resolved" | "dismissed";

export type DataHealthCounts = {
  healthy: number;
  warning: number;
  blocked: number;
  info: number;
};

export type DataHealthFinding = {
  id: number;
  fingerprint: string;
  runId: string | null;
  severity: DataHealthSeverity;
  code: string;
  category: string;
  canonicalKey: string | null;
  sqliteIdentities: Array<Record<string, unknown>>;
  convexIdentities: Array<Record<string, unknown>>;
  evidence: Record<string, unknown>;
  resolutionStatus: DataHealthFindingStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionReason: string | null;
  sqliteCatalogRevision: string | null;
  sqliteDataRevision: string | null;
  outboxWatermark: number | null;
  snapshotRevision: string | null;
};

export type DataHealthOutboxItem = {
  id: number;
  dedupeKey: string;
  entityType: string;
  sourceSystem: string;
  sourceId: string;
  operation: string;
  locale: string | null;
  status: string;
  attemptCount: number;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  lastError: string | null;
  blockedFindingId: number | null;
  blockedAt: string | null;
  blockedBy: string | null;
  blockedReason: string | null;
  overrideId: string | null;
  overrideReason: string | null;
  overrideExpiresAt: string | null;
  supersededBy: number | null;
  supersededAt: string | null;
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
};

export type DataHealthProposal = {
  id: number;
  proposalId: string;
  runId: string;
  action: string;
  status: "proposed" | "approved" | "applied" | "rejected" | "stale";
  payload: Record<string, unknown>;
  evidence: Record<string, unknown>;
  sqliteCatalogRevision: string;
  sqliteDataRevision: string;
  outboxWatermark: number;
  snapshotRevision: string | null;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalReason: string | null;
  appliedBy: string | null;
  appliedAt: string | null;
  rejectionReason: string | null;
  updatedAt: string;
};

export type DataHealthState = {
  generatedAt: string;
  freshness: {
    state: DataHealthFreshnessState;
    reason: string | null;
    sqliteCatalogRevision: string;
    sqliteOutboxWatermark: number;
    snapshotRevision: string | null;
    expectedCount: number | null;
    receivedCount: number | null;
    snapshotComplete: boolean;
    lastRun: {
      runId: string | null;
      source: string;
      mode: string;
      status: string;
      startedAt: string;
      finishedAt: string | null;
      error: string | null;
      snapshotComplete: boolean;
      findingCount: number;
    } | null;
  };
  health: {
    status: DataHealthStatus;
    counts: DataHealthCounts;
    activeFindingCount: number;
    affectedIdentityCount: number;
  };
  findings: DataHealthFinding[];
  affectedIdentities: Array<{
    key: string;
    canonicalKey: string | null;
    identities: Array<Record<string, unknown>>;
    findingIds: number[];
    severities: string[];
  }>;
  outbox: {
    counts: Record<string, number>;
    items: DataHealthOutboxItem[];
  };
  proposals: DataHealthProposal[];
  controls: {
    canResolve: boolean;
    canDismiss: boolean;
    canRequeue: boolean;
    canOverride: boolean;
    canCreateProposal: boolean;
    canApproveProposal: boolean;
  };
};

export type DataHealthFilters = {
  findingSeverity: "all" | DataHealthSeverity;
  findingStatus: "all" | DataHealthFindingStatus;
  findingSearch: string;
};

export const defaultDataHealthFilters: DataHealthFilters = {
  findingSeverity: "all",
  findingStatus: "open",
  findingSearch: "",
};

export function dataHealthStatusLabel(status: DataHealthStatus): string {
  switch (status) {
    case "healthy": return "Healthy";
    case "warning": return "Needs attention";
    case "blocked": return "Blocked";
    case "incomplete": return "Incomplete snapshot";
    case "stale": return "Stale evidence";
    case "unavailable": return "No audit evidence";
  }
}

export function dataHealthStatusClass(status: DataHealthStatus): string {
  switch (status) {
    case "healthy": return "health-ok";
    case "warning": return "health-warning";
    case "blocked": return "health-blocked";
    default: return "health-muted";
  }
}

/** Combine evidence freshness with finding health so a fresh blocked run is not shown green. */
export function dataHealthAlertClass(
  freshness: DataHealthFreshnessState,
  status: DataHealthStatus,
): "health-alert-ok" | "health-alert-warning" | "health-alert-danger" {
  if (freshness !== "fresh" || status === "blocked" || status === "incomplete" || status === "stale" || status === "unavailable") {
    return "health-alert-danger";
  }
  return status === "warning" ? "health-alert-warning" : "health-alert-ok";
}

export function identityDisplay(identity: Record<string, unknown>): string {
  const source = String(identity.sourceSystem ?? identity.source_system ?? "").trim();
  const sourceId = String(identity.sourceId ?? identity.source_id ?? "").trim();
  const plantCode = String(identity.plantCode ?? identity.plant_code ?? "").trim();
  const id = String(identity.id ?? "").trim();
  return [source && `${source}:`, sourceId || plantCode || (id && `#${id}`)].filter(Boolean).join(" ") || "unidentified row";
}

export function formatEvidence(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
