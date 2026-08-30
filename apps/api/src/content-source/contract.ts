import { REQUIRED_CONTENT_LOCALES } from "../content-manifests";

export type ContentEntityKind = "plant" | "pest_disease";
export type ContentSourceFileKind = "manifest" | "markdown";
export type ContentSourceFileState =
  | "clean"
  | "changed"
  | "new"
  | "deleted"
  | "invalid"
  | "unreadable";

/**
 * Manifest binding status of a tracked file. `legacy_missing_manifest` is only
 * assigned by the explicitly marked one-time baseline run; after the baseline
 * checkpoint is sealed every manifestless file is `missing_manifest`.
 */
export type ContentOwnerStatus =
  | "manifest_ok"
  | "missing_manifest"
  | "legacy_missing_manifest";

export type ContentEventType =
  | "created"
  | "modified"
  | "renamed"
  | "deleted"
  | "manifest_changed";

export type ContentDetectorSource =
  | "watcher"
  | "startup_catchup"
  | "periodic_reconcile"
  | "ci";

export type ContentReviewState =
  | "pending"
  | "blocked"
  | "approved"
  | "applied"
  | "dismissed"
  | "superseded";

export type ContentCheckpointKind = "baseline" | "metadata" | "full_hash";

export type ContentRunMode =
  | "watcher_session"
  | "startup_catchup"
  | "periodic_reconcile"
  | "full_hash_audit"
  | "baseline";

export type ContentRunStatus = "running" | "complete" | "incomplete" | "failed";

export interface ContentSourceRoot {
  rootKey: string;
  relRoot: string;
  entityKind: ContentEntityKind;
}

/** Watched roots. Paths outside these roots are rejected before persistence. */
export const CONTENT_SOURCE_ROOTS: readonly ContentSourceRoot[] = [
  { rootKey: "plants", relRoot: "content/plants", entityKind: "plant" },
  {
    rootKey: "pests-diseases",
    relRoot: "content/pests-diseases",
    entityKind: "pest_disease",
  },
];

export const CONTENT_MANIFEST_FILENAME = "content.json";
export const CONTENT_SOURCE_MARKDOWN_SUFFIX = ".md";

/**
 * Required locales default to the authoritative manifest policy. Callers may
 * override per configured policy; nothing here hard-codes a locale list.
 */
export const DEFAULT_REQUIRED_LOCALES: readonly string[] = REQUIRED_CONTENT_LOCALES;

/** Lease and heartbeat timing pinned by MCD-1. */
export const MONITOR_LEASE_TTL_MS = 30_000;
export const MONITOR_LEASE_RENEWAL_INTERVAL_MS = 10_000;

/** Pending durable events must be visible to the dashboard within this SLA. */
export const PENDING_EVENT_VISIBILITY_SLA_MS = 30_000;

/** A complete full-hash audit must finish at least once per interval. */
export const FULL_HASH_AUDIT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Initial full-hash audit I/O budget shape. Values are conservative starting
 * points; MCD-7 records measured API latency and tunes both fields.
 */
export interface FullHashAuditBudget {
  windowDurationMs: number;
  maxFilesPerWindow: number;
}

export const FULL_HASH_AUDIT_DEFAULT_BUDGET: FullHashAuditBudget = {
  windowDurationMs: 10 * 60 * 1000,
  // MCD-7 measured throughput on the 50k fixture: ~3,400 files/s hashing.
  // A 10-minute hourly window at 20,000 files finishes a 50k cycle in three
  // windows with headroom for API workload; tune again from live baselines.
  maxFilesPerWindow: 20_000,
};

export const RETENTION_TERMINAL_EVENT_DAYS_DEFAULT = 90;
export const RETENTION_MAX_DATABASE_BYTES_DEFAULT = 512 * 1024 * 1024;

const REVIEW_TRANSITIONS: Record<
  ContentReviewState,
  readonly ContentReviewState[]
> = {
  pending: ["pending", "blocked", "approved", "dismissed", "superseded"],
  blocked: ["blocked", "approved", "dismissed", "superseded"],
  approved: ["applied", "superseded"],
  applied: [],
  dismissed: [],
  superseded: [],
};

export function isTerminalReviewState(state: ContentReviewState): boolean {
  return REVIEW_TRANSITIONS[state].length === 0;
}

export function canTransitionReviewState(
  from: ContentReviewState,
  to: ContentReviewState,
): boolean {
  return REVIEW_TRANSITIONS[from].includes(to);
}

export class InvalidReviewTransitionError extends Error {
  constructor(from: ContentReviewState, to: ContentReviewState) {
    super(`REVIEW_STATE_TRANSITION_INVALID: ${from} -> ${to}`);
    this.name = "InvalidReviewTransitionError";
  }
}

export function assertReviewTransition(
  from: ContentReviewState,
  to: ContentReviewState,
): void {
  if (!canTransitionReviewState(from, to)) {
    throw new InvalidReviewTransitionError(from, to);
  }
}

export function ownerStatusForMissingManifest(options: {
  baselineSealed: boolean;
}): ContentOwnerStatus {
  return options.baselineSealed ? "missing_manifest" : "legacy_missing_manifest";
}
