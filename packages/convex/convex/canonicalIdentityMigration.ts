/**
 * Bounded canonical-identity migration orchestration.
 *
 * The migration never merges or deletes plants. A page either proposes the
 * canonical fields, applies only those fields, or records a deterministic
 * skip reason. Every apply page captures the source revision and the exact
 * owned-field before/after snapshots needed for a run-scoped rollback.
 */

import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import {
  canonicalIdentityFieldPatch,
  canonicalIdentityFieldsEqual,
  canonicalIdentityFieldsForStorage,
  canonicalIdentityFieldSnapshot,
  canonicalIdentityFromLegacyRow,
  findCanonicalMigrationRunsByStatusAndMode,
  type CanonicalIdentityFieldSnapshot,
} from "./lib/canonicalPlantUpsert";
import { bumpReconciliationCatalog } from "./lib/reconciliationCatalog";

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

export const canonicalIdentityMigrationStartArgsValidator = {
  runId: v.string(),
  mode: migrationModeValidator,
  limit: v.optional(v.number()),
  parentRunId: v.optional(v.string()),
  confirmation: v.optional(v.string()),
};

export const canonicalIdentityMigrationRunValidator = v.object({
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
});

export const canonicalIdentityMigrationPageArgsValidator = {
  runId: v.string(),
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
};

export const canonicalIdentityMigrationPageResultValidator = v.object({
  runId: v.string(),
  mode: migrationModeValidator,
  status: migrationStatusValidator,
  scanned: v.number(),
  changed: v.number(),
  skipped: v.number(),
  nextCursor: nullableCursorValidator,
  isDone: v.boolean(),
});

export const canonicalIdentityMigrationReadbackArgsValidator = {
  runId: v.string(),
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
};

export const canonicalIdentityMigrationReadbackResultValidator = v.object({
  runId: v.string(),
  mode: migrationModeValidator,
  checked: v.number(),
  mismatches: v.array(v.object({
    plantId: v.id("plantsMaster"),
    reason: v.string(),
  })),
  nextCursor: nullableCursorValidator,
  isDone: v.boolean(),
  healthy: v.boolean(),
});

type MigrationMode = "dry_run" | "apply" | "rollback";
type MigrationStatus = "planned" | "running" | "completed" | "failed";
type MigrationRun = {
  _id: Id<"canonicalIdentityMigrationRuns">;
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
};

type MigrationContext = { db: any };

function fail(code: string, message: string, details: Record<string, unknown> = {}): never {
  throw new ConvexError({ code, message, ...details });
}

function boundedLimit(value: number | undefined, fallback: number): number {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    fail("CANONICAL_MIGRATION_LIMIT_INVALID", `Migration page limit must be an integer from 1 to ${MAX_PAGE_SIZE}`);
  }
  return limit;
}

function normalizedRunId(value: string): string {
  const runId = value.trim();
  if (!runId || runId.length > 160) {
    fail("CANONICAL_MIGRATION_RUN_ID_INVALID", "Migration runId must be non-empty and at most 160 characters");
  }
  return runId;
}

function revisionOf(row: Record<string, unknown>): number {
  return typeof row.recordVersion === "number" && Number.isSafeInteger(row.recordVersion)
    ? row.recordVersion
    : 0;
}

function ownedFields(row: Record<string, unknown>): CanonicalIdentityFieldSnapshot {
  return canonicalIdentityFieldSnapshot(row);
}

function desiredFields(
  row: Record<string, unknown>,
  parentMasterPlantId?: Id<"plantsMaster">,
): CanonicalIdentityFieldSnapshot | null {
  const identity = canonicalIdentityFromLegacyRow(row);
  if (!identity) return null;
  return canonicalIdentityFieldSnapshot({
    ...row,
    ...canonicalIdentityFieldsForStorage(identity, parentMasterPlantId),
  });
}

async function getRun(ctx: MigrationContext, runId: string): Promise<MigrationRun | null> {
  return await ctx.db
    .query("canonicalIdentityMigrationRuns")
    .withIndex("by_run_id", (q: any) => q.eq("runId", runId))
    .unique();
}

