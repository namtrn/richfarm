import { v } from "convex/values";

/** The one metadata document that gates the complete master-data snapshot. */
export const RECONCILIATION_CATALOG_KEY = "master";

export const catalogCountsValidator = v.object({
  plants: v.number(),
  i18n: v.number(),
  /** Localized pest/disease detail rows are not plant i18n. */
  pestDiseaseI18n: v.number(),
  care: v.number(),
  geography: v.number(),
  adaptation: v.number(),
  propagation: v.number(),
  externalIdentities: v.number(),
  relationships: v.number(),
});

export const catalogMetadataValidator = v.object({
  key: v.string(),
  revision: v.number(),
  initialized: v.boolean(),
  expectedCounts: catalogCountsValidator,
  expectedCount: v.number(),
  updatedAt: v.number(),
});

export type ReconciliationCatalogCounts = {
  plants: number;
  i18n: number;
  pestDiseaseI18n: number;
  care: number;
  geography: number;
  adaptation: number;
  propagation: number;
  externalIdentities: number;
  relationships: number;
};

export type ReconciliationCatalogDelta = Partial<ReconciliationCatalogCounts>;

type CatalogDbContext = { db: any };
type CatalogTable = {
  name: string;
  category: keyof ReconciliationCatalogCounts;
  predicate?: (row: any) => boolean;
};

const COUNT_PAGE_SIZE = 500;
const ZERO_COUNTS: ReconciliationCatalogCounts = {
  plants: 0,
  i18n: 0,
  pestDiseaseI18n: 0,
  care: 0,
  geography: 0,
  adaptation: 0,
  propagation: 0,
  externalIdentities: 0,
  relationships: 0,
};

/** Exactly one table/page is read per initialization mutation invocation. */
const CATALOG_TABLES: readonly CatalogTable[] = [
  { name: "plantsMaster", category: "plants" },
  { name: "plantI18n", category: "i18n" },
  { name: "plantCareI18n", category: "i18n" },
  { name: "plantTaxonomyI18n", category: "i18n" },
  // Keep pest/disease localization separate from the master plant i18n
  // category so a detail-content write cannot make a plant snapshot appear
  // complete while the pest catalog is stale.
  { name: "pestDiseaseI18n", category: "pestDiseaseI18n" },
  { name: "plantCare", category: "care" },
  {
    name: "plantCare",
    category: "propagation",
    predicate: (row) => Array.isArray(row.propagationMethods) && row.propagationMethods.length > 0,
  },
  { name: "plantOriginCountries", category: "geography" },
  { name: "plantProvenRegions", category: "geography" },
  { name: "plantAdaptationTerms", category: "geography" },
  { name: "adaptationTerms", category: "adaptation" },
  { name: "adaptationTermI18n", category: "adaptation" },
  { name: "plantExternalIdentities", category: "externalIdentities" },
  { name: "plantRelations", category: "relationships" },
];

function addCounts(
  left: ReconciliationCatalogCounts,
  right: ReconciliationCatalogDelta,
): ReconciliationCatalogCounts {
  const result = { ...left };
  for (const [rawKey, rawDelta] of Object.entries(right)) {
    const key = rawKey as keyof ReconciliationCatalogCounts;
    if (!(key in result)) throw new Error(`CATALOG_DELTA_UNKNOWN:${rawKey}`);
    if (!Number.isSafeInteger(rawDelta)) throw new Error(`CATALOG_DELTA_INVALID:${rawKey}`);
    const next = result[key] + (rawDelta ?? 0);
    if (next < 0) throw new Error(`CATALOG_COUNT_NEGATIVE:${rawKey}`);
    result[key] = next;
  }
  return result;
}

function countPageRows(table: CatalogTable, rows: readonly any[]): ReconciliationCatalogDelta {
  const count = table.predicate ? rows.filter(table.predicate).length : rows.length;
  return { [table.category]: count } as ReconciliationCatalogDelta;
}

async function readMetadataRow(ctx: CatalogDbContext): Promise<any | null> {
  const rows = await ctx.db
    .query("syncCatalogMetadata")
    .withIndex("by_key", (q: any) => q.eq("key", RECONCILIATION_CATALOG_KEY))
    .take(2);
  if (rows.length > 1) throw new Error("CATALOG_METADATA_DUPLICATE");
  return rows[0] ?? null;
}

export async function readReconciliationCatalogMetadata(ctx: CatalogDbContext): Promise<any | null> {
  const row = await readMetadataRow(ctx);
  if (!row) return null;
  const expectedCounts = row.expectedCounts as ReconciliationCatalogCounts;
  if (!expectedCounts || !Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error("CATALOG_METADATA_INVALID");
  }
  return {
    key: RECONCILIATION_CATALOG_KEY,
    revision: row.revision,
    initialized: row.initialized === true,
    expectedCounts,
    expectedCount: expectedCounts.plants,
    updatedAt: row.updatedAt,
  };
}

function metadataResult(row: any): any {
  const expectedCounts = row.expectedCounts as ReconciliationCatalogCounts;
  return {
    key: RECONCILIATION_CATALOG_KEY,
    revision: row.revision,
    initialized: row.initialized === true,
    expectedCounts,
    expectedCount: expectedCounts.plants,
    updatedAt: row.updatedAt,
  };
}

