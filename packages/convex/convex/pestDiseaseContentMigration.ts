/**
 * Bounded import of Git-generated pest/disease Markdown manifests.
 *
 * The caller supplies one manifest page at a time. Dry-run pages persist
 * proposals and their exact before/after snapshots; apply consumes only that
 * completed proposal run, never the caller's mutable files. Rollback restores
 * existing rows or archives rows created by the run (it never deletes).
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  bumpReconciliationCatalog,
  readReconciliationCatalogMetadata,
} from "./lib/reconciliationCatalog";

const MAX_PAGE_SIZE = 500;

const migrationModeValidator = v.union(
  v.literal("dry_run"),
  v.literal("apply"),
  v.literal("rollback"),
);
const migrationStatusValidator = v.union(
  v.literal("planned"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);
const nullableCursorValidator = v.union(v.string(), v.null());
const contentStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("needs_review"),
  v.literal("archived"),
);
const reviewStatusValidator = v.union(
  v.literal("unreviewed"),
  v.literal("in_review"),
  v.literal("reviewed"),
);
const contentOriginValidator = v.union(
  v.literal("authored"),
  v.literal("inherited"),
  v.literal("imported"),
);
const sourceRefValidator = v.object({
  sourceSystem: v.optional(v.string()),
  sourceName: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  sourceLocator: v.optional(v.string()),
});

const manifestEntryValidator = v.object({
  key: v.string(),
  type: v.union(v.literal("pest"), v.literal("disease")),
  locale: v.string(),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  detailContent: v.string(),
  contentVersion: v.number(),
  contentStatus: contentStatusValidator,
  reviewStatus: reviewStatusValidator,
  contentOrigin: contentOriginValidator,
  bytes: v.number(),
  sha256: v.string(),
  sourceRefs: v.optional(v.array(sourceRefValidator)),
  conflictResolution: v.optional(v.object({
    resolution: v.literal("replace_database"),
    reviewedBy: v.string(),
    reviewedAt: v.string(),
    reason: v.string(),
  })),
});

export const pestDiseaseContentMigrationStartArgsValidator = {
  runId: v.string(),
  mode: migrationModeValidator,
  limit: v.optional(v.number()),
  parentRunId: v.optional(v.string()),
  proposalFingerprint: v.string(),
  confirmation: v.optional(v.string()),
};

export const pestDiseaseContentMigrationRunValidator = v.object({
  runId: v.string(),
  mode: migrationModeValidator,
  parentRunId: v.optional(v.string()),
  status: migrationStatusValidator,
  cursor: v.optional(v.string()),
  limit: v.number(),
  scanned: v.number(),
  changed: v.number(),
  skipped: v.number(),
  snapshotCapturedAt: v.number(),
  catalogRevision: v.optional(v.number()),
  proposalFingerprint: v.string(),
});

export const pestDiseaseContentMigrationPageArgsValidator = {
  runId: v.string(),
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
  entries: v.optional(v.array(manifestEntryValidator)),
  isLastPage: v.optional(v.boolean()),
};

export const pestDiseaseContentMigrationPageResultValidator = v.object({
  runId: v.string(),
  mode: migrationModeValidator,
  status: migrationStatusValidator,
  scanned: v.number(),
  changed: v.number(),
  skipped: v.number(),
  nextCursor: nullableCursorValidator,
  isDone: v.boolean(),
});

export const pestDiseaseContentMigrationReadbackArgsValidator = {
  runId: v.string(),
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
};

export const pestDiseaseContentMigrationReadbackResultValidator = v.object({
  runId: v.string(),
  mode: migrationModeValidator,
  checked: v.number(),
  mismatches: v.array(v.object({
    key: v.string(),
    locale: v.string(),
    reason: v.string(),
  })),
  nextCursor: nullableCursorValidator,
  isDone: v.boolean(),
  healthy: v.boolean(),
});

type MigrationMode = "dry_run" | "apply" | "rollback";
type MigrationStatus = "planned" | "running" | "completed" | "failed";
type ContentStatus = "draft" | "published" | "needs_review" | "archived";
type ReviewStatus = "unreviewed" | "in_review" | "reviewed";
type ContentOrigin = "authored" | "inherited" | "imported";

type ManifestEntry = {
  key: string;
  type: "pest" | "disease";
  locale: string;
  name?: string;
  description?: string;
  detailContent: string;
  contentVersion: number;
  contentStatus: ContentStatus;
  reviewStatus: ReviewStatus;
  contentOrigin: ContentOrigin;
  bytes: number;
  sha256: string;
  sourceRefs?: Array<{
    sourceSystem?: string;
    sourceName?: string;
    sourceUrl?: string;
    sourceLocator?: string;
  }>;
  conflictResolution?: {
    resolution: "replace_database";
    reviewedBy: string;
    reviewedAt: string;
    reason: string;
  };
};

type ContentFieldSnapshot = {
  pestDiseaseKey: string;
  locale: string;
  name: string;
  description?: string;
  detailContent: string;
  contentVersion: number;
  contentStatus: ContentStatus;
  reviewStatus: ReviewStatus;
  contentOrigin: ContentOrigin;
  contentHash: string;
  contentByteLength: number;
  sourceRefs: NonNullable<ManifestEntry["sourceRefs"]>;
};

type MigrationContext = { db: any };
type MigrationRun = {
  _id: any;
  runId: string;
  mode: MigrationMode;
  parentRunId?: string;
  status: MigrationStatus;
  cursor?: string;
  limit: number;
  scanned: number;
  changed: number;
  skipped: number;
  snapshotCapturedAt: number;
  catalogRevision?: number;
  proposalFingerprint: string;
};

function fail(code: string, message: string, details: Record<string, unknown> = {}): never {
  throw new ConvexError({ code, message, ...details });
}

function boundedLimit(value: number | undefined, fallback: number): number {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    fail("PEST_DISEASE_CONTENT_LIMIT_INVALID", `Migration page limit must be an integer from 1 to ${MAX_PAGE_SIZE}`);
  }
  return limit;
}

function normalizedRunId(value: string): string {
  const runId = value.trim();
  if (!runId || runId.length > 160) {
    fail("PEST_DISEASE_CONTENT_RUN_ID_INVALID", "Migration runId must be non-empty and at most 160 characters");
  }
  return runId;
}

function normalizedFingerprint(value: string): string {
  const fingerprint = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
    fail("PEST_DISEASE_CONTENT_FINGERPRINT_INVALID", "Proposal fingerprint must be a SHA-256 hex digest");
  }
  return fingerprint;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sourceRefs(value: unknown): NonNullable<ManifestEntry["sourceRefs"]> {
  if (!Array.isArray(value)) return [];
  return value.map((ref) => ({ ...ref }));
}

function fieldsEqual(left: ContentFieldSnapshot, right: ContentFieldSnapshot): boolean {
  return stableJson(left) === stableJson(right);
}

function runSummary(run: MigrationRun) {
  return {
    runId: run.runId,
    mode: run.mode,
    ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
    status: run.status,
    ...(run.cursor ? { cursor: run.cursor } : {}),
    limit: run.limit,
    scanned: run.scanned,
    changed: run.changed,
    skipped: run.skipped,
    snapshotCapturedAt: run.snapshotCapturedAt,
    ...(run.catalogRevision !== undefined ? { catalogRevision: run.catalogRevision } : {}),
    proposalFingerprint: run.proposalFingerprint,
  };
}

async function getRun(ctx: MigrationContext, runId: string): Promise<MigrationRun | null> {
  const rows = await ctx.db
    .query("pestDiseaseContentMigrationRuns")
    .withIndex("by_run_id", (q: any) => q.eq("runId", runId))
    .take(2);
  if (rows.length > 1) fail("PEST_DISEASE_CONTENT_RUN_DUPLICATE", "Migration runId is not unique", { runId });
  return rows[0] ?? null;
}

async function assertSingleton(ctx: MigrationContext, excludeRunId?: string): Promise<void> {
  const conflicts: any[] = [];
  for (const status of ["planned", "running"] as const) {
    for (const mode of ["dry_run", "apply", "rollback"] as const) {
      const rows = await ctx.db
        .query("pestDiseaseContentMigrationRuns")
        .withIndex("by_status_mode", (q: any) => q.eq("status", status).eq("mode", mode))
        .take(2);
      conflicts.push(...rows.filter((row: any) => row.runId !== excludeRunId));
    }
  }
  if (conflicts.length > 0) {
    fail("PEST_DISEASE_CONTENT_ACTIVE_CONFLICT", "Only one pest/disease content migration may be active", {
      activeRunIds: conflicts.map((row) => row.runId),
    });
  }
}

async function currentCatalogRevision(ctx: MigrationContext): Promise<number> {
  const metadata = await readReconciliationCatalogMetadata(ctx);
  if (!metadata || metadata.initialized !== true || !Number.isSafeInteger(metadata.revision)) {
    fail("PEST_DISEASE_CONTENT_CATALOG_NOT_READY", "A complete reconciliation catalog is required before content migration");
  }
  return metadata.revision;
}

async function assertCatalogRevision(ctx: MigrationContext, run: MigrationRun): Promise<number> {
  if (!Number.isSafeInteger(run.catalogRevision)) {
    fail("PEST_DISEASE_CONTENT_CATALOG_REVISION_MISSING", "Migration run has no verified catalog revision");
  }
  const actual = await currentCatalogRevision(ctx);
  if (actual !== run.catalogRevision) {
    fail("PEST_DISEASE_CONTENT_CATALOG_REVISION_CHANGED", "Catalog revision changed since this migration checkpoint", {
      runId: run.runId,
      expectedRevision: run.catalogRevision,
      actualRevision: actual,
    });
  }
  return actual;
}

function assertCursor(run: MigrationRun, requestedCursor?: string): string | null {
  if (run.cursor && requestedCursor && run.cursor !== requestedCursor) {
    fail("PEST_DISEASE_CONTENT_CURSOR_MISMATCH", "Cursor does not match the migration checkpoint", {
      runId: run.runId,
      expectedCursor: run.cursor,
      requestedCursor,
    });
  }
  return requestedCursor ?? run.cursor ?? null;
}

async function baseRows(ctx: MigrationContext, key: string): Promise<any[]> {
  return await ctx.db
    .query("pestsDiseases")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .take(2);
}

async function localizedRows(ctx: MigrationContext, key: string, locale: string): Promise<any[]> {
  return await ctx.db
    .query("pestDiseaseI18n")
    .withIndex("by_key_locale", (q: any) => q.eq("pestDiseaseKey", key).eq("locale", locale))
    .take(2);
}

async function snapshotRow(row: any): Promise<ContentFieldSnapshot> {
  const detailContent = typeof row.detailContent === "string" ? row.detailContent : "";
  const contentHash = typeof row.contentHash === "string" && /^[0-9a-f]{64}$/.test(row.contentHash)
    ? row.contentHash
    : await sha256(detailContent);
  const description = typeof row.description === "string" ? row.description : undefined;
  return {
    pestDiseaseKey: String(row.pestDiseaseKey),
    locale: String(row.locale),
    name: String(row.name ?? ""),
    ...(description !== undefined ? { description } : {}),
    detailContent,
    contentVersion: Number.isSafeInteger(row.contentVersion) && row.contentVersion > 0 ? row.contentVersion : 1,
    contentStatus: row.contentStatus ?? "needs_review",
    reviewStatus: row.reviewStatus ?? "unreviewed",
    contentOrigin: row.contentOrigin ?? "authored",
    contentHash,
    contentByteLength: typeof row.contentByteLength === "number" && Number.isSafeInteger(row.contentByteLength)
      ? row.contentByteLength
      : utf8Bytes(detailContent),
    sourceRefs: sourceRefs(row.sourceRefs),
  };
}

function fieldsFromEntry(entry: ManifestEntry, base: any): ContentFieldSnapshot {
  const locale = entry.locale.trim().toLowerCase();
  const name = entry.name?.trim() || (locale === "vi" ? String(base.commonNameVi ?? base.name) : String(base.name));
  return {
    pestDiseaseKey: entry.key.trim(),
    locale,
    name,
    ...(entry.description !== undefined ? { description: entry.description } : {}),
    detailContent: entry.detailContent,
    contentVersion: entry.contentVersion,
    contentStatus: entry.contentStatus,
    reviewStatus: entry.reviewStatus,
    contentOrigin: entry.contentOrigin,
    contentHash: entry.sha256.toLowerCase(),
    contentByteLength: entry.bytes,
    sourceRefs: sourceRefs(entry.sourceRefs),
  };
}

function dbFields(fields: ContentFieldSnapshot): Record<string, unknown> {
  return {
    pestDiseaseKey: fields.pestDiseaseKey,
    locale: fields.locale,
    name: fields.name,
    ...(fields.description !== undefined ? { description: fields.description } : {}),
    detailContent: fields.detailContent,
    contentVersion: fields.contentVersion,
    contentStatus: fields.contentStatus,
    reviewStatus: fields.reviewStatus,
    contentOrigin: fields.contentOrigin,
    contentHash: fields.contentHash,
    contentByteLength: fields.contentByteLength,
    sourceRefs: fields.sourceRefs,
  };
}

function contentGate(entry: ManifestEntry): string | null {
  if (entry.contentStatus === "published" && entry.reviewStatus !== "reviewed") return "published_unreviewed";
  if (entry.reviewStatus === "reviewed" && (!entry.sourceRefs || entry.sourceRefs.length === 0)) return "reviewed_without_provenance";
  if (entry.contentOrigin === "imported" && (!entry.sourceRefs || entry.sourceRefs.length === 0)) return "imported_without_provenance";
  return null;
}

async function analyzeEntry(ctx: MigrationContext, entry: ManifestEntry): Promise<{
  changed: boolean;
  reason: string;
  beforeFields?: ContentFieldSnapshot;
  afterFields?: ContentFieldSnapshot;
}> {
  const key = entry.key.trim();
  const locale = entry.locale.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(key)) return { changed: false, reason: "key_invalid" };
  if (!/^[a-z]{2}(?:-[a-z]{2})?$/.test(locale)) return { changed: false, reason: "locale_invalid" };
  if (!entry.detailContent.trim()) return { changed: false, reason: "detail_content_empty" };
  if (!Number.isSafeInteger(entry.contentVersion) || entry.contentVersion < 1) return { changed: false, reason: "content_version_invalid" };
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) return { changed: false, reason: "content_bytes_invalid" };
  if (!/^[0-9a-f]{64}$/.test(entry.sha256)) return { changed: false, reason: "content_hash_invalid" };
  if (utf8Bytes(entry.detailContent) !== entry.bytes || (await sha256(entry.detailContent)) !== entry.sha256) {
    return { changed: false, reason: "content_hash_mismatch" };
  }
  const gate = contentGate(entry);
  if (gate) return { changed: false, reason: gate };

  const catalog = await baseRows(ctx, key);
  if (catalog.length === 0) return { changed: false, reason: "catalog_key_unknown" };
  if (catalog.length > 1) return { changed: false, reason: "catalog_key_duplicate" };
  if (catalog[0].type !== entry.type) return { changed: false, reason: "catalog_type_mismatch" };

  const existingRows = await localizedRows(ctx, key, locale);
  if (existingRows.length > 1) return { changed: false, reason: "locale_duplicate" };
  const afterFields = fieldsFromEntry({ ...entry, key, locale }, catalog[0]);
  const existing = existingRows[0];
  if (!existing) return { changed: true, reason: "manifest_import", afterFields };
  const beforeFields = await snapshotRow(existing);
  if (fieldsEqual(beforeFields, afterFields)) return { changed: false, reason: "already_current", beforeFields, afterFields };
  const resolution = entry.conflictResolution;
  const canReplace = Boolean(
    resolution
    && resolution.resolution === "replace_database"
    && entry.reviewStatus === "reviewed"
    && (entry.sourceRefs?.length ?? 0) > 0
    && entry.contentVersion > beforeFields.contentVersion
    && resolution.reviewedBy.trim()
    && resolution.reviewedAt.trim()
    && resolution.reason.trim(),
  );
  if (!canReplace) return { changed: false, reason: "content_conflict", beforeFields, afterFields };
  return { changed: true, reason: "reviewed_replacement", beforeFields, afterFields };
}

async function journalForKey(ctx: MigrationContext, runId: string, key: string, locale: string): Promise<any | null> {
  const rows = await ctx.db
    .query("pestDiseaseContentMigrationJournal")
    .withIndex("by_run_key_locale", (q: any) => q.eq("runId", runId).eq("pestDiseaseKey", key).eq("locale", locale))
    .take(2);
  if (rows.length > 1) fail("PEST_DISEASE_CONTENT_JOURNAL_DUPLICATE", "Migration journal key/locale is not unique", { runId, key, locale });
  return rows[0] ?? null;
}

async function writeJournal(ctx: MigrationContext, args: {
  runId: string;
  key: string;
  locale: string;
  action: "proposal" | "apply" | "rollback";
  status: "proposed" | "applied" | "rolled_back" | "skipped";
  reason: string;
  beforeFields?: ContentFieldSnapshot;
  afterFields?: ContentFieldSnapshot;
}): Promise<void> {
  await ctx.db.insert("pestDiseaseContentMigrationJournal", {
    runId: args.runId,
    pestDiseaseKey: args.key,
    locale: args.locale,
    action: args.action,
    status: args.status,
    reason: args.reason,
    ...(args.beforeFields ? { beforeFields: args.beforeFields } : {}),
    ...(args.afterFields ? { afterFields: args.afterFields } : {}),
    createdAt: Date.now(),
  });
}

async function beginRun(ctx: MigrationContext, args: {
  runId: string;
  mode: MigrationMode;
  limit?: number;
  parentRunId?: string;
  proposalFingerprint: string;
  confirmation?: string;
}) {
  const runId = normalizedRunId(args.runId);
  const proposalFingerprint = normalizedFingerprint(args.proposalFingerprint);
  const limit = boundedLimit(args.limit, 100);
  if (args.mode === "apply" && args.confirmation !== "APPLY_PEST_DISEASE_CONTENT") {
    fail("PEST_DISEASE_CONTENT_CONFIRMATION_REQUIRED", "Apply requires APPLY_PEST_DISEASE_CONTENT confirmation");
  }
  if (args.mode === "rollback" && args.confirmation !== "ROLLBACK_PEST_DISEASE_CONTENT") {
    fail("PEST_DISEASE_CONTENT_CONFIRMATION_REQUIRED", "Rollback requires ROLLBACK_PEST_DISEASE_CONTENT confirmation");
  }
  if ((args.mode === "apply" || args.mode === "rollback") && !args.parentRunId?.trim()) {
    fail("PEST_DISEASE_CONTENT_PARENT_REQUIRED", `${args.mode} requires a parent runId`);
  }

  const existing = await getRun(ctx, runId);
  if (existing) {
    if (existing.mode !== args.mode || existing.parentRunId !== args.parentRunId?.trim() || existing.proposalFingerprint !== proposalFingerprint) {
      fail("PEST_DISEASE_CONTENT_RUN_CONFLICT", "runId is already bound to another migration proposal", { runId });
    }
    return runSummary(existing);
  }

  await assertSingleton(ctx);
  const catalogRevision = await currentCatalogRevision(ctx);
  let parent: MigrationRun | null = null;
  if (args.mode === "apply" || args.mode === "rollback") {
    parent = await getRun(ctx, args.parentRunId!.trim());
    const expectedMode = args.mode === "apply" ? "dry_run" : "apply";
    if (!parent || parent.mode !== expectedMode || parent.status !== "completed") {
      fail("PEST_DISEASE_CONTENT_PARENT_INCOMPLETE", `${args.mode} parent must be a completed ${expectedMode} run`);
    }
    if (parent.proposalFingerprint !== proposalFingerprint) {
      fail("PEST_DISEASE_CONTENT_PROPOSAL_MISMATCH", "Parent run fingerprint does not match the requested proposal");
    }
    if (args.mode === "apply" && parent.catalogRevision !== catalogRevision) {
      fail("PEST_DISEASE_CONTENT_CATALOG_REVISION_CHANGED", "Catalog revision changed after the dry-run proposal", {
        expectedRevision: parent.catalogRevision,
        actualRevision: catalogRevision,
      });
    }
  }

  const now = Date.now();
  const rowId = await ctx.db.insert("pestDiseaseContentMigrationRuns", {
    runId,
    mode: args.mode,
    ...(args.parentRunId ? { parentRunId: args.parentRunId.trim() } : {}),
    status: "planned",
    limit,
    scanned: 0,
    changed: 0,
    skipped: 0,
    snapshotCapturedAt: now,
    catalogRevision,
    proposalFingerprint,
    createdAt: now,
    updatedAt: now,
  });
  return runSummary({
    _id: rowId,
    runId,
    mode: args.mode,
    ...(args.parentRunId ? { parentRunId: args.parentRunId.trim() } : {}),
    status: "planned",
    limit,
    scanned: 0,
    changed: 0,
    skipped: 0,
    snapshotCapturedAt: now,
    catalogRevision,
    proposalFingerprint,
  } as MigrationRun);
}

export const startPestDiseaseContentMigration = internalMutation({
  args: pestDiseaseContentMigrationStartArgsValidator,
  returns: pestDiseaseContentMigrationRunValidator,
  handler: async (ctx, args) => beginRun(ctx, args),
});

async function applyProposalPage(ctx: MigrationContext, run: MigrationRun, parent: MigrationRun, requestedCursor?: string) {
  await assertCatalogRevision(ctx, run);
  const pageCursor = assertCursor(run, requestedCursor);
  if (run.status === "completed") {
    return { runId: run.runId, mode: run.mode, status: "completed" as const, scanned: 0, changed: 0, skipped: 0, nextCursor: null, isDone: true };
  }
  if (run.status !== "running") await ctx.db.patch(run._id, { status: "running", updatedAt: Date.now() });
  const page = await ctx.db
    .query("pestDiseaseContentMigrationJournal")
    .withIndex("by_run", (q: any) => q.eq("runId", parent.runId))
    .paginate({ cursor: pageCursor, numItems: run.limit });
  let scanned = 0;
  let changed = 0;
  let skipped = 0;
  for (const proposal of page.page as any[]) {
    if (proposal.action !== "proposal" || proposal.status !== "proposed" || !proposal.afterFields) continue;
    scanned += 1;
    const key = String(proposal.pestDiseaseKey);
    const locale = String(proposal.locale);
    if (await journalForKey(ctx, run.runId, key, locale)) {
      skipped += 1;
      continue;
    }
    const currentRows = await localizedRows(ctx, key, locale);
    if (currentRows.length > 1) {
      skipped += 1;
      await writeJournal(ctx, { runId: run.runId, key, locale, action: "apply", status: "skipped", reason: "locale_duplicate", beforeFields: proposal.beforeFields, afterFields: proposal.afterFields });
      continue;
    }
    const current = currentRows[0];
    const beforeFields = proposal.beforeFields as ContentFieldSnapshot | undefined;
    if (beforeFields && !current) {
      skipped += 1;
      await writeJournal(ctx, { runId: run.runId, key, locale, action: "apply", status: "skipped", reason: "source_revision_changed", beforeFields, afterFields: proposal.afterFields });
      continue;
    }
    if (!beforeFields && current) {
      skipped += 1;
      await writeJournal(ctx, { runId: run.runId, key, locale, action: "apply", status: "skipped", reason: "source_revision_changed", afterFields: proposal.afterFields });
      continue;
    }
    if (beforeFields && current && !fieldsEqual(beforeFields, await snapshotRow(current))) {
      skipped += 1;
      await writeJournal(ctx, { runId: run.runId, key, locale, action: "apply", status: "skipped", reason: "source_revision_changed", beforeFields, afterFields: proposal.afterFields });
      continue;
    }
    if (current) {
      await ctx.db.patch(current._id, dbFields(proposal.afterFields));
    } else {
      await ctx.db.insert("pestDiseaseI18n", dbFields(proposal.afterFields));
    }
    await bumpReconciliationCatalog(ctx, current ? {} : { pestDiseaseI18n: 1 });
    changed += 1;
    await writeJournal(ctx, { runId: run.runId, key, locale, action: "apply", status: "applied", reason: proposal.reason, beforeFields, afterFields: proposal.afterFields });
  }
  const catalogRevision = await currentCatalogRevision(ctx);
  const nextCursor = page.isDone ? undefined : String(page.continueCursor ?? "").trim();
  if (!page.isDone && (!nextCursor || nextCursor === pageCursor)) fail("PEST_DISEASE_CONTENT_CURSOR_INVALID", "Convex journal cursor did not advance");
  const status: MigrationStatus = page.isDone ? "completed" : "running";
  await ctx.db.patch(run._id, {
    status,
    ...(nextCursor ? { cursor: nextCursor } : {}),
    scanned: run.scanned + scanned,
    changed: run.changed + changed,
    skipped: run.skipped + skipped,
    catalogRevision,
    updatedAt: Date.now(),
  });
  return { runId: run.runId, mode: run.mode, status, scanned, changed, skipped, nextCursor: nextCursor ?? null, isDone: page.isDone };
}

async function proposalPage(ctx: MigrationContext, run: MigrationRun, args: {
  entries?: ManifestEntry[];
  cursor?: string;
  isLastPage?: boolean;
}) {
  await assertCatalogRevision(ctx, run);
  const pageCursor = assertCursor(run, args.cursor);
  if (run.status === "completed") {
    return { runId: run.runId, mode: run.mode, status: "completed" as const, scanned: 0, changed: 0, skipped: 0, nextCursor: null, isDone: true };
  }
  const entries = args.entries;
  if (!entries) fail("PEST_DISEASE_CONTENT_MANIFEST_PAGE_REQUIRED", "Dry-run requires a manifest page");
  if (entries.length > run.limit) fail("PEST_DISEASE_CONTENT_PAGE_TOO_LARGE", "Manifest page exceeds the run limit");
  if (run.status !== "running") await ctx.db.patch(run._id, { status: "running", updatedAt: Date.now() });
  let scanned = 0;
  let changed = 0;
  let skipped = 0;
  for (const entry of entries) {
    scanned += 1;
    const key = entry.key.trim();
    const locale = entry.locale.trim().toLowerCase();
    if (await journalForKey(ctx, run.runId, key, locale)) {
      skipped += 1;
      continue;
    }
    const analysis = await analyzeEntry(ctx, entry);
    if (analysis.changed && analysis.afterFields) {
      changed += 1;
      await writeJournal(ctx, { runId: run.runId, key, locale, action: "proposal", status: "proposed", reason: analysis.reason, beforeFields: analysis.beforeFields, afterFields: analysis.afterFields });
    } else {
      skipped += 1;
      await writeJournal(ctx, { runId: run.runId, key, locale, action: "proposal", status: "skipped", reason: analysis.reason, beforeFields: analysis.beforeFields, afterFields: analysis.afterFields });
    }
  }
  const catalogRevision = await currentCatalogRevision(ctx);
  const cursorOffset = pageCursor === null ? 0 : Number(pageCursor);
  if (!Number.isSafeInteger(cursorOffset) || cursorOffset < 0) fail("PEST_DISEASE_CONTENT_CURSOR_INVALID", "Manifest cursor must be a non-negative offset");
  const isDone = args.isLastPage === true;
  const nextCursor = isDone ? null : String(cursorOffset + entries.length);
  const status: MigrationStatus = isDone ? "completed" : "running";
  await ctx.db.patch(run._id, {
    status,
    ...(nextCursor !== null ? { cursor: nextCursor } : {}),
    scanned: run.scanned + scanned,
    changed: run.changed + changed,
    skipped: run.skipped + skipped,
    catalogRevision,
    updatedAt: Date.now(),
  });
  return { runId: run.runId, mode: run.mode, status, scanned, changed, skipped, nextCursor, isDone };
}

export const importPestDiseaseContentPage = internalMutation({
  args: pestDiseaseContentMigrationPageArgsValidator,
  returns: pestDiseaseContentMigrationPageResultValidator,
  handler: async (ctx, args) => {
    const run = await getRun(ctx, normalizedRunId(args.runId));
    if (!run || (run.mode !== "dry_run" && run.mode !== "apply")) fail("PEST_DISEASE_CONTENT_RUN_NOT_FOUND", "Import page requires a dry-run or apply run");
    await assertSingleton(ctx, run.runId);
    if (run.mode === "dry_run") return await proposalPage(ctx, run, { entries: args.entries as ManifestEntry[] | undefined, cursor: args.cursor, isLastPage: args.isLastPage });
    if (!run.parentRunId) fail("PEST_DISEASE_CONTENT_PARENT_REQUIRED", "Apply run has no dry-run parent");
    const parent = await getRun(ctx, run.parentRunId);
    if (!parent || parent.mode !== "dry_run" || parent.status !== "completed" || parent.proposalFingerprint !== run.proposalFingerprint) fail("PEST_DISEASE_CONTENT_PARENT_INCOMPLETE", "Apply parent is not a matching completed dry-run");
    return await applyProposalPage(ctx, run, parent, args.cursor);
  },
});

export const backfillPestDiseaseContentPage = importPestDiseaseContentPage;

async function rollbackPage(ctx: MigrationContext, run: MigrationRun, parent: MigrationRun, requestedCursor?: string) {
  await assertCatalogRevision(ctx, run);
  const pageCursor = assertCursor(run, requestedCursor);
  if (run.status === "completed") {
    return { runId: run.runId, mode: run.mode, status: "completed" as const, scanned: 0, changed: 0, skipped: 0, nextCursor: null, isDone: true };
  }
  if (run.status !== "running") await ctx.db.patch(run._id, { status: "running", updatedAt: Date.now() });
  const page = await ctx.db
    .query("pestDiseaseContentMigrationJournal")
    .withIndex("by_run", (q: any) => q.eq("runId", parent.runId))
    .paginate({ cursor: pageCursor, numItems: run.limit });
  let scanned = 0;
  let changed = 0;
  let skipped = 0;
  for (const applied of page.page as any[]) {
    if (applied.action !== "apply" || applied.status !== "applied" || !applied.afterFields) continue;
    scanned += 1;
    const key = String(applied.pestDiseaseKey);
    const locale = String(applied.locale);
    if (await journalForKey(ctx, run.runId, key, locale)) {
      skipped += 1;
      continue;
    }
    const currentRows = await localizedRows(ctx, key, locale);
    if (currentRows.length !== 1) {
      skipped += 1;
      await writeJournal(ctx, { runId: run.runId, key, locale, action: "rollback", status: "skipped", reason: "locale_missing_or_duplicate", beforeFields: applied.afterFields, afterFields: applied.beforeFields });
      continue;
    }
    const current = currentRows[0];
    const afterFields = applied.afterFields as ContentFieldSnapshot;
    if (!fieldsEqual(afterFields, await snapshotRow(current))) {
      skipped += 1;
      await writeJournal(ctx, { runId: run.runId, key, locale, action: "rollback", status: "skipped", reason: "source_revision_changed", beforeFields: afterFields, afterFields: applied.beforeFields });
      continue;
    }
    const beforeFields = applied.beforeFields as ContentFieldSnapshot | undefined;
    if (beforeFields) {
      await ctx.db.patch(current._id, dbFields(beforeFields));
    } else {
      // Never delete a row during rollback. A row created by this run is
      // quarantined as archived while preserving its exact Markdown bytes.
      await ctx.db.patch(current._id, { contentStatus: "archived", reviewStatus: "unreviewed" });
    }
    await bumpReconciliationCatalog(ctx, {});
    changed += 1;
    const rollbackFields = beforeFields ?? { ...afterFields, contentStatus: "archived" as const, reviewStatus: "unreviewed" as const };
    await writeJournal(ctx, { runId: run.runId, key, locale, action: "rollback", status: "rolled_back", reason: beforeFields ? "run_owned_fields_restored" : "run_owned_row_archived", beforeFields: afterFields, afterFields: rollbackFields });
  }
  const catalogRevision = await currentCatalogRevision(ctx);
  const nextCursor = page.isDone ? undefined : String(page.continueCursor ?? "").trim();
  if (!page.isDone && (!nextCursor || nextCursor === pageCursor)) fail("PEST_DISEASE_CONTENT_CURSOR_INVALID", "Convex journal cursor did not advance");
  const status: MigrationStatus = page.isDone ? "completed" : "running";
  await ctx.db.patch(run._id, {
    status,
    ...(nextCursor ? { cursor: nextCursor } : {}),
    scanned: run.scanned + scanned,
    changed: run.changed + changed,
    skipped: run.skipped + skipped,
    catalogRevision,
    updatedAt: Date.now(),
  });
  return { runId: run.runId, mode: run.mode, status, scanned, changed, skipped, nextCursor: nextCursor ?? null, isDone: page.isDone };
}

export const rollbackPestDiseaseContentPage = internalMutation({
  args: pestDiseaseContentMigrationPageArgsValidator,
  returns: pestDiseaseContentMigrationPageResultValidator,
  handler: async (ctx, args) => {
    const run = await getRun(ctx, normalizedRunId(args.runId));
    if (!run || run.mode !== "rollback") fail("PEST_DISEASE_CONTENT_RUN_NOT_FOUND", "Rollback page requires a rollback run");
    await assertSingleton(ctx, run.runId);
    if (!run.parentRunId) fail("PEST_DISEASE_CONTENT_PARENT_REQUIRED", "Rollback run has no apply parent");
    const parent = await getRun(ctx, run.parentRunId);
    if (!parent || parent.mode !== "apply" || parent.status !== "completed" || parent.proposalFingerprint !== run.proposalFingerprint) fail("PEST_DISEASE_CONTENT_PARENT_INCOMPLETE", "Rollback parent is not a matching completed apply");
    return await rollbackPage(ctx, run, parent, args.cursor);
  },
});

export const readbackPestDiseaseContentMigration = internalQuery({
  args: pestDiseaseContentMigrationReadbackArgsValidator,
  returns: pestDiseaseContentMigrationReadbackResultValidator,
  handler: async (ctx, args) => {
    const run = await getRun(ctx, normalizedRunId(args.runId));
    if (!run) fail("PEST_DISEASE_CONTENT_RUN_NOT_FOUND", "Readback run was not found");
    const page = await ctx.db
      .query("pestDiseaseContentMigrationJournal")
      .withIndex("by_run", (q: any) => q.eq("runId", run.runId))
      .paginate({ cursor: args.cursor ?? null, numItems: boundedLimit(args.limit, run.limit) });
    const mismatches: Array<{ key: string; locale: string; reason: string }> = [];
    let checked = 0;
    for (const journal of page.page as any[]) {
      if (journal.status !== "proposed" && journal.status !== "applied" && journal.status !== "rolled_back") continue;
      if (!journal.afterFields) continue;
      checked += 1;
      if (run.mode === "dry_run") {
        if (journal.afterFields.contentByteLength !== utf8Bytes(journal.afterFields.detailContent) || journal.afterFields.contentHash !== await sha256(journal.afterFields.detailContent)) {
          mismatches.push({ key: journal.pestDiseaseKey, locale: journal.locale, reason: "proposal_hash_mismatch" });
        }
        continue;
      }
      const rows = await localizedRows(ctx, journal.pestDiseaseKey, journal.locale);
      if (rows.length !== 1 || !fieldsEqual(journal.afterFields as ContentFieldSnapshot, await snapshotRow(rows[0]))) {
        mismatches.push({ key: journal.pestDiseaseKey, locale: journal.locale, reason: "database_readback_mismatch" });
      }
    }
    return {
      runId: run.runId,
      mode: run.mode,
      checked,
      mismatches,
      nextCursor: page.isDone ? null : String(page.continueCursor ?? "").trim() || null,
      isDone: page.isDone,
      healthy: mismatches.length === 0,
    };
  },
});