async function activeMigrationRuns(ctx: MigrationContext, excludeRunId?: string) {
  return await findCanonicalMigrationRunsByStatusAndMode(ctx, excludeRunId);
}

async function assertMigrationSingleton(ctx: MigrationContext, excludeRunId?: string) {
  const conflicts = await activeMigrationRuns(ctx, excludeRunId);
  if (conflicts.length > 0) {
    fail("CANONICAL_MIGRATION_ACTIVE_CONFLICT", "Only one canonical migration run may be active", {
      activeRunIds: conflicts.map((run: any) => run.runId),
    });
  }
}

function assertCursor(run: MigrationRun, requestedCursor?: string): string | null {
  if (run.cursor && requestedCursor && run.cursor !== requestedCursor) {
    fail("CANONICAL_MIGRATION_CURSOR_MISMATCH", "Cursor does not match the run checkpoint", {
      runId: run.runId,
      expectedCursor: run.cursor,
      requestedCursor,
    });
  }
  return requestedCursor ?? run.cursor ?? null;
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
  };
}

async function canonicalCandidates(ctx: MigrationContext, canonicalKey: string) {
  return await ctx.db
    .query("plantsMaster")
    .withIndex("by_canonical_key", (q: any) => q.eq("canonicalKey", canonicalKey))
    .take(2);
}

async function legacySameIdentityCandidates(
  ctx: MigrationContext,
  row: Record<string, unknown>,
  canonicalKey: string,
) {
  const scientificName = typeof row.scientificName === "string" ? row.scientificName : "";
  if (!scientificName) return [];
  const candidates = await ctx.db
    .query("plantsMaster")
    .withIndex("by_scientific_name", (q: any) => q.eq("scientificName", scientificName))
    .take(2);
  return candidates.filter((candidate: any) => {
    if (candidate._id === row._id || candidate.canonicalKey) return false;
    return canonicalIdentityFromLegacyRow(candidate as Record<string, unknown>)?.canonicalKey === canonicalKey;
  });
}

async function analyzePlant(ctx: MigrationContext, row: Record<string, unknown>) {
  const identity = canonicalIdentityFromLegacyRow(row);
  const beforeFields = ownedFields(row);
  const beforeRevision = revisionOf(row);
  if (!identity) {
    return {
      changed: false,
      reason: "manual_review_required",
      beforeFields,
      afterFields: undefined,
      beforeRevision,
      afterRevision: beforeRevision,
    };
  }
  if (row.canonicalKey && row.canonicalKey !== identity.canonicalKey) {
    return {
      changed: false,
      reason: "canonical_identity_conflict",
      beforeFields,
      afterFields: undefined,
      beforeRevision,
      afterRevision: beforeRevision,
    };
  }

  const sameLegacy = await legacySameIdentityCandidates(ctx, row, identity.canonicalKey);
  if (sameLegacy.length > 0) {
    return {
      changed: false,
      reason: "legacy_duplicate",
      beforeFields,
      afterFields: undefined,
      beforeRevision,
      afterRevision: beforeRevision,
    };
  }

  let parentMasterPlantId: Id<"plantsMaster"> | undefined;
  if (identity.scope === "cultivar") {
    const parents = await canonicalCandidates(ctx, identity.parentCanonicalKey ?? "");
    if (parents.length !== 1 || (parents[0].identityScope && parents[0].identityScope !== "base")) {
      return {
        changed: false,
        reason: parents.length > 1 ? "duplicate_parent" : "missing_parent",
        beforeFields,
        afterFields: undefined,
        beforeRevision,
        afterRevision: beforeRevision,
      };
    }
    parentMasterPlantId = parents[0]._id;
  }

  const afterFields = desiredFields(row, parentMasterPlantId);
  if (!afterFields) {
    return {
      changed: false,
      reason: "manual_review_required",
      beforeFields,
      afterFields: undefined,
      beforeRevision,
      afterRevision: beforeRevision,
    };
  }
  const candidates = await canonicalCandidates(ctx, afterFields.canonicalKey ?? "");
  if (candidates.some((candidate: any) => candidate._id !== row._id)) {
    return {
      changed: false,
      reason: "canonical_duplicate",
      beforeFields,
      afterFields: undefined,
      beforeRevision,
      afterRevision: beforeRevision,
    };
  }
  return {
    changed: !canonicalIdentityFieldsEqual(beforeFields, afterFields),
    reason: "canonical_identity_backfill",
    beforeFields,
    afterFields,
    beforeRevision,
    afterRevision: beforeRevision,
  };
}

