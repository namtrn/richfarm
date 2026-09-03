import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { SqliteDatabase } from "../db";
import {
  CONTENT_SOURCE_ROOTS,
  type ContentDetectorSource,
  type ContentOwnerStatus,
} from "./contract";
import {
  classifyRelativeContentPath,
  normalizeRepositoryRelativePath,
  type ClassifyOptions,
  type ContentSourcePathClassification,
} from "./paths";
import { logDetector } from "./logger";
import {
  correlateRenameEvents,
  findIndexedCaseFoldCollisions,
  getCheckpoint,
  getLatestChangeEventForPath,
  getQuarantineEntry,
  getSourceFile,
  isBaselineSealed,
  markSourceFileDeleted,
  markSourceFileState,
  nowIso,
  quarantinePath,
  recordContentChangeEvent,
  resolveQuarantine,
  sealLegacyBaseline,
  setCheckpoint,
  startMonitorRun,
  finishMonitorRun,
  upsertSourceFile,
  bumpContentSourceRevision,
  supersedePendingManifestlessEvents,
} from "./repository";

export interface ScanCounts {
  pathsInspected: number;
  metadataComparisons: number;
  filesHashed: number;
  eventsProduced: number;
  deletionsDetected: number;
  quarantined: number;
}

export interface ScanResult {
  runId: string;
  mode: "startup_catchup" | "periodic_reconcile" | "baseline";
  complete: boolean;
  counts: ScanCounts;
  errors: string[];
}

interface ScanContext {
  db: SqliteDatabase;
  repositoryRoot: string;
  classifyOptions: ClassifyOptions;
  counts: ScanCounts;
  errors: string[];
  detectorSource: ContentDetectorSource;
  /** digest -> eventId maps for rename pairing within one run */
  deletedByDigest: Map<string, string>;
  createdByDigest: Map<string, string>;
  at: string;
}

export function hashUtf8File(absolutePath: string): { sha256: string; byteSize: number } {
  const bytes = fs.readFileSync(absolutePath);
  return {
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    byteSize: bytes.byteLength,
  };
}

export interface DeclaredLocaleDigest {
  locale: string;
  declared: string | null;
  actual: string | null;
}

/** Tolerant manifest digest snapshot used for neighborhood revalidation. */
export function readManifestDeclaredDigests(
  manifestAbsolutePath: string,
): { parsed: boolean; declared: DeclaredLocaleDigest[] } {
  let raw: string;
  try {
    raw = fs.readFileSync(manifestAbsolutePath, "utf8");
  } catch {
    return { parsed: false, declared: [] };
  }
  let manifest: { locales?: Record<string, { sha256?: string }> };
  try {
    manifest = JSON.parse(raw) as { locales?: Record<string, { sha256?: string }> };
  } catch {
    return { parsed: false, declared: [] };
  }
  const declared: DeclaredLocaleDigest[] = [];
  for (const [locale, entry] of Object.entries(manifest.locales ?? {})) {
    const localeFilePath = path.join(path.dirname(manifestAbsolutePath), `${locale}.md`);
    let actual: string | null = null;
    try {
      actual = hashUtf8File(localeFilePath).sha256;
    } catch {
      actual = null;
    }
    declared.push({ locale, declared: entry?.sha256 ?? null, actual });
  }
  return { parsed: true, declared };
}

function rootByRootKey(rootKey: string) {
  return CONTENT_SOURCE_ROOTS.find((item) => item.rootKey === rootKey);
}

/** Repository-relative entity directory including the watched root prefix. */
function repositoryEntityDir(classification: ContentSourcePathClassification): string {
  const root = rootByRootKey(classification.rootKey);
  if (!root) {
    throw new Error(`CONTENT_SOURCE_ROOT_UNKNOWN: ${classification.rootKey}`);
  }
  return `${root.relRoot}/${classification.entityDir}`;
}

interface EmittedEventInput {
  relPath: string;
  rootKey: string;
  entityKind: "plant" | "pest_disease";
  entityDir: string;
  locale: string | null;
  owningManifestPath: string | null;
  eventType: "created" | "modified" | "deleted" | "manifest_changed";
  oldSha256: string | null;
  newSha256: string | null;
  oldByteSize: number | null;
  newByteSize: number | null;
  evidenceRevision: number;
  findings?: Record<string, unknown>;
}

