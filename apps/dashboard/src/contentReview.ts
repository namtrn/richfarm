/** Pending durable events must surface within the plan's 30-second SLA;
 * we poll at half that so worst-case visibility stays comfortably inside it. */
export const CONTENT_INBOX_POLL_INTERVAL_MS = 15_000;
export const CONTENT_MONITOR_STATUS_POLL_INTERVAL_MS = 30_000;

export type ContentReviewEvent = {
  id: number;
  event_id: string;
  correlation_group_id: string | null;
  root_key: string;
  path: string;
  owning_manifest_path: string | null;
  entity_kind: string;
  entity_key: string | null;
  locale: string | null;
  event_type: string;
  old_sha256: string | null;
  new_sha256: string | null;
  detector_source: string;
  evidence_revision: number;
  findings_json: string;
  review_state: string;
  reviewer_id: string | null;
  review_reason: string | null;
  reviewed_at: string | null;
  proposal_id: string | null;
  superseded_by_event_id: string | null;
  coalesced_count: number;
  first_detected_at: string;
  last_detected_at: string;
};

export type ContentEventsPage = {
  items: ContentReviewEvent[];
  total: number;
  limit: number;
  offset: number;
};

export type ContentEventPreview = {
  eventId: string;
  eventType: string;
  reviewState: string;
  detectorSource: string;
  path: string;
  entityKind: string;
  entityKey: string | null;
  locale: string | null;
  oldSha256: string | null;
  newSha256: string | null;
  currentSha256: string | null;
  fileExists: boolean;
  incomingBytes: number | null;
  incomingExcerpt: string | null;
  stagedBefore: string | null;
  stagedLocaleExists: boolean;
  owningManifestPath: string | null;
  manifestIdentity: Record<string, unknown> | null;
  findings: Record<string, unknown>;
  correlationGroupId: string | null;
};

export type ContentMonitorHealth = {
  phase: string;
  instanceId: string;
  isLeaseOwner: boolean;
  watching: boolean;
  baselineSealed: Record<string, boolean>;
  lastCatchUp: { runId: string; at: string; complete: boolean; errors: string[] } | null;
  lastReconcile: { runId: string; at: string; complete: boolean; errors: string[] } | null;
  fullHashAudit: { lastCompleteAt: string | null; ageMs: number | null };
  coverage: { complete: boolean; unresolvedQuarantined: number };
  watcher: { overflowCount: number; lastError: string | null };
  pendingEvents: number;
  degradedReasons: string[];
};

export type ContentMonitorStatusResponse = {
  health: ContentMonitorHealth | null;
  quarantined: Array<{
    path: string;
    reason: string;
    retry_count: number;
    next_retry_at: string;
  }>;
};

export interface ContentInboxFilters {
  reviewState: "" | "pending" | "blocked" | "approved" | "applied" | "dismissed" | "superseded";
  entityKind: "" | "plant" | "pest_disease";
  limit: number;
  offset: number;
}

export const defaultContentInboxFilters: ContentInboxFilters = {
  reviewState: "pending",
  entityKind: "",
  limit: 50,
  offset: 0,
};

export function buildEventsPath(filters: ContentInboxFilters): string {
  const params = new URLSearchParams({ limit: String(filters.limit), offset: String(filters.offset) });
  if (filters.reviewState) params.set("reviewState", filters.reviewState);
  if (filters.entityKind) params.set("entityKind", filters.entityKind);
  return `/api/content-review/events?${params.toString()}`;
}

export function reviewStateBadgeClass(state: string): string {
  switch (state) {
    case "pending":
      return "badge-pending";
    case "approved":
      return "badge-approved";
    case "applied":
      return "badge-active";
    case "blocked":
      return "badge-blocked";
    case "dismissed":
      return "badge-archived";
    case "superseded":
      return "badge-superseded";
    default:
      return "pill";
  }
}

export function detectorLabel(source: string): string {
  switch (source) {
    case "watcher":
      return "Live watcher";
    case "startup_catchup":
      return "Startup catch-up";
    case "periodic_reconcile":
      return "Reconcile";
    case "ci":
      return "CI";
    default:
      return source;
  }
}

export function monitorPhasePillClass(phase: string): string {
  if (phase === "ready") return "pill ok";
  if (phase === "degraded") return "pill warn";
  if (phase === "passive") return "pill passive";
  if (phase === "disabled" || phase === "stopped") return "pill muted";
  return "pill";
}