async function journalForPlant(ctx: MigrationContext, runId: string, plantId: Id<"plantsMaster">) {
  return await ctx.db
    .query("canonicalIdentityMigrationJournal")
    .withIndex("by_run_plant", (q: any) => q.eq("runId", runId).eq("plantId", plantId))
    .first();
}

async function journalForCanonicalKey(ctx: MigrationContext, runId: string, canonicalKey: string) {
  return await ctx.db
    .query("canonicalIdentityMigrationJournal")
    .withIndex("by_run_after_key", (q: any) => q.eq("runId", runId).eq("afterCanonicalKey", canonicalKey))
    .first();
}

async function applyAnalysisFromProposal(
  ctx: MigrationContext,
  run: MigrationRun,
  row: Record<string, unknown>,
) {
  if (!run.parentRunId) {
    return {
      changed: false,
      reason: "missing_dry_run_proposal",
      beforeFields: ownedFields(row),
      afterFields: undefined,
      beforeRevision: revisionOf(row),
      afterRevision: revisionOf(row),
    };
  }
  const proposal = await journalForPlant(ctx, run.parentRunId, row._id as Id<"plantsMaster">);
  if (proposal?.status !== "proposed" || !proposal.beforeFields || !proposal.afterFields) {
    return {
      changed: false,
      reason: "missing_dry_run_proposal",
      beforeFields: ownedFields(row),
      afterFields: undefined,
      beforeRevision: revisionOf(row),
      afterRevision: revisionOf(row),
    };
  }
  const beforeFields = proposal.beforeFields as CanonicalIdentityFieldSnapshot;
  const afterFields = proposal.afterFields as CanonicalIdentityFieldSnapshot;
  const beforeRevision = proposal.beforeRevision;
  if (
    revisionOf(row) !== beforeRevision ||
    !canonicalIdentityFieldsEqual(ownedFields(row), beforeFields)
  ) {
    return {
      changed: false,
      reason: "source_revision_changed",
      beforeFields,
      afterFields,
      beforeRevision,
      afterRevision: revisionOf(row),
    };
  }
  return {
    changed: !canonicalIdentityFieldsEqual(beforeFields, afterFields),
    reason: "canonical_identity_backfill",
    beforeFields,
    afterFields,
    beforeRevision,
    afterRevision: beforeRevision,
  };
}

async function writeJournal(
  ctx: MigrationContext,
  args: {
    runId: string;
    plantId: Id<"plantsMaster">;
    action: "proposal" | "apply" | "rollback";
    status: "proposed" | "applied" | "rolled_back" | "skipped";
    reason: string;
    beforeRevision: number;
    afterRevision: number;
    beforeFields?: CanonicalIdentityFieldSnapshot;
    afterFields?: CanonicalIdentityFieldSnapshot;
  },
) {
  await ctx.db.insert("canonicalIdentityMigrationJournal", {
    ...args,
    beforeCanonicalKey: args.beforeFields?.canonicalKey,
    afterCanonicalKey: args.afterFields?.canonicalKey,
    createdAt: Date.now(),
  });
}