function emitEvent(context: ScanContext, input: EmittedEventInput): string {
  const result = recordContentChangeEvent(
    context.db,
    {
      path: input.relPath,
      rootKey: input.rootKey,
      entityKind: input.entityKind,
      entityKey: input.entityDir.split("/").pop() ?? null,
      locale: input.locale,
      owningManifestPath: input.owningManifestPath,
      eventType: input.eventType,
      oldSha256: input.oldSha256,
      newSha256: input.newSha256,
      oldByteSize: input.oldByteSize,
      newByteSize: input.newByteSize,
      detectorSource: context.detectorSource,
      evidenceRevision: input.evidenceRevision,
      findings: input.findings ?? {},
    },
    { supersedePriorForPath: true, at: context.at },
  );
  context.counts.eventsProduced += 1;

  // Rename evidence is delete + create; pair on exact digest within one run
  // regardless of which side is discovered first.
  const tryPair = (
    deletedEventId: string,
    createdEventId: string,
    digest: string,
  ): boolean => {
    try {
      correlateRenameEvents(context.db, deletedEventId, createdEventId);
      context.deletedByDigest.delete(digest);
      context.createdByDigest.delete(digest);
      return true;
    } catch {
      // Pairing is best-effort; both events remain durable regardless.
      return false;
    }
  };

  if (input.eventType === "deleted" && input.oldSha256) {
    const pairedCreated = context.createdByDigest.get(input.oldSha256);
    if (!pairedCreated || !tryPair(result.eventId, pairedCreated, input.oldSha256)) {
      context.deletedByDigest.set(input.oldSha256, result.eventId);
    }
  } else if (input.eventType === "created" && input.newSha256) {
    const pairedDeleted = context.deletedByDigest.get(input.newSha256);
    if (!pairedDeleted || !tryPair(pairedDeleted, result.eventId, input.newSha256)) {
      context.createdByDigest.set(input.newSha256, result.eventId);
    }
  }
  return result.eventId;
}

function observationFromClassification(
  relPath: string,
  classification: ContentSourcePathClassification,
  stat: fs.Stats,
  overrides: Partial<{
    sha256: string | null;
    byteSize: number;
    ownerStatus: ContentOwnerStatus | null;
    validationSummary: Record<string, unknown>;
  }> = {},
) {
  return {
    path: relPath,
    rootKey: classification.rootKey,
    entityKind: classification.entityKind,
    entityKey: classification.entityDir,
    locale: classification.locale,
    fileKind: classification.fileKind,
    owningManifestPath: `${repositoryEntityDir(classification)}/content.json`,
    observedMtimeMs: Math.round(stat.mtimeMs),
    byteSize: overrides.byteSize ?? stat.size,
    sha256: overrides.sha256 ?? null,
    contentVersion: null,
    ownerStatus: overrides.ownerStatus ?? null,
    validationSummary: overrides.validationSummary,
  };
}

function handleUnreadable(context: ScanContext, relPath: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  context.errors.push(`${relPath}: ${message}`);
  context.counts.quarantined += 1;
  const prior = getSourceFile(context.db, relPath);
  if (prior) {
    markSourceFileState(context.db, relPath, "unreadable", message);
  }
  quarantinePath(context.db, relPath, "UNREADABLE", message, {
    nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
    at: context.at,
  });
}


/** Exclusive upper bound covering every path under `${directory}/`. */
function shardUpperBound(directory: string): string {
  const last = directory.charAt(directory.length - 1);
  return directory.slice(0, -1) + String.fromCharCode(last.charCodeAt(0) + 1);
}