/**
 * Advance one bounded initialization page. Convex permits only one paginate
 * call per function invocation, so state is persisted between calls. A
 * concurrent routed writer changes `revision`; the next call discards the
 * partial counts and restarts from table zero before reading another page.
 */
export async function rebuildReconciliationCatalog(ctx: CatalogDbContext): Promise<any> {
  const metadata = await readMetadataRow(ctx);
  if (!metadata) {
    const created = {
      key: RECONCILIATION_CATALOG_KEY,
      revision: 1,
      initialized: false,
      expectedCounts: { ...ZERO_COUNTS },
      initialization: {
        tableIndex: 0,
        cursor: undefined,
        partialCounts: { ...ZERO_COUNTS },
        baseRevision: 1,
      },
      updatedAt: Date.now(),
    };
    await ctx.db.insert("syncCatalogMetadata", created);
    return metadataResult(created);
  }

  if (metadata.initialized === true) {
    const restarted = {
      initialized: false,
      expectedCounts: { ...ZERO_COUNTS },
      initialization: {
        tableIndex: 0,
        cursor: undefined,
        partialCounts: { ...ZERO_COUNTS },
        baseRevision: metadata.revision + 1,
      },
      revision: metadata.revision + 1,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(metadata._id, restarted);
    return metadataResult({ ...metadata, ...restarted });
  }

  const state = metadata.initialization;
  if (!state || !Number.isInteger(state.tableIndex) || state.tableIndex < 0 || state.tableIndex > CATALOG_TABLES.length) {
    const started = {
      initialized: false,
      expectedCounts: { ...ZERO_COUNTS },
      initialization: {
        tableIndex: 0,
        cursor: undefined,
        partialCounts: { ...ZERO_COUNTS },
        baseRevision: metadata.revision,
      },
      updatedAt: Date.now(),
    };
    await ctx.db.patch(metadata._id, started);
    return metadataResult({ ...metadata, ...started });
  }

  if (metadata.revision !== state.baseRevision) {
    const restarted = {
      initialized: false,
      expectedCounts: { ...ZERO_COUNTS },
      initialization: {
        tableIndex: 0,
        cursor: undefined,
        partialCounts: { ...ZERO_COUNTS },
        baseRevision: metadata.revision,
      },
      updatedAt: Date.now(),
    };
    await ctx.db.patch(metadata._id, restarted);
    return metadataResult({ ...metadata, ...restarted });
  }

  if (state.tableIndex === CATALOG_TABLES.length) {
    const completed = {
      initialized: true,
      expectedCounts: state.partialCounts,
      initialization: undefined,
      revision: metadata.revision + 1,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(metadata._id, completed);
    return metadataResult({ ...metadata, ...completed });
  }

  const table = CATALOG_TABLES[state.tableIndex];
  const page: any = await ctx.db
    .query(table.name)
    .paginate({ cursor: state.cursor ?? null, numItems: COUNT_PAGE_SIZE });
  const partialCounts = addCounts(state.partialCounts as ReconciliationCatalogCounts, countPageRows(table, page.page));
  if (!page.isDone) {
    const nextCursor: string = String(page.continueCursor ?? "").trim();
    if (!nextCursor || nextCursor === state.cursor) throw new Error(`CATALOG_COUNT_CURSOR_INVALID:${table.name}`);
    const nextState = {
      tableIndex: state.tableIndex,
      cursor: nextCursor,
      partialCounts,
      baseRevision: state.baseRevision,
    };
    await ctx.db.patch(metadata._id, { initialization: nextState, updatedAt: Date.now() });
    return metadataResult({ ...metadata, initialization: nextState });
  }

  const nextState = {
    tableIndex: state.tableIndex + 1,
    cursor: undefined,
    partialCounts,
    baseRevision: state.baseRevision,
  };
  await ctx.db.patch(metadata._id, { initialization: nextState, updatedAt: Date.now() });
  return metadataResult({ ...metadata, initialization: nextState });
}

/** Advance the shared freshness revision in the caller's mutation. */
export async function bumpReconciliationCatalog(
  ctx: CatalogDbContext,
  delta: ReconciliationCatalogDelta = {},
): Promise<any> {
  const existing = await readMetadataRow(ctx);
  if (!existing) {
    const hasNegativeDelta = Object.values(delta).some((value) => (value ?? 0) < 0);
    const created = {
      key: RECONCILIATION_CATALOG_KEY,
      revision: 1,
      initialized: false,
      expectedCounts: hasNegativeDelta ? { ...ZERO_COUNTS } : addCounts(ZERO_COUNTS, delta),
      initialization: undefined,
      updatedAt: Date.now(),
    };
    await ctx.db.insert("syncCatalogMetadata", created);
    return metadataResult(created);
  }

  let expectedCounts: ReconciliationCatalogCounts;
  try {
    expectedCounts = addCounts(existing.expectedCounts as ReconciliationCatalogCounts, delta);
  } catch (error) {
    // Partial initialization counts are intentionally untrusted. A delete
    // or replacement can legitimately underflow that partial view; the next
    // initializer call will discard it after observing this revision bump.
    if (existing.initialized === true) throw error;
    expectedCounts = existing.expectedCounts as ReconciliationCatalogCounts;
  }
  const payload = {
    revision: existing.revision + 1,
    expectedCounts,
    initialized: existing.initialized === true,
    updatedAt: Date.now(),
  };
  await ctx.db.patch(existing._id, payload);
  return metadataResult({ ...existing, ...payload });
}
