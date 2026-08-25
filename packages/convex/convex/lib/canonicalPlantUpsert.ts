/**
 * The single Convex write boundary for plantsMaster.
 *
 * Legacy documents are intentionally still readable and may omit canonical
 * fields. New writes, and writes that match an existing legacy source row,
 * must pass through this module so canonical uniqueness is checked before an
 * insert. The helper is transaction-local; callers keep their existing
 * care/content work in the same Convex mutation.
 */

import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ConvexError, v } from "convex/values";
import {
  extractLegacyCanonicalIdentityFields,
  normalizeCanonicalIdentityToken,
  validateCanonicalPlantIdentity,
  type CanonicalPlantIdentity,
  type CanonicalPlantIdentityInput,
} from "../../../shared/src/canonicalPlantIdentity";
import { bumpReconciliationCatalog } from "./reconciliationCatalog";

const nullableString = v.union(v.string(), v.null());
const nullableParentId = v.union(v.id("plantsMaster"), v.null());

/** Explicit structured identity accepted by the internal boundary. */
export const canonicalPlantIdentityValidator = v.object({
  genus: v.string(),
  species: v.string(),
  rank: nullableString,
  infraspecificName: nullableString,
  cultivar: nullableString,
  scope: v.union(v.literal("base"), v.literal("cultivar")),
  parentCanonicalKey: nullableString,
  parentMasterPlantId: nullableParentId,
});

export const canonicalPlantUpsertResultValidator = v.object({
  action: v.union(v.literal("created"), v.literal("existing")),
  plantId: v.id("plantsMaster"),
  canonicalKey: v.string(),
  identityVersion: v.string(),
  externalIdentityLinked: v.boolean(),
});

export const canonicalPlantUpsertArgsValidator = {
  identity: canonicalPlantIdentityValidator,
  // The caller owns the table-specific content payload. `v.any()` preserves
  // the existing seed/sync/admin contracts while the identity remains strict.
  plant: v.any(),
  sourceSystem: v.optional(v.string()),
  sourceId: v.optional(v.string()),
  existingPlantId: v.optional(v.id("plantsMaster")),
  updateFields: v.optional(v.any()),
};

export type ConvexCanonicalPlantIdentityInput = {
  genus: string;
  species: string;
  rank: string | null;
  infraspecificName: string | null;
  cultivar: string | null;
  scope: "base" | "cultivar";
  parentCanonicalKey?: string | null;
  parentMasterPlantId?: Id<"plantsMaster"> | null;
};

export type CanonicalPlantUpsertArgs = {
  identity: ConvexCanonicalPlantIdentityInput;
  plant: Record<string, unknown>;
  sourceSystem?: string;
  sourceId?: string;
  existingPlantId?: Id<"plantsMaster">;
  updateFields?: Record<string, unknown>;
};

type CanonicalDbContext = { db: any };

function canonicalError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new ConvexError({ code, message, ...(details ?? {}) });
}