function observeFile(context: ScanContext, relPath: string): void {
  const classification = classifyRelativeContentPath(relPath, context.classifyOptions);
  if (!classification) {
    return;
  }
  context.counts.pathsInspected += 1;

  const absolutePath = path.join(context.repositoryRoot, relPath);
  const owningManifestRelative = `${repositoryEntityDir(classification)}/content.json`;
  const owningManifestAbsolute = path.join(context.repositoryRoot, owningManifestRelative);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch (error) {
    handleUnreadable(context, relPath, error);
    return;
  }

  const prior = getSourceFile(context.db, relPath);
  const manifestExists = fs.existsSync(owningManifestAbsolute);
  const expectedOwnerStatus: ContentOwnerStatus =
    classification.fileKind === "markdown"
      ? manifestExists
        ? "manifest_ok"
        : "missing_manifest"
      : "manifest_ok";
  // The one-time baseline uses a distinct legacy status. Treat it as
  // equivalent to missing_manifest while the manifest is still absent so a
  // normal reconcile does not turn every legacy row into a fresh event.
  const ownerStatusMatches =
    prior !== null &&
    (prior.owner_status === expectedOwnerStatus ||
      (classification.fileKind === "markdown" &&
        !manifestExists &&
        prior.owner_status === "legacy_missing_manifest"));
  const metadataEqual =
    prior !== null &&
    prior.deleted_at === null &&
    prior.observed_mtime_ms === Math.round(stat.mtimeMs) &&
    prior.byte_size === stat.size &&
    ownerStatusMatches;

  if (metadataEqual && prior) {
    context.counts.metadataComparisons += 1;
    upsertSourceFile(
      context.db,
      observationFromClassification(relPath, classification, stat, {
        sha256: prior.sha256,
        ownerStatus: prior.owner_status,
      }),
      { at: context.at },
    );
    return;
  }

  let digest: { sha256: string; byteSize: number };
  try {
    digest = hashUtf8File(absolutePath);
  } catch (error) {
    handleUnreadable(context, relPath, error);
    return;
  }
  context.counts.filesHashed += 1;

  const manifestless = classification.fileKind === "markdown" && !manifestExists;

  const findings: Record<string, unknown> = {};
  if (classification.fileKind === "markdown" && manifestExists) {
    const declared = readManifestDeclaredDigests(owningManifestAbsolute);
    const own = declared.declared.find((item) => item.locale === classification.locale);
    if (own?.declared && own.declared !== digest.sha256) {
      findings["CONTENT_SOURCE_MANIFEST_DIGEST_MISMATCH"] = {
        severity: "warning",
        locale: classification.locale,
        declared: own.declared,
        actual: digest.sha256,
      };
    }
  }

  const ownerStatus = expectedOwnerStatus;
  if (manifestless) {
    findings["OWNER_STATUS_MISSING_MANIFEST"] = {
      severity: "blocked",
      owner_status: ownerStatus,
    };
  }

  const result = upsertSourceFile(
    context.db,
    observationFromClassification(relPath, classification, stat, {
      sha256: digest.sha256,
      byteSize: digest.byteSize,
      ownerStatus,
      validationSummary: findings,
    }),
    { at: context.at, hashedAt: context.at },
  );

  if (!result.changed) {
    return;
  }
  if (manifestless && result.state === "new") {
    // Manifestless discoveries are unapplyable by contract, not pending new.
    context.db
      .prepare(`UPDATE content_source_files SET state = 'invalid' WHERE id = ?`)
      .run(result.fileId);
  }

  const bindingOnlyGained =
    prior !== null &&
    prior.deleted_at === null &&
    prior.sha256 === digest.sha256 &&
    ownerStatus === "manifest_ok" &&
    prior.owner_status !== "manifest_ok";
  if (bindingOnlyGained) {
    // The manifest event is the authoritative review item for its complete
    // neighborhood. Do not create a duplicate Markdown event merely because
    // the file moved from legacy/blocked ownership to a valid manifest.
    const manifestEvent = getLatestChangeEventForPath(
      context.db,
      owningManifestRelative,
      { reviewStates: ["pending", "blocked", "approved", "applied"] },
    );
    if (manifestEvent) {
      supersedePendingManifestlessEvents(
        context.db,
        owningManifestRelative,
        manifestEvent.event_id,
      );
    }
    return;
  }

  // Baseline-marked rows are indexed by sealLegacyBaseline, never here.
  const eventType =
    classification.fileKind === "manifest"
      ? prior && prior.sha256 !== digest.sha256
        ? "manifest_changed"
        : "created"
      : prior && prior.deleted_at === null
        ? "modified"
        : "created";

  const eventId = emitEvent(context, {
    relPath,
    rootKey: classification.rootKey,
    entityKind: classification.entityKind,
    entityDir: classification.entityDir,
    locale: classification.locale,
    owningManifestPath: owningManifestRelative,
    eventType,
    oldSha256: prior?.sha256 ?? null,
    newSha256: digest.sha256,
    oldByteSize: prior?.byte_size ?? null,
    newByteSize: digest.byteSize,
    evidenceRevision: result.evidenceRevision,
    findings: Object.keys(findings).length > 0 ? findings : undefined,
  });
  if (classification.fileKind === "manifest") {
    supersedePendingManifestlessEvents(context.db, relPath, eventId);
  }
}

