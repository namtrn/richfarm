import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { SqliteDatabase } from "../db";
import {
  CONTENT_SOURCE_ROOTS,
  FULL_HASH_AUDIT_DEFAULT_BUDGET,
  FULL_HASH_AUDIT_INTERVAL_MS,
  MONITOR_LEASE_RENEWAL_INTERVAL_MS,
  MONITOR_LEASE_TTL_MS,
} from "./contract";
import {
  getLastCompleteFullHashAuditAt,
  processCandidatePath,
  runFullHashAuditWindow,
  runLegacyBaseline,
  runStartupCatchUp,
  scanContentRoot,
} from "./scanner";
import { logDetector } from "./logger";
import {
  getMonitorLease,
  isBaselineSealed,
  releaseMonitorLease,
  renewMonitorLease,
  tryAcquireMonitorLease,
} from "./repository";
import {
  createCandidateQueue,
  createChokidarAdapter,
  type CandidateQueue,
  type ContentWatchAdapter,
} from "./watcher";

export type ContentMonitorPhase =
  | "disabled"
  | "starting"
  | "catching_up"
  | "ready"
  | "degraded"
  | "passive"
  | "stopped";

export interface ContentSourceMonitorConfig {
  repositoryRoot: string;
  enabled?: boolean;
  instanceId?: string;
  debounceMs?: number;
  maxQueueSize?: number;
  leaseTtlMs?: number;
  leaseRenewalMs?: number;
  leasePollMs?: number;
  reconcileIntervalMs?: number;
  auditIntervalMs?: number;
  auditBudget?: { windowDurationMs: number; maxFilesPerWindow: number };
  requiredLocales?: readonly string[];
}

export interface WatchAdapterFactory {
  (
    watchRoots: readonly string[],
    handlers: {
      onCandidate(absolutePath: string, kind: string): void;
      onError(error: Error): void;
    },
  ): ContentWatchAdapter;
}

export interface MonitorRunEvidence {
  runId: string;
  at: string;
  complete: boolean;
  errors: string[];
}

export interface MonitorHealthSnapshot {
  phase: ContentMonitorPhase;
  instanceId: string;
  isLeaseOwner: boolean;
  watching: boolean;
  baselineSealed: Record<string, boolean>;
  lastCatchUp: MonitorRunEvidence | null;
  lastReconcile: MonitorRunEvidence | null;
  fullHashAudit: { lastCompleteAt: string | null; ageMs: number | null };
  coverage: { complete: boolean; unresolvedQuarantined: number };
  watcher: { overflowCount: number; lastError: string | null };
  pendingEvents: number;
  degradedReasons: string[];
}

const defaultWatchAdapterFactory: WatchAdapterFactory = (watchRoots, handlers) =>
  createChokidarAdapter({
    watchRoots,
    awaitWriteFinishMs: 150,
    callbacks: {
      onCandidate: (absolutePath, kind) => handlers.onCandidate(absolutePath, kind),
      onError: (error) => handlers.onError(error),
      onReady: () => undefined,
    },
  });

function resolveIntervalTimer(fn: () => void, ms: number): NodeJS.Timeout {
  const timer = setInterval(fn, ms);
  timer.unref?.();
  return timer;
}

