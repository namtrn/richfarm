import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { SqliteDatabase } from "../db";
import {
  applyContentImport,
  dryRunContentImport,
  type ContentFinding,
  type PestDiseaseCatalogEntry,
} from "../content-manifests";
import { buildMasterPlantPayload, fetchI18n, withSourceIdentity } from "../master-plants";
import { enqueueSyncOutbox } from "../sync-outbox";
import { CONTENT_SOURCE_ROOTS } from "./contract";
import { classifyRelativeContentPath, type ContentSourcePathClassification } from "./paths";
import {
  bumpContentSourceRevision,
  createReviewProposal,
  getChangeEvent,
  getReviewProposal,
  getSourceFile,
  listChangeEvents,
  transitionChangeEventReviewState,
  transitionReviewProposalStatus,
  upsertSourceFile,
  verifyProposalScopeEvidence,
  type ChangeEventRow,
} from "./repository";
import { hashUtf8File } from "./scanner";

export interface ReviewActor {
  id: string;
  role: "admin" | "editor";
}

export type { ChangeEventRow };

function repositoryEntityDir(rootKey: string, entityDir: string): string {
  const root = CONTENT_SOURCE_ROOTS.find((item) => item.rootKey === rootKey);
  if (!root) {
    throw new Error(`CONTENT_SOURCE_ROOT_UNKNOWN: ${rootKey}`);
  }
  return `${root.relRoot}/${entityDir}`;
}

function manifestLocalesFromDisk(manifestAbsolutePath: string): string[] {
  try {
    const raw = JSON.parse(fs.readFileSync(manifestAbsolutePath, "utf8")) as {
      locales?: Record<string, unknown>;
    };
    return Object.keys(raw.locales ?? {}).sort();
  } catch {
    return [];
  }
}

/**
 * Approval scope = the event path plus its full manifest neighborhood
 * (owning manifest and every locale it declares), because an apply of one
 * locale rewrites through that manifest.
 */
function scopePathsForEvent(
  repositoryRoot: string,
  event: ChangeEventRow,
  requiredLocales: readonly string[],
): string[] {
  const paths = new Set<string>([event.path]);
  const classification = classifyRelativeContentPath(event.path, { requiredLocales });
  const owningRelative = event.owning_manifest_path;

  if (
    classification?.fileKind === "markdown" &&
    (!owningRelative || !fs.existsSync(path.join(repositoryRoot, owningRelative)))
  ) {
    // Manifestless Markdown cannot be applied; the caller rejects it.
    return [event.path];
  }

  if (owningRelative) {
    paths.add(owningRelative);
    const manifestAbsolute = path.join(repositoryRoot, owningRelative);
    const declared = manifestLocalesFromDisk(manifestAbsolute);
    const locales = declared.length > 0 ? declared : [...requiredLocales];
    const directory = path.posix.dirname(owningRelative);
    for (const locale of locales) {
      paths.add(`${directory}/${locale}.md`);
    }
  }
  return [...paths].sort();
}

function eventIsApprovable(event: ChangeEventRow): { ok: true } | { ok: false; code: string } {
  if (event.review_state !== "pending") {
    return { ok: false, code: `EVENT_NOT_PENDING:${event.review_state}` };
  }
  const findings = JSON.parse(event.findings_json ?? "{}") as Record<string, unknown>;
  if (findings["OWNER_STATUS_MISSING_MANIFEST"]) {
    return { ok: false, code: "EVENT_MISSING_MANIFEST" };
  }
  if (findings["CASEFOLD_COLLISION"]) {
    return { ok: false, code: "EVENT_CASEFOLD_COLLISION" };
  }
  return { ok: true };
}

export interface ApproveOptions {
  eventIds: readonly string[];
  actor: ReviewActor;
  reason: string;
  requiredLocales?: readonly string[];
}

export interface ApproveItemResult {
  eventId: string;
  ok: boolean;
  code?: string;
}

export interface ApproveResult {
  proposalId: string | null;
  approved: ApproveItemResult[];
  failures: ApproveItemResult[];
}

/**
 * Batch approval. Every item is validated independently; valid items share
 * one proposal whose scoped watermark covers exactly the manifest
 * neighborhoods of the approved events. Invalid items are reported
 * individually and never block the others.
 */