function processVanishedPath(context: ScanContext, relPath: string): void {
  const prior = getSourceFile(context.db, relPath);
  if (!prior || prior.deleted_at !== null) {
    return;
  }
  const result = markSourceFileDeleted(context.db, relPath, {
    at: context.at,
    sha256: prior.sha256,
  });
  if (!result) {
    return;
  }
  const classification = classifyRelativeContentPath(relPath, context.classifyOptions);
  if (!classification) {
    return;
  }
  emitEvent(context, {
    relPath,
    rootKey: classification.rootKey,
    entityKind: classification.entityKind,
    entityDir: classification.entityDir,
    locale: classification.locale,
    owningManifestPath: prior.owning_manifest_path,
    eventType: "deleted",
    oldSha256: prior.sha256,
    newSha256: null,
    oldByteSize: prior.byte_size,
    newByteSize: null,
    evidenceRevision: result.evidenceRevision,
  });
  context.counts.deletionsDetected += 1;
}

function createContext(
  deps: { db: SqliteDatabase; repositoryRoot: string; requiredLocales?: readonly string[] },
  detectorSource: ContentDetectorSource,
): ScanContext {
  return {
    db: deps.db,
    repositoryRoot: path.resolve(deps.repositoryRoot),
    classifyOptions: { requiredLocales: deps.requiredLocales },
    counts: {
      pathsInspected: 0,
      metadataComparisons: 0,
      filesHashed: 0,
      eventsProduced: 0,
      deletionsDetected: 0,
      quarantined: 0,
    },
    errors: [],
    detectorSource,
    deletedByDigest: new Map(),
    createdByDigest: new Map(),
    at: nowIso(),
  };
}

/**
 * Single watched-path entry point shared by the live watcher and scans: one
 * Markdown change processes only its file and its manifest neighborhood.
 */
export function processCandidatePath(
  deps: {
    db: SqliteDatabase;
    repositoryRoot: string;
    requiredLocales?: readonly string[];
  },
  absoluteOrRelativePath: string,
  options: { detectorSource?: ContentDetectorSource } = {},
): { processed: boolean; relPath: string | null; neighborhood: string[] } {
  const context = createContext(deps, options.detectorSource ?? "watcher");
  let relPath: string;
  try {
    relPath = normalizeRepositoryRelativePath(
      deps.repositoryRoot,
      path.isAbsolute(absoluteOrRelativePath)
        ? absoluteOrRelativePath
        : path.join(deps.repositoryRoot, absoluteOrRelativePath),
    );
  } catch {
    return { processed: false, relPath: null, neighborhood: [] };
  }
  const classification = classifyRelativeContentPath(relPath, context.classifyOptions);
  if (!classification) {
    return { processed: false, relPath, neighborhood: [] };
  }

  const entityDirFull = repositoryEntityDir(classification);
  const neighborhood: string[] = [relPath];
  const manifestRelative = `${entityDirFull}/content.json`;
  if (classification.fileKind === "markdown") {
    neighborhood.push(manifestRelative);
  } else {
    const dirAbsolute = path.join(deps.repositoryRoot, entityDirFull);
    try {
      for (const entry of fs.readdirSync(dirAbsolute).sort()) {
        const candidateRel = `${entityDirFull}/${entry}`;
        const candidateClass = classifyRelativeContentPath(candidateRel, context.classifyOptions);
        if (candidateClass) {
          neighborhood.push(candidateRel);
        }
      }
    } catch {
      // Directory vanished; the vanished-path pass records the deletion.
    }
  }

  for (const candidate of [...new Set(neighborhood)].sort()) {
    if (!fs.existsSync(path.join(deps.repositoryRoot, candidate))) {
      processVanishedPath(context, candidate);
      continue;
    }
    observeFile(context, candidate);
  }
  bumpContentSourceRevision(deps.db);

  return { processed: true, relPath, neighborhood: [...new Set(neighborhood)].sort() };
}

/**
 * Bounded per-root reconciliation. Each entity directory is an independent
 * shard: clean shards commit and advance their checkpoints even when other
 * shards fail and quarantine.
 */