async function beginRun(ctx: MigrationContext, args: {
  runId: string;
  mode: MigrationMode;
  limit?: number;
  parentRunId?: string;
  confirmation?: string;
}) {
  const runId = normalizedRunId(args.runId);
  const limit = boundedLimit(args.limit, 100);
  if (args.mode === "apply" && args.confirmation !== "APPLY_CANONICAL_IDENTITY") {
    fail("CANONICAL_MIGRATION_CONFIRMATION_REQUIRED", "Apply requires APPLY_CANONICAL_IDENTITY confirmation");
  }
  if (args.mode === "rollback" && args.confirmation !== "ROLLBACK_CANONICAL_IDENTITY") {
    fail("CANONICAL_MIGRATION_CONFIRMATION_REQUIRED", "Rollback requires ROLLBACK_CANONICAL_IDENTITY confirmation");
  }
  if (args.mode === "rollback" && !args.parentRunId?.trim()) {
    fail("CANONICAL_MIGRATION_PARENT_REQUIRED", "Rollback requires the apply runId it owns");
  }
  if (args.mode === "apply" && !args.parentRunId?.trim()) {
    fail("CANONICAL_MIGRATION_PARENT_REQUIRED", "Apply requires a completed dry-run proposal runId");
  }

  const existing = await getRun(ctx, runId);
  if (existing) {
    if (existing.mode !== args.mode || existing.parentRunId !== args.parentRunId) {
      fail("CANONICAL_MIGRATION_RUN_CONFLICT", "runId is already bound to another migration mode", {
        runId,
        existingMode: existing.mode,
      });
    }
    return runSummary(existing);
  }
  // The indexed take(2) check runs in the same mutation as the run insert so
  // concurrent starters either observe the active run or conflict at commit.
  await assertMigrationSingleton(ctx);
  if (args.mode === "apply" || args.mode === "rollback") {
    const parent = await getRun(ctx, args.parentRunId!.trim());
    const expectedMode = args.mode === "apply" ? "dry_run" : "apply";
    if (!parent || parent.mode !== expectedMode) {
      fail(
        args.mode === "apply"
          ? "CANONICAL_MIGRATION_APPLY_TARGET_INVALID"
          : "CANONICAL_MIGRATION_ROLLBACK_TARGET_INVALID",
        args.mode === "apply"
          ? "Apply target must be a dry-run proposal run"
          : "Rollback target must be an apply run",
      );
    }
    if (parent.status !== "completed") {
      fail(
        args.mode === "apply"
          ? "CANONICAL_MIGRATION_APPLY_TARGET_INCOMPLETE"
          : "CANONICAL_MIGRATION_ROLLBACK_TARGET_INCOMPLETE",
        args.mode === "apply"
          ? "Dry-run proposal run must be complete before apply"
          : "Apply run must be complete before rollback",
      );
    }
  }

  const now = Date.now();
  const runDbId = await ctx.db.insert("canonicalIdentityMigrationRuns", {
    runId,
    mode: args.mode,
    ...(args.parentRunId ? { parentRunId: args.parentRunId.trim() } : {}),
    status: "planned",
    limit,
    scanned: 0,
    changed: 0,
    skipped: 0,
    snapshotCapturedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return runSummary({
    _id: runDbId,
    runId,
    mode: args.mode,
    ...(args.parentRunId ? { parentRunId: args.parentRunId.trim() } : {}),
    status: "planned",
    limit,
    scanned: 0,
    changed: 0,
    skipped: 0,
    snapshotCapturedAt: now,
  } as MigrationRun);
}

export const startCanonicalIdentityMigration = internalMutation({
  args: canonicalIdentityMigrationStartArgsValidator,
  returns: canonicalIdentityMigrationRunValidator,
  handler: async (ctx, args) => beginRun(ctx, args),
});

async function pageRun(ctx: MigrationContext, run: MigrationRun, requestedCursor?: string) {
  if (run.status === "completed") {
    return { pageCursor: run.cursor ?? null, limit: run.limit, alreadyCompleted: true as const };
  }
  const pageCursor = assertCursor(run, requestedCursor);
  const limit = run.limit;
  if (run.status !== "running") {
    await ctx.db.patch(run._id, { status: "running", updatedAt: Date.now() });
  }
  const page = await ctx.db.query("plantsMaster").paginate({ cursor: pageCursor, numItems: limit });
  return { pageCursor, limit, alreadyCompleted: false as const, page };
}

async function runForwardPage(ctx: MigrationContext, run: MigrationRun, requestedCursor?: string) {
  await assertMigrationSingleton(ctx, run.runId);
  const pageState = await pageRun(ctx, run, requestedCursor);
  if (pageState.alreadyCompleted) {
    return {
      runId: run.runId,
      mode: run.mode,
      status: "completed" as const,
      scanned: 0,
      changed: 0,
      skipped: 0,
      nextCursor: null,
      isDone: true,
    };
  }

  let scanned = 0;
  let changed = 0;
  let skipped = 0;
  for (const row of pageState.page.page as Array<Record<string, unknown>>) {
    scanned += 1;
    const existingJournal = await journalForPlant(ctx, run.runId, row._id as Id<"plantsMaster">);
    if (existingJournal) {
      skipped += 1;
      continue;
    }
    const analysis = run.mode === "apply"
      ? await applyAnalysisFromProposal(ctx, run, row)
      : await analyzePlant(ctx, row);
    if (!analysis.changed || !analysis.afterFields) {
      skipped += 1;
      await writeJournal(ctx, {
        runId: run.runId,
        plantId: row._id as Id<"plantsMaster">,
        action: run.mode === "dry_run" ? "proposal" : "apply",
        status: "skipped",
        reason: analysis.reason,
        beforeRevision: analysis.beforeRevision,
        afterRevision: analysis.afterRevision,
        beforeFields: analysis.beforeFields,
      });
      continue;
    }

    // Dry-run pages do not patch the canonical index, so remember proposed
    // keys in the run journal and quarantine a second proposal even when its
    // legacy scientific display differs.
    const priorKeyJournal = await journalForCanonicalKey(
      ctx,
      run.runId,
      analysis.afterFields.canonicalKey ?? "",
    );
    if (priorKeyJournal && priorKeyJournal.plantId !== row._id) {
      skipped += 1;
      await writeJournal(ctx, {
        runId: run.runId,
        plantId: row._id as Id<"plantsMaster">,
        action: run.mode === "dry_run" ? "proposal" : "apply",
        status: "skipped",
        reason: "canonical_duplicate_in_run",
        beforeRevision: analysis.beforeRevision,
        afterRevision: analysis.afterRevision,
        beforeFields: analysis.beforeFields,
        afterFields: analysis.afterFields,
      });
      continue;
    }

    if (run.mode === "dry_run") {
      changed += 1;
      await writeJournal(ctx, {
        runId: run.runId,
        plantId: row._id as Id<"plantsMaster">,
        action: "proposal",
        status: "proposed",
        reason: analysis.reason,
        beforeRevision: analysis.beforeRevision,
        afterRevision: analysis.afterRevision,
        beforeFields: analysis.beforeFields,
        afterFields: analysis.afterFields,
      });
      continue;
    }

    const current = await ctx.db.get(row._id);
    if (!current || revisionOf(current) !== analysis.beforeRevision || !canonicalIdentityFieldsEqual(ownedFields(current), analysis.beforeFields)) {
      skipped += 1;
      await writeJournal(ctx, {
        runId: run.runId,
        plantId: row._id as Id<"plantsMaster">,
        action: "apply",
        status: "skipped",
        reason: "source_revision_changed",
        beforeRevision: analysis.beforeRevision,
        afterRevision: revisionOf(current ?? row),
        beforeFields: analysis.beforeFields,
        afterFields: analysis.afterFields,
      });
      continue;
    }
    const candidates = await canonicalCandidates(ctx, analysis.afterFields.canonicalKey ?? "");
    if (candidates.some((candidate: any) => candidate._id !== row._id)) {
      skipped += 1;
      await writeJournal(ctx, {
        runId: run.runId,
        plantId: row._id as Id<"plantsMaster">,
        action: "apply",
        status: "skipped",
        reason: "canonical_duplicate",
        beforeRevision: analysis.beforeRevision,
        afterRevision: analysis.beforeRevision,
        beforeFields: analysis.beforeFields,
        afterFields: analysis.afterFields,
      });
      continue;
    }
    await ctx.db.patch(row._id, canonicalIdentityFieldPatch(analysis.afterFields));
    await bumpReconciliationCatalog(ctx);
    changed += 1;
    await writeJournal(ctx, {
      runId: run.runId,
      plantId: row._id as Id<"plantsMaster">,
      action: "apply",
      status: "applied",
      reason: analysis.reason,
      beforeRevision: analysis.beforeRevision,
      afterRevision: analysis.beforeRevision,
      beforeFields: analysis.beforeFields,
      afterFields: analysis.afterFields,
    });
  }

  const nextCursor = pageState.page.isDone ? undefined : pageState.page.continueCursor;
  const nextStatus: MigrationStatus = pageState.page.isDone ? "completed" : "running";
  await ctx.db.patch(run._id, {
    status: nextStatus,
    ...(nextCursor ? { cursor: nextCursor } : {}),
    scanned: run.scanned + scanned,
    changed: run.changed + changed,
    skipped: run.skipped + skipped,
    updatedAt: Date.now(),
  });
  return {
    runId: run.runId,
    mode: run.mode,
    status: nextStatus,
    scanned,
    changed,
    skipped,
    nextCursor: nextCursor ?? null,
    isDone: pageState.page.isDone,
  };
}

export const backfillCanonicalIdentityPage = internalMutation({
  args: canonicalIdentityMigrationPageArgsValidator,
  returns: canonicalIdentityMigrationPageResultValidator,
  handler: async (ctx, args) => {
    const run = await getRun(ctx, normalizedRunId(args.runId));
    if (!run || (run.mode !== "dry_run" && run.mode !== "apply")) {
      fail("CANONICAL_MIGRATION_RUN_NOT_FOUND", "Forward page requires a dry_run or apply run");
    }
    if (args.limit !== undefined && boundedLimit(args.limit, run.limit) > run.limit) {
      fail("CANONICAL_MIGRATION_LIMIT_INVALID", "Page limit cannot exceed the run limit");
    }
    return await runForwardPage(ctx, run, args.cursor);
  },
});

async function runRollbackPage(ctx: MigrationContext, run: MigrationRun, requestedCursor?: string) {
  await assertMigrationSingleton(ctx, run.runId);
  if (!run.parentRunId) fail("CANONICAL_MIGRATION_PARENT_REQUIRED", "Rollback run has no apply parent");
  const parent = await getRun(ctx, run.parentRunId);
  if (!parent || parent.mode !== "apply" || parent.status !== "completed") {
    fail("CANONICAL_MIGRATION_ROLLBACK_TARGET_INVALID", "Rollback parent is not a completed apply run");
  }
  const pageCursor = assertCursor(run, requestedCursor);
  if (run.status === "completed") {
    return {
      runId: run.runId,
      mode: run.mode,
      status: "completed" as const,
      scanned: 0,
      changed: 0,
      skipped: 0,
      nextCursor: null,
      isDone: true,
    };
  }
  if (run.status !== "running") await ctx.db.patch(run._id, { status: "running", updatedAt: Date.now() });
  const page = await ctx.db
    .query("canonicalIdentityMigrationJournal")
    .withIndex("by_run", (q: any) => q.eq("runId", parent.runId))
    .paginate({ cursor: pageCursor, numItems: run.limit });
  let scanned = 0;
  let changed = 0;
  let skipped = 0;
  for (const journal of page.page as Array<Record<string, unknown>>) {
    if (journal.action !== "apply" || journal.status !== "applied" || !journal.beforeFields || !journal.afterFields) continue;
    scanned += 1;
    const existingRollback = await journalForPlant(ctx, run.runId, journal.plantId as Id<"plantsMaster">);
    if (existingRollback) {
      skipped += 1;
      continue;
    }
    const current = await ctx.db.get(journal.plantId);
    const currentFields = current ? ownedFields(current) : {};
    if (
      !current ||
      revisionOf(current) !== journal.afterRevision ||
      !canonicalIdentityFieldsEqual(currentFields, journal.afterFields as CanonicalIdentityFieldSnapshot)
    ) {
      skipped += 1;
      await writeJournal(ctx, {
        runId: run.runId,
        plantId: journal.plantId as Id<"plantsMaster">,
        action: "rollback",
        status: "skipped",
        reason: "source_revision_changed",
        beforeRevision: revisionOf(current ?? {}),
        afterRevision: revisionOf(current ?? {}),
        beforeFields: current ? currentFields : undefined,
        afterFields: journal.beforeFields as CanonicalIdentityFieldSnapshot,
      });
      continue;
    }
    await ctx.db.patch(journal.plantId, canonicalIdentityFieldPatch(journal.beforeFields as CanonicalIdentityFieldSnapshot));
    await bumpReconciliationCatalog(ctx);
    changed += 1;
    await writeJournal(ctx, {
      runId: run.runId,
      plantId: journal.plantId as Id<"plantsMaster">,
      action: "rollback",
      status: "rolled_back",
      reason: "run_owned_fields_restored",
      beforeRevision: journal.afterRevision,
      afterRevision: journal.afterRevision,
      beforeFields: journal.afterFields as CanonicalIdentityFieldSnapshot,
      afterFields: journal.beforeFields as CanonicalIdentityFieldSnapshot,
    });
  }
  const nextCursor = page.isDone ? undefined : page.continueCursor;
  const status: MigrationStatus = page.isDone ? "completed" : "running";
  await ctx.db.patch(run._id, {
    status,
    ...(nextCursor ? { cursor: nextCursor } : {}),
    scanned: run.scanned + scanned,
    changed: run.changed + changed,
    skipped: run.skipped + skipped,
    updatedAt: Date.now(),
  });
  return {
    runId: run.runId,
    mode: run.mode,
    status,
    scanned,
    changed,
    skipped,
    nextCursor: nextCursor ?? null,
    isDone: page.isDone,
  };
}

export const rollbackCanonicalIdentityPage = internalMutation({
  args: canonicalIdentityMigrationPageArgsValidator,
  returns: canonicalIdentityMigrationPageResultValidator,
  handler: async (ctx, args) => {
    const run = await getRun(ctx, normalizedRunId(args.runId));
    if (!run || run.mode !== "rollback") {
      fail("CANONICAL_MIGRATION_RUN_NOT_FOUND", "Rollback page requires a rollback run");
    }
    if (args.limit !== undefined && boundedLimit(args.limit, run.limit) > run.limit) {
      fail("CANONICAL_MIGRATION_LIMIT_INVALID", "Page limit cannot exceed the run limit");
    }
    return await runRollbackPage(ctx, run, args.cursor);
  },
});

export const readbackCanonicalIdentityMigration = internalQuery({
  args: canonicalIdentityMigrationReadbackArgsValidator,
  returns: canonicalIdentityMigrationReadbackResultValidator,
  handler: async (ctx, args) => {
    const run = await getRun(ctx, normalizedRunId(args.runId));
    if (!run) fail("CANONICAL_MIGRATION_RUN_NOT_FOUND", "Migration run was not found");
    const limit = boundedLimit(args.limit, run.limit);
    const page = await ctx.db
      .query("canonicalIdentityMigrationJournal")
      .withIndex("by_run", (q: any) => q.eq("runId", run.runId))
      .paginate({ cursor: args.cursor ?? null, numItems: limit });
    const mismatches: Array<{ plantId: Id<"plantsMaster">; reason: string }> = [];
    let checked = 0;
    for (const journal of page.page as Array<Record<string, unknown>>) {
      if (!journal.beforeFields || !journal.afterFields) continue;
      if (journal.status === "skipped") continue;
      checked += 1;
      const plant = await ctx.db.get(journal.plantId as Id<"plantsMaster">);
      const expected = run.mode === "dry_run"
        ? journal.beforeFields as CanonicalIdentityFieldSnapshot
        : journal.afterFields as CanonicalIdentityFieldSnapshot;
      if (!plant || !canonicalIdentityFieldsEqual(ownedFields(plant), expected)) {
        mismatches.push({
          plantId: journal.plantId as Id<"plantsMaster">,
          reason: run.mode === "dry_run" ? "dry_run_changed_data" : "canonical_fields_mismatch",
        });
      }
    }
    return {
      runId: run.runId,
      mode: run.mode,
      checked,
      mismatches,
      nextCursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
      healthy: mismatches.length === 0,
    };
  },
});