/** Locate the repository root that owns the watched content tree. */
export function resolveRepositoryRoot(): string {
  if (process.env.CONTENT_REPOSITORY_ROOT) {
    return path.resolve(process.env.CONTENT_REPOSITORY_ROOT);
  }
  let current = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (fs.existsSync(path.join(current, "content", "plants"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return path.resolve(process.cwd(), "..", "..");
}

export function createContentSourceMonitor(deps: {
  db: SqliteDatabase;
  config: ContentSourceMonitorConfig;
  watchAdapterFactory?: WatchAdapterFactory;
}) {
  const db = deps.db;
  const config = deps.config;
  const repositoryRoot = path.resolve(config.repositoryRoot);
  const instanceId = config.instanceId ?? crypto.randomUUID();
  const enabled = config.enabled ?? true;
  const leaseTtlMs = config.leaseTtlMs ?? MONITOR_LEASE_TTL_MS;
  const leaseRenewalMs = config.leaseRenewalMs ?? MONITOR_LEASE_RENEWAL_INTERVAL_MS;
  const leasePollMs = config.leasePollMs ?? 5_000;
  const reconcileIntervalMs = config.reconcileIntervalMs ?? 5 * 60_000;
  const auditIntervalMs = config.auditIntervalMs ?? 60 * 60_000;
  const auditBudget = config.auditBudget ?? FULL_HASH_AUDIT_DEFAULT_BUDGET;

  let phase: ContentMonitorPhase = "disabled";
  let stopped = true;
  let watching = false;
  let queue: CandidateQueue | null = null;
  let adapter: ContentWatchAdapter | null = null;
  let timers: NodeJS.Timeout[] = [];
  let overflowCount = 0;
  let watcherLastError: string | null = null;
  let lastCatchUp: MonitorRunEvidence | null = null;
  let lastReconcile: MonitorRunEvidence | null = null;

  const watchedRootAbsolutes = () =>
    CONTENT_SOURCE_ROOTS.map((root) => path.join(repositoryRoot, root.relRoot));

  const contentTreeAvailable = () =>
    CONTENT_SOURCE_ROOTS.every((root) =>
      fs.existsSync(path.join(repositoryRoot, root.relRoot)),
    );

  const holdsEveryRootWithoutAcquiring = () =>
    CONTENT_SOURCE_ROOTS.every((root) => {
      const lease = getMonitorLease(db, root.rootKey);
      return (
        lease !== null &&
        lease.owner_id === instanceId &&
        Date.parse(lease.expires_at) > Date.now()
      );
    });

  /**
   * All-or-nothing acquisition across every configured root. A partial
   * failure releases the roots already taken so this instance never holds a
   * partial lease that could block another instance's takeover.
   */
  const acquireAllRoots = (): boolean => {
    const acquired: string[] = [];
    for (const root of CONTENT_SOURCE_ROOTS) {
      if (tryAcquireMonitorLease(db, root.rootKey, instanceId, leaseTtlMs, Date.now())) {
        acquired.push(root.rootKey);
      } else {
        for (const taken of acquired) {
          releaseMonitorLease(db, taken, instanceId);
        }
        return false;
      }
    }
    return true;
  };

  const renewOwnership = () =>
    CONTENT_SOURCE_ROOTS.map(
      (root) =>
        [
          root.rootKey,
          renewMonitorLease(db, root.rootKey, instanceId, leaseTtlMs, Date.now()),
        ] as const,
    );

  const releaseOwnership = () => {
    for (const root of CONTENT_SOURCE_ROOTS) {
      releaseMonitorLease(db, root.rootKey, instanceId);
    }
  };

  const flushCandidates = (batch: readonly string[]) => {
    for (const candidate of batch) {
      try {
        processCandidatePath(
          { db, repositoryRoot, requiredLocales: config.requiredLocales },
          candidate,
        );
      } catch (error) {
        watcherLastError = error instanceof Error ? error.message : String(error);
      }
    }
  };

  const startWatching = () => {
    if (watching || stopped) {
      return;
    }
    queue =
      queue ??
      createCandidateQueue({
        debounceMs: config.debounceMs ?? 250,
        maxQueueSize: config.maxQueueSize ?? 10_000,
        flush: flushCandidates,
      });
    const factory = deps.watchAdapterFactory ?? defaultWatchAdapterFactory;
    adapter = factory(watchedRootAbsolutes(), {
      onCandidate: (absolutePath) => {
        if (!queue) return;
        const result = queue.push(absolutePath);
        if (result.overflowFlush) {
          overflowCount += 1;
        }
      },
      onError: (error) => {
        watcherLastError = error.message;
      },
    });
    watching = true;
  };

  /**
   * Unified demotion/shutdown path. Order is safety-critical:
   * 1. watching=false and the candidate queue is disposed AND detached
   *    synchronously, so late callbacks from a still-closing adapter are
   *    inert no-ops and can never write detector state.
   * 2. The adapter handle close is awaited.
   * 3. Only then are the remaining leases released, so ownership is never
   *    handed to a successor while this instance's watcher may still be open.
   *
   * The in-flight promise is cached only WHILE it runs and cleared on
   * completion, so a later activation cycle gets a fresh relinquish that
   * closes its own new adapter. Cleanup rides .finally(), which is always
   * deferred, keeping the cache bookkeeping race-free.
   */
  let relinquishInFlight: Promise<void> | null = null;
  let relinquishing = false;

  const beginRelinquish = (): Promise<void> => {
    if (relinquishInFlight) {
      return relinquishInFlight;
    }
    relinquishing = true;
    watching = false;
    queue?.dispose();
    queue = null;
    const currentAdapter = adapter;
    adapter = null;
    const closing = (async () => {
      try {
        if (currentAdapter) {
          await currentAdapter.stop();
        }
      } catch {
        // Close failures degrade health only; they must not block shutdown.
      }
    })();
    const chained = closing.finally(() => {
      releaseOwnership();
      relinquishing = false;
      logDetector({ event: "relinquish_complete", ownerId: instanceId, watching: false });
      if (relinquishInFlight === chained) {
        relinquishInFlight = null;
      }
    });
    logDetector({ event: "lease_lost_relinquish_started", ownerId: instanceId });
    relinquishInFlight = chained;
    return chained;
  };

  const recordEvidence = (
    kind: "catchup" | "reconcile",
    results: Array<{ runId: string; complete: boolean; errors: string[] }>,
  ) => {
    const evidence: MonitorRunEvidence = {
      runId: results.map((item) => item.runId).join(","),
      at: new Date().toISOString(),
      complete: results.every((item) => item.complete),
      errors: results.flatMap((item) => item.errors),
    };
    if (kind === "catchup") {
      lastCatchUp = evidence;
    } else {
      lastReconcile = evidence;
    }
  };

  const runReconcileTick = () => {
    if (stopped || !db.open || !holdsEveryRootWithoutAcquiring()) {
      return;
    }
    const results = CONTENT_SOURCE_ROOTS.map((root) =>
      scanContentRoot(
        {
          db,
          repositoryRoot,
          rootKey: root.rootKey,
          requiredLocales: config.requiredLocales,
          detectorSource: "periodic_reconcile",
        },
        { mode: "periodic_reconcile" },
      ),
    );
    recordEvidence("reconcile", results);
  };

  const runAuditTick = () => {
    if (stopped || !db.open || !holdsEveryRootWithoutAcquiring()) {
      return;
    }
    runFullHashAuditWindow(
      { db, repositoryRoot, requiredLocales: config.requiredLocales },
      { budget: auditBudget },
    );
  };

  let initializing = false;
  let initialized = false;

  /**
   * Single activation path used by both start() and lease polls. Ownership is
   * acquired BEFORE any baseline/catch-up/reconcile write, and one-time
   * initialization runs only while every root lease is held, so a passive
   * instance never writes detector state.
   */
  const tryBecomeActive = async (): Promise<boolean> => {
    if (stopped || watching || initializing || relinquishing) {
      return watching;
    }
    if (!acquireAllRoots()) {
      return false;
    }
    initializing = true;
    try {
      if (!initialized) {
        phase = "starting";
        runLegacyBaseline({ db, repositoryRoot, requiredLocales: config.requiredLocales });
        phase = "catching_up";
        recordEvidence(
          "catchup",
          runStartupCatchUp({ db, repositoryRoot, requiredLocales: config.requiredLocales }),
        );
        initialized = true;
      }
      startWatching();
      if (watching) {
        // Cover the handoff gap immediately instead of waiting one interval.
        runReconcileTick();
        runAuditTick();
        // Leave the transient initialization states; getStatus() refines this
        // to ready or degraded from live evidence.
        phase = "ready";
        logDetector({
          event: "activation_complete",
          ownerId: instanceId,
          phase,
          initialized,
        });
      }
      return watching;
    } finally {
      initializing = false;
    }
  };

  const pollLease = () => {
    if (stopped || !db.open) {
      return;
    }
    if (watching) {
      const lost = renewOwnership().some(([, renewed]) => !renewed);
      if (lost) {
        // Detach intake synchronously; close, then release (see
        // beginRelinquish). No new activation may start mid-relinquish.
        void beginRelinquish();
      }
      return;
    }
    void tryBecomeActive();
  };

  const monitor = {
    get instanceId(): string {
      return instanceId;
    },

    async start(): Promise<void> {
      if (!stopped) {
        return;
      }
      stopped = false;
      overflowCount = 0;
      watcherLastError = null;

      if (!enabled || !contentTreeAvailable()) {
        phase = "disabled";
        return;
      }

      timers = [
        resolveIntervalTimer(pollLease, leasePollMs),
        resolveIntervalTimer(runReconcileTick, reconcileIntervalMs),
        resolveIntervalTimer(runAuditTick, auditIntervalMs),
      ];

      // Lease-first: an instance that cannot own every configured root goes
      // straight to passive without writing any baseline/catch-up state.
      const activated = await tryBecomeActive();
      if (!activated) {
        phase = "passive";
      }

      phase = monitor.getStatus().phase;
    },

    async stop(): Promise<void> {
      if (stopped) {
        return;
      }
      stopped = true;
      for (const timer of timers) {
        clearInterval(timer);
      }
      timers = [];
      // Same safety order as lease-loss demotion: detach intake, close the
      // handle, and only then release ownership. Idempotent if a relinquish
      // is already in flight.
      await beginRelinquish();
      phase = "stopped";
    },

    /** Test/diagnostic funnel: push candidate paths through the same queue. */
    handleCandidatePaths(paths: readonly string[]): void {
      if (!queue) {
        return;
      }
      for (const candidate of paths) {
        const result = queue.push(candidate);
        if (result.overflowFlush) {
          overflowCount += 1;
        }
      }
      queue.flushNow();
    },

    /** Test/diagnostic funnel: run one lease poll immediately. */
    pollLeaseNow(): void {
      pollLease();
    },

    getStatus(): MonitorHealthSnapshot {
      const now = Date.now();
      const lastCompleteAuditAt = getLastCompleteFullHashAuditAt(db);
      const auditAgeMs = lastCompleteAuditAt ? now - Date.parse(lastCompleteAuditAt) : null;
      const unresolvedQuarantined = (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM content_source_quarantine WHERE resolved_at IS NULL`,
          )
          .get() as { count: number }
      ).count;
      const pendingEvents = (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM content_change_events WHERE review_state = 'pending'`,
          )
          .get() as { count: number }
      ).count;

      const baselineSealed: Record<string, boolean> = {};
      for (const root of CONTENT_SOURCE_ROOTS) {
        baselineSealed[root.rootKey] = isBaselineSealed(db, root.rootKey);
      }

      const degradedReasons: string[] = [];
      if (auditAgeMs === null || auditAgeMs > FULL_HASH_AUDIT_INTERVAL_MS) {
        degradedReasons.push("FULL_HASH_AUDIT_STALE");
      }
      if (lastCatchUp && !lastCatchUp.complete) {
        degradedReasons.push("CATCH_UP_INCOMPLETE");
      }
      if (lastReconcile && !lastReconcile.complete) {
        degradedReasons.push("RECONCILE_INCOMPLETE");
      }
      if (overflowCount > 0) {
        degradedReasons.push("WATCH_QUEUE_OVERFLOW");
      }
      if (watcherLastError) {
        degradedReasons.push("WATCHER_ERROR");
      }
      if (unresolvedQuarantined > 0) {
        degradedReasons.push("QUARANTINED_PATHS_PENDING");
      }

      let resolvedPhase: ContentMonitorPhase = phase;
      if (phase !== "disabled" && phase !== "stopped") {
        if (phase === "starting" || phase === "catching_up") {
          // Transient states set while initialization runs under the lease.
          resolvedPhase = phase;
        } else if (!watching) {
          resolvedPhase = "passive";
        } else if (degradedReasons.length > 0) {
          resolvedPhase = "degraded";
        } else {
          resolvedPhase = "ready";
        }
      }

      return {
        phase: resolvedPhase,
        instanceId,
        isLeaseOwner: watching,
        watching,
        baselineSealed,
        lastCatchUp,
        lastReconcile,
        fullHashAudit: { lastCompleteAt: lastCompleteAuditAt, ageMs: auditAgeMs },
        coverage: { complete: unresolvedQuarantined === 0, unresolvedQuarantined },
        watcher: { overflowCount, lastError: watcherLastError },
        pendingEvents,
        degradedReasons,
      };
    },
  };
  return monitor;
}