export function scanContentRoot(
  deps: {
    db: SqliteDatabase;
    repositoryRoot: string;
    rootKey: string;
    requiredLocales?: readonly string[];
    detectorSource: ContentDetectorSource;
  },
  options: { mode: "startup_catchup" | "periodic_reconcile"; runId?: string },
): ScanResult {
  const root = rootByRootKey(deps.rootKey);
  if (!root) {
    throw new Error(`CONTENT_SOURCE_ROOT_UNKNOWN: ${deps.rootKey}`);
  }
  const runId = options.runId ?? crypto.randomUUID();
  const context = createContext(deps, deps.detectorSource);
  startMonitorRun(deps.db, { runId, detectorMode: options.mode });
  const scanStartedAtMs = Date.now();
  logDetector({ event: "scan_start", runId, mode: options.mode, rootKey: deps.rootKey });

  const rootAbsolute = path.join(context.repositoryRoot, root.relRoot);
  let directories: string[] = [];
  if (fs.existsSync(rootAbsolute)) {
    try {
      directories = fs
        .readdirSync(rootAbsolute, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      context.errors.push(`${root.relRoot}: ${String(error)}`);
    }
  } else {
    context.errors.push(`${root.relRoot}: missing`);
  }

  // All shard writes ride ONE outer transaction (a single fsync for the whole
  // root) with a savepoint per shard: a failing shard rolls back only its own
  // writes while previously processed shards still commit atomically. Without
  // this, per-row autocommit turns a 50k-file reconcile into ~150s of
  // journal fsyncs (measured in MCD-7).
  context.db.transaction(() => {
    for (const directory of directories) {
      const shardRelDir = `${root.relRoot}/${directory}`;
      const shardPrefix = `${shardRelDir}/`;
      try {
        const processShard = context.db.transaction(() => {
          const entries = fs.readdirSync(path.join(context.repositoryRoot, shardRelDir));
          const seenPaths = new Set<string>();
          for (const entry of entries.sort()) {
            const relPath = `${shardPrefix}${entry}`;
            if (!classifyRelativeContentPath(relPath, context.classifyOptions)) {
              continue;
            }
            seenPaths.add(relPath);
            observeFile(context, relPath);
          }
          // Range bounds let SQLite use the unique path index; a LIKE '%'
          // prefix filter cannot (case-insensitive LIKE defeats BINARY
          // indexes) and degenerated into a full table scan PER SHARD,
          // which dominated a 25k-shard reconcile (measured MCD-7).
          const indexedRows = context.db
            .prepare(
              `SELECT path FROM content_source_files
               WHERE path >= ? AND path < ? AND deleted_at IS NULL`,
            )
            .all(shardPrefix, shardUpperBound(shardRelDir)) as Array<{ path: string }>;
          for (const row of indexedRows) {
            if (!seenPaths.has(row.path)) {
              processVanishedPath(context, row.path);
            }
          }
          setCheckpoint(deps.db, root.rootKey, shardRelDir, "metadata", context.at, 0, {
            at: context.at,
          });
        });
        processShard();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.errors.push(`${shardRelDir}: ${message}`);
        quarantinePath(deps.db, shardRelDir, "SHARD_SCAN_FAILED", message, {
          nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
          at: context.at,
        });
      }
    }

    // Vanished-shard sweep rides the same outer transaction.
    const directorySet = new Set(directories);
    const survivingRows = context.db
      .prepare(
        `SELECT path FROM content_source_files WHERE root_key = ? AND deleted_at IS NULL`,
      )
      .all(root.rootKey) as Array<{ path: string }>;
    for (const row of survivingRows) {
      const relativeToRoot = path.posix.relative(root.relRoot, row.path);
      if (relativeToRoot.startsWith("..")) {
        continue;
      }
      const directoryPart = path.posix.dirname(relativeToRoot);
      if (
        !directorySet.has(directoryPart) &&
        !fs.existsSync(path.join(context.repositoryRoot, root.relRoot, directoryPart))
      ) {
        processVanishedPath(context, row.path);
      }
    }
  })();

  applyCaseFoldCollisionGuard(context, root);

  const complete = context.errors.length === 0;
  if (complete) {
    setCheckpoint(deps.db, root.rootKey, "", "metadata", context.at, 0, { at: context.at });
  }
  finishMonitorRun(deps.db, runId, {
    status: complete ? "complete" : "incomplete",
    complete,
    error: complete ? null : context.errors.join("; "),
    pathsInspected: context.counts.pathsInspected,
    metadataComparisons: context.counts.metadataComparisons,
    filesHashed: context.counts.filesHashed,
    eventsProduced: context.counts.eventsProduced,
  });
  logDetector({
    event: "scan_complete",
    runId,
    mode: options.mode,
    rootKey: deps.rootKey,
    durationMs: Date.now() - scanStartedAtMs,
    ...context.counts,
    complete,
  });

  return {
    runId,
    mode: options.mode,
    complete,
    counts: context.counts,
    errors: context.errors,
  };
}

/**
 * Case-folded collision guard over the persisted index: colliding contract
 * paths are marked invalid and blocked; each newly-invalid path gets one
 * blocking event so the inbox surfaces the conflict.
 */
function applyCaseFoldCollisionGuard(context: ScanContext, root: { rootKey: string; relRoot: string }): void {
  const collisions = findIndexedCaseFoldCollisions(context.db);
  const rootPrefix = `${root.relRoot}/`;
  for (const paths of collisions.values()) {
    const relevant = paths.filter((relPath) => relPath.startsWith(rootPrefix));
    if (relevant.length < 2) {
      continue;
    }
    for (const relPath of relevant) {
      const prior = getSourceFile(context.db, relPath);
      if (prior?.state === "invalid") {
        continue;
      }
      if (prior) {
        markSourceFileState(context.db, relPath, "invalid", "CASEFOLD_COLLISION");
      }
      const classification = classifyRelativeContentPath(relPath, context.classifyOptions);
      emitEvent(context, {
        relPath,
        rootKey: root.rootKey,
        entityKind: root.rootKey === "plants" ? "plant" : "pest_disease",
        entityDir: classification?.entityDir ?? path.dirname(relPath),
        locale: classification?.locale ?? null,
        owningManifestPath: null,
        eventType: "modified",
        oldSha256: prior?.sha256 ?? null,
        newSha256: prior?.sha256 ?? null,
        oldByteSize: prior?.byte_size ?? null,
        newByteSize: prior?.byte_size ?? null,
        evidenceRevision: prior?.evidence_revision ?? 0,
        findings: {
          CASEFOLD_COLLISION: { severity: "blocked", paths: [...relevant].sort() },
        },
      });
    }
  }
}

/**
 * Startup catch-up recovers every change made while the process was stopped
 * (manual edits, git pull/checkout bursts) before health may report current.
 */
export function runStartupCatchUp(
  deps: { db: SqliteDatabase; repositoryRoot: string; requiredLocales?: readonly string[] },
  options: { runId?: string } = {},
): ScanResult[] {
  return CONTENT_SOURCE_ROOTS.map((root) =>
    scanContentRoot(
      { ...deps, rootKey: root.rootKey, detectorSource: "startup_catchup" },
      { mode: "startup_catchup", runId: options.runId },
    ),
  );
}

/**
 * One-time explicitly-marked baseline. Pre-existing manifestless Markdown is
 * indexed invalid without any inbox events; manifest-bound files land clean.
 * The baseline checkpoint seals atomically per root.
 */
export function runLegacyBaseline(
  deps: { db: SqliteDatabase; repositoryRoot: string; requiredLocales?: readonly string[] },
  options: { runId?: string; sealedAt?: string } = {},
): ScanResult[] {
  const results: ScanResult[] = [];
  const runId = options.runId ?? crypto.randomUUID();
  startMonitorRun(deps.db, { runId, detectorMode: "baseline" });
  let aggregateComplete = true;

  for (const root of CONTENT_SOURCE_ROOTS) {
    if (isBaselineSealed(deps.db, root.rootKey)) {
      continue;
    }
    const context = createContext(deps, "startup_catchup");
    const rootAbsolute = path.join(context.repositoryRoot, root.relRoot);
    try {
      const files: Parameters<typeof sealLegacyBaseline>[1]["files"] = [];
      const directories = fs
        .readdirSync(rootAbsolute, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      for (const directory of directories) {
        const shardRelDir = `${root.relRoot}/${directory}`;
        for (const entry of fs.readdirSync(path.join(context.repositoryRoot, shardRelDir)).sort()) {
          const relPath = `${shardRelDir}/${entry}`;
          const classification = classifyRelativeContentPath(relPath, context.classifyOptions);
          if (!classification) {
            continue;
          }
          const absolutePath = path.join(context.repositoryRoot, relPath);
          let stat: fs.Stats;
          let digest: { sha256: string; byteSize: number };
          try {
            stat = fs.statSync(absolutePath);
            digest = hashUtf8File(absolutePath);
          } catch {
            context.counts.quarantined += 1;
            quarantinePath(context.db, relPath, "BASELINE_UNREADABLE", undefined, {
              nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
              at: context.at,
            });
            continue;
          }
          const manifestless =
            classification.fileKind === "markdown" &&
            !fs.existsSync(
              path.join(context.repositoryRoot, `${repositoryEntityDir(classification)}/content.json`),
            );
          files.push({
            path: relPath,
            rootKey: root.rootKey,
            entityKind: root.entityKind,
            entityKey: classification.entityDir,
            locale: classification.locale,
            fileKind: classification.fileKind,
            owningManifestPath: `${repositoryEntityDir(classification)}/content.json`,
            observedMtimeMs: Math.round(stat.mtimeMs),
            byteSize: digest.byteSize,
            sha256: digest.sha256,
            manifestless,
          });
        }
      }
      sealLegacyBaseline(deps.db, {
        rootKey: root.rootKey,
        sealedAt: options.sealedAt,
        files,
      });
      context.counts.pathsInspected += files.length;
    } catch (error) {
      aggregateComplete = false;
      context.errors.push(error instanceof Error ? error.message : String(error));
    }
    results.push({
      runId: `${runId}:${root.rootKey}`,
      mode: "baseline",
      complete: context.errors.length === 0,
      counts: context.counts,
      errors: context.errors,
    });
  }

  finishMonitorRun(deps.db, runId, {
    status: aggregateComplete ? "complete" : "incomplete",
    complete: aggregateComplete,
    eventsProduced: 0,
  });
  if (results.length === 0) {
    results.push({
      runId,
      mode: "baseline",
      complete: true,
      counts: {
        pathsInspected: 0,
        metadataComparisons: 0,
        filesHashed: 0,
        eventsProduced: 0,
        deletionsDetected: 0,
        quarantined: 0,
      },
      errors: [],
    });
  }
  return results;
}

export interface FullHashAuditWindowResult {
  processed: number;
  filesHashed: number;
  mismatches: number;
  quarantined: number;
  cycleComplete: boolean;
  stoppedForBudget: boolean;
  cursorByRoot: Record<string, string>;
}

/**
 * Budgeted, resumable full-hash audit window. Metadata accelerators are
 * ignored: every visited file is re-hashed from disk. The cursor persists per
 * root so a restart continues exactly where the previous window stopped.
 */
export function runFullHashAuditWindow(
  deps: {
    db: SqliteDatabase;
    repositoryRoot: string;
    requiredLocales?: readonly string[];
  },
  options: {
    budget: { windowDurationMs: number; maxFilesPerWindow: number };
    nowMs?: number;
    runId?: string;
  },
): FullHashAuditWindowResult {
  const startedAt = options.nowMs ?? Date.now();
  const runId = options.runId ?? crypto.randomUUID();
  startMonitorRun(deps.db, { runId, detectorMode: "full_hash_audit" });
  logDetector({
    event: "audit_window_start",
    runId,
    maxFilesPerWindow: options.budget.maxFilesPerWindow,
    windowDurationMs: options.budget.windowDurationMs,
  });
  const result: FullHashAuditWindowResult = {
    processed: 0,
    filesHashed: 0,
    mismatches: 0,
    quarantined: 0,
    cycleComplete: false,
    stoppedForBudget: false,
    cursorByRoot: {},
  };

  let remaining = options.budget.maxFilesPerWindow;
  // A cycle only counts as complete when it wrapped every root AND no file
  // in the cycle (this window or an earlier window of the same cycle) was
  // unreadable. The per-root marker persists across windows until a clean
  // wrap clears it.
  let cycleClean = true;
  const CYCLE_ERROR_SHARD = "@cycle_errors";
  for (const root of CONTENT_SOURCE_ROOTS) {
    let cursor =
      getCheckpoint(deps.db, root.rootKey, "", "full_hash")?.checkpoint_value ?? "";
    while (remaining > 0) {
      const rows = deps.db
        .prepare(
          `SELECT path FROM content_source_files
           WHERE root_key = ? AND deleted_at IS NULL AND path > ?
           ORDER BY path ASC LIMIT ?`,
        )
        .all(root.rootKey, cursor, Math.min(remaining, 500)) as Array<{ path: string }>;
      if (rows.length === 0) {
        // This root finished a full cycle: reset its cursor so the next
        // window starts over, without losing the reported last-processed path.
        setCheckpoint(deps.db, root.rootKey, "", "full_hash", "", 0);
        const marker = getCheckpoint(deps.db, root.rootKey, CYCLE_ERROR_SHARD, "full_hash");
        if (marker && marker.checkpoint_value !== "") {
          cycleClean = false;
        }
        setCheckpoint(deps.db, root.rootKey, CYCLE_ERROR_SHARD, "full_hash", "", 0);
        break;
      }
      for (const row of rows) {
        cursor = row.path;
        result.processed += 1;
        remaining -= 1;

        let digest: { sha256: string; byteSize: number };
        try {
          digest = hashUtf8File(path.join(path.resolve(deps.repositoryRoot), row.path));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result.quarantined += 1;
          cycleClean = false;
          quarantinePath(deps.db, row.path, "FULL_HASH_UNREADABLE", message, {
            nextRetryAt: new Date(startedAt + 60_000).toISOString(),
          });
          setCheckpoint(
            deps.db,
            root.rootKey,
            CYCLE_ERROR_SHARD,
            "full_hash",
            `UNREADABLE:${row.path}`,
            0,
          );
          continue;
        }
        result.filesHashed += 1;
        const prior = getSourceFile(deps.db, row.path);
        if (prior && prior.sha256 !== digest.sha256) {
          result.mismatches += 1;
          const updated = upsertSourceFile(deps.db, {
            path: row.path,
            rootKey: prior.root_key,
            entityKind: prior.entity_kind as "plant" | "pest_disease",
            entityKey: prior.entity_key,
            locale: prior.locale,
            fileKind: prior.file_kind as "manifest" | "markdown",
            owningManifestPath: prior.owning_manifest_path,
            observedMtimeMs: prior.observed_mtime_ms,
            byteSize: digest.byteSize,
            sha256: digest.sha256,
            ownerStatus: prior.owner_status,
          });
          recordContentChangeEvent(
            deps.db,
            {
              path: row.path,
              rootKey: prior.root_key,
              entityKind: prior.entity_kind as "plant" | "pest_disease",
              entityKey: prior.entity_key,
              locale: prior.locale,
              owningManifestPath: prior.owning_manifest_path,
              eventType: "modified",
              oldSha256: prior.sha256,
              newSha256: digest.sha256,
              oldByteSize: prior.byte_size,
              newByteSize: digest.byteSize,
              detectorSource: "periodic_reconcile",
              evidenceRevision: updated.evidenceRevision,
              findings: { FULL_HASH_MISMATCH_DETECTED: { severity: "warning" } },
            },
            { supersedePriorForPath: true },
          );
        } else if (prior) {
          deps.db
            .prepare(`UPDATE content_source_files SET last_hashed_at = ? WHERE id = ?`)
            .run(nowIso(), prior.id);
          // A readable hash closes the earlier failure for this path.
          const entry = getQuarantineEntry(deps.db, row.path);
          if (entry && entry.resolved_at === null) {
            resolveQuarantine(deps.db, row.path, nowIso());
          }
        }

        if (Date.now() - startedAt >= options.budget.windowDurationMs) {
          result.stoppedForBudget = true;
          break;
        }
      }
      setCheckpoint(deps.db, root.rootKey, "", "full_hash", cursor, 0);
      if (result.stoppedForBudget) {
        break;
      }
      if (remaining <= 0) {
        result.stoppedForBudget = true;
        break;
      }
    }
    result.cursorByRoot[root.rootKey] = cursor;
    if (result.stoppedForBudget) {
      break;
    }
  }

  result.cycleComplete = !result.stoppedForBudget && cycleClean;
  finishMonitorRun(deps.db, runId, {
    status: result.cycleComplete ? "complete" : "incomplete",
    complete: result.cycleComplete,
    filesHashed: result.filesHashed,
    eventsProduced: result.mismatches,
  });
  logDetector({
    event: "audit_window_done",
    runId,
    durationMs: Date.now() - startedAt,
    processed: result.processed,
    filesHashed: result.filesHashed,
    mismatches: result.mismatches,
    quarantined: result.quarantined,
    cycleComplete: result.cycleComplete,
    stoppedForBudget: result.stoppedForBudget,
  });
  return result;
}

export function getLastCompleteFullHashAuditAt(db: SqliteDatabase): string | null {
  const row = db
    .prepare(
      `SELECT finished_at FROM content_source_monitor_runs
       WHERE detector_mode = 'full_hash_audit' AND status = 'complete'
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get() as { finished_at: string | null } | undefined;
  return row?.finished_at ?? null;
}