function normalizedSource(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function identityForValidation(identity: ConvexCanonicalPlantIdentityInput): CanonicalPlantIdentityInput {
  return {
    genus: identity.genus,
    species: identity.species,
    rank: identity.rank,
    infraspecificName: identity.infraspecificName,
    cultivar: identity.cultivar,
    scope: identity.scope,
    parentCanonicalKey: identity.parentCanonicalKey ?? null,
    // Convex IDs are opaque strings. Parent linkage is checked against the
    // indexed parent row below; shared validation receives the key only.
    parentMasterPlantId: null,
  };
}

function baseIdentityForValidation(identity: ConvexCanonicalPlantIdentityInput): CanonicalPlantIdentityInput {
  return {
    genus: identity.genus,
    species: identity.species,
    rank: identity.rank,
    infraspecificName: identity.infraspecificName,
    cultivar: null,
    scope: "base",
    parentCanonicalKey: null,
    parentMasterPlantId: null,
  };
}

function normalizeIdentity(identity: ConvexCanonicalPlantIdentityInput): CanonicalPlantIdentity {
  let parentCanonicalKey = identity.parentCanonicalKey ?? null;
  if (identity.scope === "cultivar" && !parentCanonicalKey) {
    const base = validateCanonicalPlantIdentity(baseIdentityForValidation(identity));
    if (!base.ok) {
      canonicalError("CANONICAL_IDENTITY_INVALID", "Cultivar parent taxonomy is invalid", {
        issues: base.issues,
      });
    }
    parentCanonicalKey = base.canonicalKey;
  }

  const result = validateCanonicalPlantIdentity({
    ...identityForValidation(identity),
    parentCanonicalKey,
  });
  if (!result.ok) {
    canonicalError("CANONICAL_IDENTITY_INVALID", "Structured canonical identity is invalid", {
      identityCode: result.code,
      issues: result.issues,
    });
  }
  return result.identity;
}

/**
 * Build the strict identity used by existing trusted taxonomy writers.
 * Scientific names are accepted here only as the already structured
 * taxonomy field those writers have validated; localized/common names never
 * enter this helper. Infraspecific qualifiers are promoted to rank/name.
 */
export function canonicalIdentityFromTaxonomy(input: {
  scientificName: string;
  genus?: string | null;
  species?: string | null;
  cultivar?: string | null;
  parentCanonicalKey?: string | null;
  parentMasterPlantId?: Id<"plantsMaster"> | null;
}): ConvexCanonicalPlantIdentityInput {
  const extracted = extractLegacyCanonicalIdentityFields({
    scientific_name: input.scientificName,
    cultivar: input.cultivar,
  });
  const genus = input.genus?.trim() || extracted.genus;
  const species = input.species?.trim() || extracted.species;
  if (!genus || !species) {
    canonicalError("CANONICAL_IDENTITY_INCOMPLETE", "Structured genus and species are required");
  }

  const rank = extracted.rank ?? null;
  const infraspecificName = extracted.infraspecificName ?? null;
  const cultivar = extracted.cultivar ?? null;
  const scope = cultivar ? "cultivar" : "base";
  let parentCanonicalKey = input.parentCanonicalKey ?? null;
  if (scope === "cultivar" && !parentCanonicalKey) {
    const base = validateCanonicalPlantIdentity({
      genus,
      species,
      rank,
      infraspecificName,
      cultivar: null,
      scope: "base",
      parentCanonicalKey: null,
      parentMasterPlantId: null,
    });
    if (!base.ok) {
      canonicalError("CANONICAL_IDENTITY_PARENT_INVALID", "Cannot derive cultivar parent identity", {
        issues: base.issues,
      });
    }
    parentCanonicalKey = base.canonicalKey;
  }

  // Validate once at the producer boundary as well as inside the writer.
  normalizeIdentity({
    genus,
    species,
    rank,
    infraspecificName,
    cultivar,
    scope,
    parentCanonicalKey,
    parentMasterPlantId: input.parentMasterPlantId ?? null,
  });
  return {
    genus,
    species,
    rank,
    infraspecificName,
    cultivar,
    scope,
    parentCanonicalKey,
    parentMasterPlantId: input.parentMasterPlantId ?? null,
  };
}

export type CanonicalIdentityFieldSnapshot = {
  genus?: string;
  species?: string;
  cultivar?: string;
  canonicalIdentityVersion?: string;
  canonicalKey?: string;
  infraspecificRank?: "subsp" | "var" | "f";
  infraspecificName?: string;
  identityScope?: "base" | "cultivar";
  parentCanonicalKey?: string;
  parentMasterPlantId?: Id<"plantsMaster">;
};

export function canonicalIdentityFieldsForStorage(
  identity: CanonicalPlantIdentity,
  parentMasterPlantId?: Id<"plantsMaster"> | null,
  displayFields?: Record<string, unknown>,
) {
  return {
    genus: typeof displayFields?.genus === "string" ? displayFields.genus : identity.genus,
    species: typeof displayFields?.species === "string" ? displayFields.species : identity.species,
    cultivar: Object.prototype.hasOwnProperty.call(displayFields ?? {}, "cultivar")
      ? displayFields?.cultivar
      : identity.cultivar || undefined,
    canonicalIdentityVersion: identity.identityVersion,
    canonicalKey: identity.canonicalKey,
    infraspecificRank: identity.rank || undefined,
    infraspecificName: identity.infraspecificName || undefined,
    identityScope: identity.scope,
    parentCanonicalKey: identity.parentCanonicalKey || undefined,
    parentMasterPlantId: parentMasterPlantId ?? undefined,
  };
}

export function canonicalIdentityFieldSnapshot(row: Record<string, unknown>): CanonicalIdentityFieldSnapshot {
  return {
    ...(typeof row.genus === "string" ? { genus: row.genus } : {}),
    ...(typeof row.species === "string" ? { species: row.species } : {}),
    ...(typeof row.cultivar === "string" ? { cultivar: row.cultivar } : {}),
    ...(typeof row.canonicalIdentityVersion === "string"
      ? { canonicalIdentityVersion: row.canonicalIdentityVersion }
      : {}),
    ...(typeof row.canonicalKey === "string" ? { canonicalKey: row.canonicalKey } : {}),
    ...(row.infraspecificRank === "subsp" || row.infraspecificRank === "var" || row.infraspecificRank === "f"
      ? { infraspecificRank: row.infraspecificRank }
      : {}),
    ...(typeof row.infraspecificName === "string" ? { infraspecificName: row.infraspecificName } : {}),
    ...(row.identityScope === "base" || row.identityScope === "cultivar"
      ? { identityScope: row.identityScope }
      : {}),
    ...(typeof row.parentCanonicalKey === "string" ? { parentCanonicalKey: row.parentCanonicalKey } : {}),
    ...(row.parentMasterPlantId !== undefined && row.parentMasterPlantId !== null
      ? { parentMasterPlantId: row.parentMasterPlantId as Id<"plantsMaster"> }
      : {}),
  };
}

export function canonicalIdentityFieldsEqual(
  left: CanonicalIdentityFieldSnapshot,
  right: CanonicalIdentityFieldSnapshot,
): boolean {
  const keys: Array<keyof CanonicalIdentityFieldSnapshot> = [
    "genus",
    "species",
    "cultivar",
    "canonicalIdentityVersion",
    "canonicalKey",
    "infraspecificRank",
    "infraspecificName",
    "identityScope",
    "parentCanonicalKey",
    "parentMasterPlantId",
  ];
  return keys.every((key) => left[key] === right[key]);
}

export function canonicalIdentityFieldPatch(snapshot: CanonicalIdentityFieldSnapshot): Record<string, unknown> {
  return {
    genus: snapshot.genus,
    species: snapshot.species,
    cultivar: snapshot.cultivar,
    canonicalIdentityVersion: snapshot.canonicalIdentityVersion,
    canonicalKey: snapshot.canonicalKey,
    infraspecificRank: snapshot.infraspecificRank,
    infraspecificName: snapshot.infraspecificName,
    identityScope: snapshot.identityScope,
    parentCanonicalKey: snapshot.parentCanonicalKey,
    parentMasterPlantId: snapshot.parentMasterPlantId,
  };
}

export function canonicalIdentityFromLegacyRow(row: Record<string, unknown>): CanonicalPlantIdentity | null {
  const fields = extractLegacyCanonicalIdentityFields(row);
  if (!fields.genus || !fields.species) return null;
  let parentCanonicalKey = fields.parentCanonicalKey;
  if (fields.scope === "cultivar" && !parentCanonicalKey) {
    const base = validateCanonicalPlantIdentity({
      genus: fields.genus,
      species: fields.species,
      rank: fields.rank,
      infraspecificName: fields.infraspecificName,
      cultivar: null,
      scope: "base",
      parentCanonicalKey: null,
      parentMasterPlantId: null,
    });
    if (!base.ok) return null;
    parentCanonicalKey = base.canonicalKey;
  }
  const result = validateCanonicalPlantIdentity({
    genus: fields.genus,
    species: fields.species,
    rank: fields.rank,
    infraspecificName: fields.infraspecificName,
    cultivar: fields.cultivar,
    scope: fields.scope,
    parentCanonicalKey,
    parentMasterPlantId: null,
  });
  return result.ok ? result.identity : null;
}

async function findCanonicalCandidates(ctx: CanonicalDbContext, canonicalKey: string) {
  return await ctx.db
    .query("plantsMaster")
    .withIndex("by_canonical_key", (q: any) => q.eq("canonicalKey", canonicalKey))
    .take(2);
}

async function findLegacyCandidates(ctx: CanonicalDbContext, scientificName: string) {
  if (!scientificName.trim()) return [];
  return await ctx.db
    .query("plantsMaster")
    .withIndex("by_scientific_name", (q: any) => q.eq("scientificName", scientificName))
    .take(2);
}

async function findSourceRow(ctx: CanonicalDbContext, sourceSystem?: string, sourceId?: string) {
  if (!sourceSystem || !sourceId) return null;
  const rows = await ctx.db
    .query("plantsMaster")
    .withIndex("by_source_identity", (q: any) => q.eq("sourceSystem", sourceSystem).eq("sourceId", sourceId))
    .take(2);
  if (rows.length > 1) {
    canonicalError("CANONICAL_SOURCE_DUPLICATE", "Multiple plants share the source identity", {
      sourceSystem,
      sourceId,
      plantIds: rows.map((row: any) => row._id),
    });
  }
  return rows[0] ?? null;
}

async function findExternalRow(ctx: CanonicalDbContext, sourceSystem?: string, sourceId?: string) {
  if (!sourceSystem || !sourceId) return null;
  const rows = await ctx.db
    .query("plantExternalIdentities")
    .withIndex("by_source_identity", (q: any) => q.eq("sourceSystem", sourceSystem).eq("sourceId", sourceId))
    .take(2);
  if (rows.length > 1) {
    canonicalError("CANONICAL_EXTERNAL_DUPLICATE", "Multiple external aliases share the source identity", {
      sourceSystem,
      sourceId,
      aliasIds: rows.map((row: any) => row._id),
    });
  }
  return rows[0] ?? null;
}

type CanonicalMigrationStatus = "planned" | "running";
type CanonicalMigrationMode = "dry_run" | "apply" | "rollback";

/**
 * Read every active migration mode through the composite index. Do not query
 * by status and filter mode after a bounded take: dry-run rows can otherwise
 * hide an apply/rollback row later in the same status range.
 */
export async function findCanonicalMigrationRunsByStatusAndMode(
  ctx: CanonicalDbContext,
  excludeRunId?: string,
): Promise<any[]> {
  const active: Array<[CanonicalMigrationStatus, CanonicalMigrationMode]> = [
    ["planned", "dry_run"],
    ["planned", "apply"],
    ["planned", "rollback"],
    ["running", "dry_run"],
    ["running", "apply"],
    ["running", "rollback"],
  ];
  const ranges = await Promise.all(active.map(([status, mode]) =>
    ctx.db
      .query("canonicalIdentityMigrationRuns")
      .withIndex("by_status_mode", (q: any) => q.eq("status", status).eq("mode", mode))
      .take(2),
  ));
  return ranges.flat().filter((run: any) => run.runId !== excludeRunId);
}

/** Migration apply/rollback owns a quiesced window for canonical writers. */
export async function assertCanonicalWriterAvailable(ctx: CanonicalDbContext): Promise<void> {
  const active = await findCanonicalMigrationRunsByStatusAndMode(ctx);
  const blocking = active.filter((run: any) => run.mode === "apply" || run.mode === "rollback");
  if (blocking.length > 1) {
    canonicalError("CANONICAL_MIGRATION_CONFLICT", "Multiple apply/rollback migrations are active", {
      runIds: blocking.map((run: any) => run.runId),
    });
  }
  if (blocking[0]) {
    canonicalError("CANONICAL_MIGRATION_ACTIVE", "Canonical plant writers are quiesced for migration", {
      runId: blocking[0].runId,
      mode: blocking[0].mode,
    });
  }
}

function withoutUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

/**
 * Indexed, idempotent plantsMaster upsert. Exactly two canonical candidates
 * are inspected; any second candidate is a blocking duplicate rather than a
 * best-effort winner. Legacy rows with the same derived identity are also
 * blocking unless the caller explicitly supplied that row as the target.
 */
export async function upsertCanonicalPlant(
  ctx: CanonicalDbContext,
  args: CanonicalPlantUpsertArgs,
): Promise<{
  action: "created" | "existing";
  plantId: Id<"plantsMaster">;
  canonicalKey: string;
  identityVersion: string;
  externalIdentityLinked: boolean;
}> {
  await assertCanonicalWriterAvailable(ctx);
  let identity = normalizeIdentity(args.identity);
  const sourceSystem = normalizedSource(args.sourceSystem ?? args.plant.sourceSystem);
  const sourceId = normalizedSource(args.sourceId ?? args.plant.sourceId);
  const sourceRow = await findSourceRow(ctx, sourceSystem, sourceId);
  const externalRow = await findExternalRow(ctx, sourceSystem, sourceId);
  // Resolve a legacy base before looking up the cultivar key. Older Convex
  // rows commonly stored `var./subsp.` in cultivar and had no canonicalKey;
  // treating that row as the parent preserves the existing display-base
  // contract while promoting its rank/name into the new identity.
  const legacyCandidates = await findLegacyCandidates(ctx, String(args.plant.scientificName ?? ""));
  let parentMasterPlantId: Id<"plantsMaster"> | undefined;
  if (identity.scope === "cultivar") {
    let parentCandidates = await findCanonicalCandidates(ctx, identity.parentCanonicalKey ?? "");
    let parent = parentCandidates.length === 1 ? parentCandidates[0] : null;
    if (!parent && parentCandidates.length === 0) {
      const legacyParents = legacyCandidates.filter((row: any) => {
        const legacyIdentity = canonicalIdentityFromLegacyRow(row as Record<string, unknown>);
        return legacyIdentity?.scope === "base"
          && legacyIdentity.genus === identity.genus
          && legacyIdentity.species === identity.species;
      });
      if (legacyParents.length === 1) {
        parent = legacyParents[0];
        const parentIdentity = canonicalIdentityFromLegacyRow(parent as Record<string, unknown>);
        if (parentIdentity) {
          const promoted = validateCanonicalPlantIdentity({
            genus: parentIdentity.genus,
            species: parentIdentity.species,
            rank: parentIdentity.rank,
            infraspecificName: parentIdentity.infraspecificName,
            cultivar: identity.cultivar,
            scope: "cultivar",
            parentCanonicalKey: parentIdentity.canonicalKey,
            parentMasterPlantId: null,
          });
          if (!promoted.ok) {
            canonicalError("CANONICAL_PARENT_INVALID", "Legacy parent taxonomy cannot validate the cultivar", {
              issues: promoted.issues,
              parentPlantId: parent._id,
            });
          }
          identity = promoted.identity;
          await ctx.db.patch(parent._id, canonicalIdentityFieldsForStorage(parentIdentity, null, parent as Record<string, unknown>));
          await bumpReconciliationCatalog(ctx);
        }
      }
    }
    parentCandidates = parent
      ? [parent]
      : await findCanonicalCandidates(ctx, identity.parentCanonicalKey ?? "");
    if (parentCandidates.length !== 1) {
      canonicalError("CANONICAL_PARENT_REQUIRED", "Cultivar identity requires exactly one canonical base parent", {
        parentCanonicalKey: identity.parentCanonicalKey,
        candidateCount: parentCandidates.length,
      });
    }
    parent = parentCandidates[0];
    if (parent.identityScope && parent.identityScope !== "base") {
      canonicalError("CANONICAL_PARENT_INVALID", "Cultivar parent must be a base plant", {
        parentPlantId: parent._id,
      });
    }
    parentMasterPlantId = parent._id;
    if (args.identity.parentMasterPlantId && String(args.identity.parentMasterPlantId) !== String(parent._id)) {
      canonicalError("CANONICAL_PARENT_MISMATCH", "Provided parent ID does not match the canonical parent", {
        parentMasterPlantId: args.identity.parentMasterPlantId,
        parentPlantId: parent._id,
      });
    }
  }

  const canonicalCandidates = await findCanonicalCandidates(ctx, identity.canonicalKey);
  if (canonicalCandidates.length > 1) {
    canonicalError("CANONICAL_DUPLICATE", "Multiple active plants share the canonical key", {
      canonicalKey: identity.canonicalKey,
      plantIds: canonicalCandidates.map((row: any) => row._id),
    });
  }

  const explicitId = args.existingPlantId;
  const canonicalRow = canonicalCandidates[0] ?? null;
  const explicitTarget = explicitId ? await ctx.db.get(explicitId) : null;
  if (explicitTarget?.canonicalKey && explicitTarget.canonicalKey !== identity.canonicalKey) {
    canonicalError("CANONICAL_IDENTITY_DRIFT", "Explicit target already has a different canonical identity", {
      plantId: explicitId,
      existingCanonicalKey: explicitTarget.canonicalKey,
      requestedCanonicalKey: identity.canonicalKey,
    });
  }
  const sourceRowKey = sourceRow?.canonicalKey
    ?? (sourceRow ? canonicalIdentityFromLegacyRow(sourceRow as Record<string, unknown>)?.canonicalKey : undefined);
  if (sourceRowKey && sourceRowKey !== identity.canonicalKey && sourceRow._id !== explicitId) {
    canonicalError("CANONICAL_SOURCE_CONFLICT", "Source identity points to a different canonical plant", {
      sourceSystem,
      sourceId,
      existingCanonicalKey: sourceRowKey,
      requestedCanonicalKey: identity.canonicalKey,
      plantId: sourceRow._id,
    });
  }
  if (externalRow) {
    const externalPlant = await ctx.db.get(externalRow.plantId);
    const externalKey = externalPlant?.canonicalKey;
    if (externalKey && externalKey !== identity.canonicalKey && externalRow.plantId !== explicitId) {
      canonicalError("CANONICAL_SOURCE_CONFLICT", "External identity points to a different canonical plant", {
        sourceSystem,
        sourceId,
        existingCanonicalKey: externalKey,
        requestedCanonicalKey: identity.canonicalKey,
        plantId: externalRow.plantId,
      });
    }
  }
  if (explicitId && canonicalRow && canonicalRow._id !== explicitId) {
    canonicalError("CANONICAL_DUPLICATE", "Canonical key belongs to another plant", {
      canonicalKey: identity.canonicalKey,
      plantId: canonicalRow._id,
    });
  }
  if (sourceRow && explicitId && sourceRow._id !== explicitId) {
    canonicalError("CANONICAL_SOURCE_CONFLICT", "Source identity belongs to another plant", {
      sourceSystem,
      sourceId,
      plantId: sourceRow._id,
    });
  }
  if (externalRow && explicitId && externalRow.plantId !== explicitId) {
    canonicalError("CANONICAL_SOURCE_CONFLICT", "External identity belongs to another plant", {
      sourceSystem,
      sourceId,
      plantId: externalRow.plantId,
    });
  }

  let target = explicitId
    ? explicitTarget
    : canonicalRow ?? sourceRow ?? (externalRow ? await ctx.db.get(externalRow.plantId) : null);
  if (explicitId && !target) {
    canonicalError("CANONICAL_TARGET_NOT_FOUND", "Explicit canonical upsert target was not found", {
      plantId: explicitId,
    });
  }

  for (const legacyRow of legacyCandidates) {
    if (target && legacyRow._id === target._id) continue;
    if (legacyRow.canonicalKey) continue;
    const legacyIdentity = canonicalIdentityFromLegacyRow(legacyRow as Record<string, unknown>);
    if (legacyIdentity?.canonicalKey === identity.canonicalKey) {
      canonicalError("CANONICAL_LEGACY_DUPLICATE", "A legacy plant already has this canonical identity", {
        canonicalKey: identity.canonicalKey,
        plantId: legacyRow._id,
      });
    }
  }

  const fields = canonicalIdentityFieldsForStorage(
    identity,
    parentMasterPlantId,
    args.updateFields ?? args.plant,
  );
  let action: "created" | "existing";
  let plantId: Id<"plantsMaster">;
  if (target) {
    plantId = target._id;
    await ctx.db.patch(plantId, {
      ...(args.updateFields ?? {}),
      ...fields,
    });
    action = "existing";
  } else {
    plantId = await ctx.db.insert("plantsMaster", withoutUndefined({
      ...args.plant,
      ...fields,
    }));
    action = "created";
  }

  let externalIdentityLinked = false;
  if (sourceSystem && sourceId) {
    if (externalRow && externalRow.plantId !== plantId && !externalRow.retiredAt) {
      canonicalError("CANONICAL_SOURCE_CONFLICT", "External identity is already active on another plant", {
        sourceSystem,
        sourceId,
        plantId: externalRow.plantId,
      });
    }
    if (externalRow && externalRow.plantId === plantId) {
      await ctx.db.patch(externalRow._id, { updatedAt: Date.now(), retiredAt: undefined });
      externalIdentityLinked = true;
    } else if (!externalRow) {
      const now = Date.now();
      await ctx.db.insert("plantExternalIdentities", {
        plantId,
        sourceSystem,
        sourceId,
        createdAt: now,
        updatedAt: now,
      });
      externalIdentityLinked = true;
    }
  }

  // The canonical plant and alias writes are part of the same Convex
  // mutation as the caller's content work. Advance the shared catalog
  // boundary here so backend sync, seed, and admin callers cannot bypass it.
  await bumpReconciliationCatalog(ctx, {
    plants: action === "created" ? 1 : 0,
    externalIdentities: externalIdentityLinked && !externalRow ? 1 : 0,
  });

  return {
    action,
    plantId,
    canonicalKey: identity.canonicalKey,
    identityVersion: identity.identityVersion,
    externalIdentityLinked,
  };
}

/** Internal callable surface for migration/admin orchestration. */
export const upsertCanonicalPlantInternal = internalMutation({
  args: canonicalPlantUpsertArgsValidator,
  returns: canonicalPlantUpsertResultValidator,
  handler: async (ctx, args) => upsertCanonicalPlant(ctx, args as CanonicalPlantUpsertArgs),
});

/** Stable token helper used by static routing tests and migration tooling. */
export function canonicalIdentityToken(value: unknown): string {
  return normalizeCanonicalIdentityToken(value);
}