export function approveEvents(
  db: SqliteDatabase,
  repositoryRoot: string,
  options: ApproveOptions,
): ApproveResult {
  const failures: ApproveItemResult[] = [];
  const validated: Array<{ eventId: string; scope: string[] }> = [];

  for (const eventId of options.eventIds) {
    const event = getChangeEvent(db, eventId);
    if (!event) {
      failures.push({ eventId, ok: false, code: "EVENT_NOT_FOUND" });
      continue;
    }
    const check = eventIsApprovable(event);
    if (!check.ok) {
      failures.push({ eventId, ok: false, code: check.code });
      continue;
    }
    const indexRow = getSourceFile(db, event.path);
    if (!indexRow || !indexRow.sha256 || indexRow.deleted_at !== null) {
      failures.push({ eventId, ok: false, code: "SCOPE_DIGEST_UNAVAILABLE" });
      continue;
    }
    const scope = scopePathsForEvent(repositoryRoot, event, options.requiredLocales ?? []);
    let scopeBroken: string | null = null;
    for (const scopePath of scope) {
      const row = getSourceFile(db, scopePath);
      if (!row || !row.sha256 || row.deleted_at !== null) {
        scopeBroken = scopePath;
        break;
      }
    }
    if (scopeBroken) {
      failures.push({
        eventId,
        ok: false,
        code: `SCOPE_PATH_MISSING:${scopeBroken}`,
      });
      continue;
    }
    validated.push({ eventId, scope });
  }

  if (validated.length === 0) {
    return { proposalId: null, approved: [], failures };
  }

  const digests: Record<string, string> = {};
  let maxRevision = 0;
  for (const { scope } of validated) {
    for (const scopePath of scope) {
      if (digests[scopePath]) continue;
      const row = getSourceFile(db, scopePath) as { sha256: string; evidence_revision: number };
      digests[scopePath] = row.sha256;
      maxRevision = Math.max(maxRevision, row.evidence_revision);
    }
  }

  const proposalId = crypto.randomUUID();
  createReviewProposal(db, {
    proposalId,
    scopeDefinition: {
      kind: "review-events",
      eventIds: validated.map((item) => item.eventId),
    },
    scopeCardinality: Object.keys(digests).length,
    scopePaths: Object.keys(digests),
    scopeMaxEvidenceRevision: maxRevision,
    scopeDigests: digests,
    createdBy: options.actor.id,
  });
  transitionReviewProposalStatus(db, proposalId, "ready");

  const approved: ApproveItemResult[] = [];
  for (const { eventId } of validated) {
    transitionChangeEventReviewState(db, eventId, "approved", {
      reviewerId: options.actor.id,
      reviewerRole: options.actor.role,
      reason: options.reason,
    }, { refs: { proposalId } });
    approved.push({ eventId, ok: true });
  }

  return { proposalId, approved, failures };
}

export interface DismissOptions {
  eventIds: readonly string[];
  actor: ReviewActor;
  reason: string;
}

export interface DismissResult {
  dismissed: ApproveItemResult[];
  failures: ApproveItemResult[];
}

export function dismissEvents(db: SqliteDatabase, options: DismissOptions): DismissResult {
  const dismissed: ApproveItemResult[] = [];
  const failures: ApproveItemResult[] = [];
  for (const eventId of options.eventIds) {
    const event = getChangeEvent(db, eventId);
    if (!event) {
      failures.push({ eventId, ok: false, code: "EVENT_NOT_FOUND" });
      continue;
    }
    if (event.review_state !== "pending" && event.review_state !== "blocked") {
      failures.push({ eventId, ok: false, code: `EVENT_NOT_DISMISSIBLE:${event.review_state}` });
      continue;
    }
    transitionChangeEventReviewState(db, eventId, "dismissed", {
      reviewerId: options.actor.id,
      reviewerRole: options.actor.role,
      reason: options.reason,
    });
    dismissed.push({ eventId, ok: true });
  }
  return { dismissed, failures };
}

export interface ApproveContentLocalesOptions {
  plantIds: readonly number[];
  actor: ReviewActor;
  reason: string;
  now?: Date;
}

export interface ApproveContentLocaleItemResult {
  plantId: number;
  plantCode: string | null;
  ok: boolean;
  code?: string;
  locales: string[];
  outboxId?: number;
}

export interface ApproveContentLocalesResult {
  approved: ApproveContentLocaleItemResult[];
  failures: ApproveContentLocaleItemResult[];
}

/**
 * CAP-2026-08-31 locale-level approval. Promotes every locale of the given
 * plants to published/reviewed with the authenticated reviewer identity and a
 * fresh timestamp, then queues exactly one full-snapshot outbox item per
 * plant (upsert_plant). Stamping and enqueueing share one SQLite transaction
 * per plant, so any failure rolls both back. Care-carrying locales must
 * already carry source_refs provenance before approval is allowed, mirroring
 * the manifest REVIEWED_WITHOUT_PROVENANCE rule.
 */
export function approveContentLocales(
  db: SqliteDatabase,
  options: ApproveContentLocalesOptions,
): ApproveContentLocalesResult {
  const nowIso = (options.now ?? new Date()).toISOString();
  const approved: ApproveContentLocaleItemResult[] = [];
  const failures: ApproveContentLocaleItemResult[] = [];

  for (const plantId of options.plantIds) {
    const plant = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(plantId) as
      | Parameters<typeof buildMasterPlantPayload>[1]
      | undefined;
    const fail = (code: string, locales: string[] = []): void => {
      failures.push({ plantId, plantCode: plant?.plant_code ?? null, ok: false, code, locales });
    };
    if (!plant) {
      fail("PLANT_NOT_FOUND");
      continue;
    }
    const locales = fetchI18n(db, plantId);
    const localeKeys = Object.keys(locales).sort();
    if (localeKeys.length === 0) {
      fail("PLANT_NO_LOCALES");
      continue;
    }
    const withoutProvenance = localeKeys.filter((locale) => {
      const row = locales[locale];
      const careContent =
        typeof row.care_content === "string" && row.care_content.trim() !== ""
          ? row.care_content
          : null;
      if (!careContent) return false;
      return !Array.isArray(row.source_refs) || row.source_refs.length === 0;
    });
    if (withoutProvenance.length > 0) {
      fail(`REVIEWED_WITHOUT_PROVENANCE:${withoutProvenance.join(",")}`);
      continue;
    }
    try {
      // Validate the existing snapshot before changing any release metadata.
      // Besides making malformed legacy rows explicit failures, this keeps a
      // failed approval from repairing/hiding an invalid parent as a side
      // effect of the approval attempt.
      withSourceIdentity(buildMasterPlantPayload(db, plant, locales));
      const outboxId = db.transaction(() => {
        const stampedLocales = db.prepare(`
          UPDATE master_plant_i18n
          SET content_status = 'published', review_status = 'reviewed',
              reviewed_by = ?, reviewed_at = ?, updated_at = datetime('now')
          WHERE master_plant_id = ?
        `).run(options.actor.id, nowIso, plantId);
        if (stampedLocales.changes === 0) throw new Error("CONTENT_APPROVE_NO_LOCALES");
        const stampedPlant = db.prepare(`
          UPDATE master_plants
          SET content_status = 'published', review_status = 'reviewed',
              reviewed_by = ?, reviewed_at = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(options.actor.id, nowIso, plantId);
        if (stampedPlant.changes !== 1) throw new Error("CONTENT_APPROVE_PLANT_UPDATE_FAILED");
        const approvedPlant = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(plantId) as
          Parameters<typeof buildMasterPlantPayload>[1];
        const payload = withSourceIdentity(buildMasterPlantPayload(db, approvedPlant, fetchI18n(db, plantId)));
        const sourceId = String(payload.source_id ?? `sqlite-local-${plantId}`);
        return enqueueSyncOutbox(db, {
          entityType: "master_plant",
          sourceSystem: String(payload.source_system ?? "sqlite"),
          sourceId,
          operation: "upsert_plant",
          payload: payload as unknown as Record<string, unknown>,
        });
      })();
      approved.push({ plantId, plantCode: plant.plant_code, ok: true, locales: localeKeys, outboxId });
    } catch (error) {
      fail(error instanceof Error ? error.message : "CONTENT_APPROVE_FAILED", localeKeys);
    }
  }

  return { approved, failures };
}

export interface EventPreview {
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
}

/**
 * Readable preview for the inbox: incoming Git bytes versus what is staged in
 * SQLite right now (the actual replacement target of an apply). Old Git bytes
 * are intentionally not retained in the journal; evidence is hash-based.
 */
export function buildEventPreview(
  db: SqliteDatabase,
  repositoryRoot: string,
  eventId: string,
): EventPreview {
  const event = getChangeEvent(db, eventId);
  if (!event) {
    throw new Error("CONTENT_CHANGE_EVENT_NOT_FOUND");
  }

  let incomingBytes: number | null = null;
  let incomingExcerpt: string | null = null;
  let currentSha256: string | null = null;
  const absolutePath = path.join(repositoryRoot, event.path);
  const fileExists = fs.existsSync(absolutePath);
  if (fileExists) {
    const bytes = fs.readFileSync(absolutePath);
    incomingBytes = bytes.byteLength;
    currentSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    incomingExcerpt = bytes.toString("utf8").slice(0, 4000);
  }

  let stagedBefore: string | null = null;
  let stagedLocaleExists = false;
  let manifestIdentity: Record<string, unknown> | null = null;
  const manifestRelative = event.owning_manifest_path;
  if (manifestRelative && fs.existsSync(path.join(repositoryRoot, manifestRelative))) {
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(repositoryRoot, manifestRelative), "utf8"),
      ) as Record<string, unknown>;
      manifestIdentity =
        raw.kind === "plant"
          ? {
              kind: "plant",
              plantCode: raw.plant_code,
              canonicalKey: raw.canonical_key,
              scientificName: raw.scientific_name,
            }
          : raw.kind === "pest_disease"
            ? { kind: "pest_disease", key: raw.key, type: raw.type }
            : { kind: "unknown" };
      const plantCode = typeof raw.plant_code === "string" ? raw.plant_code : null;
      if (plantCode && event.locale) {
        const plant = db
          .prepare(`SELECT id FROM master_plants WHERE plant_code = ? LIMIT 1`)
          .get(plantCode) as { id: number } | undefined;
        if (plant) {
          const staged = db
            .prepare(
              `SELECT care_content FROM master_plant_i18n WHERE master_plant_id = ? AND locale = ?`,
            )
            .get(plant.id, event.locale) as { care_content: string | null } | undefined;
          stagedLocaleExists = staged !== undefined;
          stagedBefore = staged?.care_content ?? null;
        }
      }
    } catch {
      manifestIdentity = { kind: "invalid" };
    }
  }

  return {
    eventId: event.event_id,
    eventType: event.event_type,
    reviewState: event.review_state,
    detectorSource: event.detector_source,
    path: event.path,
    entityKind: event.entity_kind,
    entityKey: event.entity_key,
    locale: event.locale,
    oldSha256: event.old_sha256,
    newSha256: event.new_sha256,
    currentSha256,
    fileExists,
    incomingBytes,
    incomingExcerpt,
    stagedBefore,
    stagedLocaleExists,
    owningManifestPath: manifestRelative,
    manifestIdentity,
    findings: JSON.parse(event.findings_json ?? "{}") as Record<string, unknown>,
    correlationGroupId: event.correlation_group_id,
  };
}

export type ApplyRejectionCode =
  | "PROPOSAL_NOT_FOUND"
  | "PROPOSAL_NOT_READY"
  | "NO_APPROVED_EVENTS"
  | "APPROVED_EVENT_SUPERSEDED"
  | "SCOPE_EVIDENCE_CHANGED"
  | "SCOPE_FILE_MISSING"
  | "SCOPE_FILE_CHANGED_ON_DISK"
  | "DRY_RUN_BLOCKED"
  | "IMPORT_REJECTED";

export type ApplyOutcome =
  | {
      status: "rejected";
      code: ApplyRejectionCode;
      detail?: string;
      findings?: ContentFinding[];
      dryRunBlockedPaths?: string[];
      supersededEventIds?: string[];
    }
  | {
      status: "applied";
      proposalId: string;
      updatedLocales: number;
      queuedOutbox: number;
      databaseSha256After: string;
      appliedEventIds: string[];
      scopePaths: string[];
    };

function markProposalStale(db: SqliteDatabase, proposalId: string, reason: string): void {
  const proposal = getReviewProposal(db, proposalId);
  if (!proposal) return;
  if (proposal.status === "ready" || proposal.status === "approved") {
    transitionReviewProposalStatus(db, proposalId, "stale", { reason });
  }
}

/**
 * The MCD-5 apply gate sequence: live event states, scoped index watermark,
 * fresh disk-level re-hash of every scope file, manifest dry-run with identity
 * verification, then the existing transactional importer. Detector activity on
 * unrelated entities cannot influence the outcome.
 */
export function applyProposal(
  db: SqliteDatabase,
  repositoryRoot: string,
  options: {
    proposalId: string;
    actor: ReviewActor;
    reason: string;
    catalog?: readonly PestDiseaseCatalogEntry[];
  },
): ApplyOutcome {
  const proposal = getReviewProposal(db, options.proposalId);
  if (!proposal) {
    return { status: "rejected", code: "PROPOSAL_NOT_FOUND" };
  }
  if (proposal.status !== "ready") {
    return { status: "rejected", code: "PROPOSAL_NOT_READY", detail: proposal.status };
  }

  const definition = JSON.parse(proposal.scope_definition_json) as { eventIds?: string[] };
  const linkedEventIds = definition.eventIds ?? [];
  const superseded: string[] = [];
  for (const eventId of linkedEventIds) {
    const event = getChangeEvent(db, eventId);
    if (!event || event.review_state !== "approved") {
      superseded.push(eventId);
    }
  }
  if (linkedEventIds.length === 0) {
    return { status: "rejected", code: "NO_APPROVED_EVENTS" };
  }
  if (superseded.length > 0) {
    const reason = `APPROVED_EVENT_SUPERSEDED:${superseded.join(",")}`;
    markProposalStale(db, options.proposalId, reason);
    return {
      status: "rejected",
      code: "APPROVED_EVENT_SUPERSEDED",
      supersededEventIds: superseded,
    };
  }

  const scopeCheck = verifyProposalScopeEvidence(db, options.proposalId);
  if (!scopeCheck.ok) {
    markProposalStale(db, options.proposalId, scopeCheck.reason);
    return { status: "rejected", code: "SCOPE_EVIDENCE_CHANGED", detail: scopeCheck.reason };
  }

  // Fresh disk-level re-read/re-hash of EVERY scope path against the exact
  // digests the approver previewed.
  const scopePaths = JSON.parse(proposal.scope_paths_json) as string[];
  const storedDigests = JSON.parse(proposal.scope_digests_json) as Record<string, string>;
  for (const relPath of scopePaths) {
    const absolutePath = path.join(repositoryRoot, relPath);
    if (!fs.existsSync(absolutePath)) {
      markProposalStale(db, options.proposalId, `SCOPE_FILE_MISSING:${relPath}`);
      return { status: "rejected", code: "SCOPE_FILE_MISSING", detail: relPath };
    }
    const fresh = hashUtf8File(absolutePath);
    if (fresh.sha256 !== storedDigests[relPath]) {
      markProposalStale(db, options.proposalId, `SCOPE_FILE_CHANGED_ON_DISK:${relPath}`);
      return { status: "rejected", code: "SCOPE_FILE_CHANGED_ON_DISK", detail: relPath };
    }
  }

  const manifestPaths = [
    ...new Set(
      scopePaths
        .map((relPath) => {
          const classification: ContentSourcePathClassification | null =
            classifyRelativeContentPath(relPath);
          if (classification?.fileKind === "manifest") return relPath;
          return getSourceFile(db, relPath)?.owning_manifest_path ?? null;
        })
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
  const manifestAbsolutePaths = manifestPaths.map((relPath) =>
    path.join(repositoryRoot, relPath),
  );

  let report;
  try {
    report = dryRunContentImport(db, {
      manifestPaths: manifestAbsolutePaths,
      repositoryRoot,
      catalog: options.catalog,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    markProposalStale(db, options.proposalId, `DRY_RUN_ERROR:${detail}`);
    return { status: "rejected", code: "DRY_RUN_BLOCKED", detail };
  }
  if (report.status !== "ready") {
    markProposalStale(db, options.proposalId, "DRY_RUN_BLOCKED");
    return {
      status: "rejected",
      code: "DRY_RUN_BLOCKED",
      findings: report.findings.filter((finding) => finding.severity === "blocked"),
      dryRunBlockedPaths: report.manifests
        .filter((item) => item.status === "blocked")
        .map((item) => item.path),
    };
  }

  let applyResult;
  try {
    applyResult = applyContentImport(db, report, {
      authorized: true,
      runId: crypto.randomUUID(),
      manifestPaths: manifestAbsolutePaths,
      repositoryRoot,
      catalog: options.catalog,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markProposalStale(db, options.proposalId, `IMPORT_REJECTED:${message}`);
    return { status: "rejected", code: "IMPORT_REJECTED", detail: message };
  }

  transitionReviewProposalStatus(db, options.proposalId, "applied");
  const appliedEventIds: string[] = [];
  for (const eventId of linkedEventIds) {
    const event = getChangeEvent(db, eventId);
    if (!event || event.review_state !== "approved") continue;
    transitionChangeEventReviewState(db, eventId, "applied", {
      reviewerId: options.actor.id,
      reviewerRole: options.actor.role,
      reason: options.reason,
    }, {
      applyResult: {
        updatedLocales: applyResult.updatedLocales,
        queuedOutbox: applyResult.queuedOutbox,
      },
      refs: {
        proposalId: options.proposalId,
        sqliteRevision: applyResult.database_sha256_after,
      },
    });
    appliedEventIds.push(eventId);
  }

  // Bring the detector index in line with imported reality immediately so
  // the next reconcile tick does not re-report the just-applied change as a
  // fresh modification.
  refreshScopeIndexEntries(db, repositoryRoot, scopePaths);

  return {
    status: "applied",
    proposalId: options.proposalId,
    updatedLocales: applyResult.updatedLocales,
    queuedOutbox: applyResult.queuedOutbox,
    databaseSha256After: applyResult.database_sha256_after,
    appliedEventIds,
    scopePaths,
  };
}

export function listReviewEvents(
  db: SqliteDatabase,
  filter: Parameters<typeof listChangeEvents>[1] = {},
) {
  return listChangeEvents(db, filter);
}

export interface QuarantineSummaryRow {
  path: string;
  reason: string;
  retry_count: number;
  next_retry_at: string;
}

export function getQuarantineSummary(db: SqliteDatabase): QuarantineSummaryRow[] {
  return db
    .prepare(
      `SELECT path, reason, retry_count, next_retry_at
       FROM content_source_quarantine WHERE resolved_at IS NULL ORDER BY next_retry_at ASC`,
    )
    .all() as QuarantineSummaryRow[];
}

/**
 * Detector-side refresh used after a successful apply so the index reflects
 * imported reality without waiting for the next scan tick. Writes stay
 * confined to the detector tables; Git bytes are read-only.
 */
export function refreshScopeIndexEntries(
  db: SqliteDatabase,
  repositoryRoot: string,
  scopePaths: readonly string[],
): void {
  for (const relPath of scopePaths) {
    const classification = classifyRelativeContentPath(relPath);
    if (!classification) continue;
    const absolutePath = path.join(repositoryRoot, relPath);
    if (!fs.existsSync(absolutePath)) continue;
    let digest: { sha256: string; byteSize: number };
    try {
      digest = hashUtf8File(absolutePath);
    } catch {
      continue;
    }
    const manifestless =
      classification.fileKind === "markdown" &&
      !fs.existsSync(
        path.join(
          repositoryRoot,
          `${repositoryEntityDir(classification.rootKey, classification.entityDir)}/content.json`,
        ),
      );
    upsertSourceFile(db, {
      path: relPath,
      rootKey: classification.rootKey,
      entityKind: classification.entityKind,
      entityKey: classification.entityDir,
      locale: classification.locale,
      fileKind: classification.fileKind,
      owningManifestPath: `${repositoryEntityDir(classification.rootKey, classification.entityDir)}/content.json`,
      observedMtimeMs: Math.round(fs.statSync(absolutePath).mtimeMs),
      byteSize: digest.byteSize,
      sha256: digest.sha256,
      ownerStatus: manifestless ? "missing_manifest" : "manifest_ok",
    });
  }
  bumpContentSourceRevision(db);
}
