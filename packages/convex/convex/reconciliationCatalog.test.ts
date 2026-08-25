import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const serviceToken = "cid7-catalog-test-token";

function setup() {
  return convexTest(schema, modules);
}

async function initializeCatalog(t: ReturnType<typeof setup>) {
  let metadata: any = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    metadata = await t.mutation(api.masterSync.initializeCatalogMetadata, { serviceToken });
    if (metadata.initialized === true) return metadata;
  }
  throw new Error("catalog initialization did not reach terminal state");
}

type WriterOperation = {
  table: string;
  marker: string;
};

type WriterInventoryEntry = {
  path: string;
  tables: string[];
  operations: WriterOperation[];
};

/**
 * This is deliberately a production-only inventory. Convex fixtures seed
 * these tables directly in `*.test.ts` files and are not writer boundaries.
 * Keep every production operation listed here so a new bypass fails this
 * focused test before it can publish data without a catalog revision.
 */
const PRODUCTION_WRITER_INVENTORY: WriterInventoryEntry[] = [
  {
    path: "./masterSync.ts",
    tables: [
      "plantsMaster", "plantI18n", "plantCare", "plantCareI18n",
      "plantOriginCountries", "plantProvenRegions", "plantAdaptationTerms", "plantRelations",
    ],
    operations: [
      { table: "plantsMaster", marker: "ctx.db.delete(candidate._id)" },
      { table: "plantsMaster", marker: "ctx.db.patch(plant._id, patch)" },
      { table: "plantI18n", marker: "ctx.db.patch(existing._id, payload)" },
      { table: "plantI18n", marker: 'ctx.db.insert("plantI18n"' },
      { table: "plantI18n", marker: "ctx.db.delete(row._id)" },
      { table: "plantCareI18n", marker: "ctx.db.delete(row._id)" },
      { table: "plantCare", marker: "ctx.db.patch(careExisting._id" },
      { table: "plantCare", marker: 'ctx.db.insert("plantCare"' },
      { table: "plantCare", marker: "ctx.db.delete(careProfile._id)" },
      { table: "plantOriginCountries", marker: 'ctx.db.insert("plantOriginCountries"' },
      { table: "plantOriginCountries", marker: "ctx.db.delete(existing._id)" },
      { table: "plantProvenRegions", marker: 'ctx.db.insert("plantProvenRegions"' },
      { table: "plantProvenRegions", marker: "ctx.db.delete(existing._id)" },
      { table: "plantAdaptationTerms", marker: 'ctx.db.insert("plantAdaptationTerms"' },
      { table: "plantAdaptationTerms", marker: "ctx.db.delete(existing._id)" },
      { table: "plantRelations", marker: "ctx.db.delete(row._id)" },
    ],
  },
  {
    path: "./plantAdmin.ts",
    tables: [
      "plantsMaster", "plantI18n", "plantTaxonomyI18n", "plantCareI18n",
      "plantRelations", "adaptationTerms", "adaptationTermI18n",
    ],
    operations: [
      { table: "plantsMaster", marker: "ctx.db.patch(plantId, {" },
      { table: "plantsMaster", marker: "ctx.db.patch(plant._id, { basePlantId" },
      { table: "plantsMaster", marker: "ctx.db.delete(args.plantId)" },
      { table: "plantI18n", marker: 'ctx.db.insert("plantI18n"' },
      { table: "plantI18n", marker: "ctx.db.patch(args.rowId, {" },
      { table: "plantI18n", marker: "ctx.db.delete(args.rowId)" },
      { table: "plantI18n", marker: "ctx.db.delete(row._id)" },
      { table: "plantTaxonomyI18n", marker: 'ctx.db.insert("plantTaxonomyI18n"' },
      { table: "plantTaxonomyI18n", marker: "ctx.db.patch(existing._id, payload)" },
      { table: "plantTaxonomyI18n", marker: "ctx.db.delete(existing._id)" },
      { table: "plantCareI18n", marker: "ctx.db.patch(previousCare._id" },
      { table: "plantCareI18n", marker: "ctx.db.delete(matchingCare._id)" },
      { table: "plantRelations", marker: "ctx.db.delete((row as any)._id)" },
      { table: "adaptationTerms", marker: 'ctx.db.insert("adaptationTerms"' },
      { table: "adaptationTerms", marker: "ctx.db.patch(args.termId, {" },
      { table: "adaptationTerms", marker: "ctx.db.patch(args.termIds[index]" },
      { table: "adaptationTermI18n", marker: 'ctx.db.insert("adaptationTermI18n"' },
      { table: "adaptationTermI18n", marker: "ctx.db.patch(existing._id, payload)" },
    ],
  },
  {
    path: "./plantI18n.ts",
    tables: ["plantI18n"],
    operations: [
      { table: "plantI18n", marker: "ctx.db.patch(existing._id, {" },
      { table: "plantI18n", marker: 'ctx.db.insert("plantI18n"' },
      { table: "plantI18n", marker: "ctx.db.patch(existingI18n._id, {" },
      { table: "plantI18n", marker: "ctx.db.patch(row._id, { careContent" },
    ],
  },
  {
    path: "./seed.ts",
    tables: ["plantsMaster", "plantI18n", "plantTaxonomyI18n", "adaptationTerms", "adaptationTermI18n"],
    operations: [
      { table: "plantsMaster", marker: "ctx.db.patch(existing._id, {" },
      { table: "plantI18n", marker: 'ctx.db.insert("plantI18n"' },
      { table: "plantTaxonomyI18n", marker: 'ctx.db.insert("plantTaxonomyI18n"' },
      { table: "adaptationTerms", marker: 'ctx.db.insert("adaptationTerms"' },
      { table: "adaptationTermI18n", marker: 'ctx.db.insert("adaptationTermI18n"' },
    ],
  },
  {
    path: "./plantTaxonomyMigration.ts",
    tables: ["plantsMaster", "plantTaxonomyI18n", "plantI18n"],
    operations: [
      { table: "plantsMaster", marker: "ctx.db.patch(plant._id, patch)" },
      { table: "plantsMaster", marker: "ctx.db.replace((plant as any)._id, cleaned)" },
      { table: "plantsMaster", marker: "ctx.db.patch((plant as any)._id, {" },
      { table: "plantsMaster", marker: "ctx.db.delete(args.legacyId)" },
      { table: "plantTaxonomyI18n", marker: 'ctx.db.insert("plantTaxonomyI18n"' },
      { table: "plantTaxonomyI18n", marker: "ctx.db.patch(existing._id, {" },
      { table: "plantI18n", marker: 'ctx.db.insert("plantI18n"' },
      { table: "plantI18n", marker: "ctx.db.delete(row._id)" },
      { table: "plantCareI18n", marker: "ctx.db.delete(row._id)" },
    ],
  },
  {
    path: "./plantCareMigration.ts",
    tables: ["plantsMaster"],
    operations: [{ table: "plantsMaster", marker: "ctx.db.patch(row._id, clearPatch" }],
  },
  {
    path: "./plantPropagationMigration.ts",
    tables: ["plantsMaster"],
    operations: [{ table: "plantsMaster", marker: "ctx.db.patch(row._id, { source" }],
  },
  {
    path: "./plantCareContentMigration.ts",
    tables: ["plantCareI18n"],
    operations: [{ table: "plantCareI18n", marker: "ctx.db.patch(row._id, { careContent" }],
  },
  {
    path: "./plantMasterFieldMigration.ts",
    tables: ["plantsMaster"],
    operations: [{ table: "plantsMaster", marker: "ctx.db.patch(row._id, {" }],
  },
  {
    path: "./canonicalIdentityMigration.ts",
    tables: ["plantsMaster"],
    operations: [
      { table: "plantsMaster", marker: "ctx.db.patch(row._id, canonicalIdentityFieldPatch" },
      { table: "plantsMaster", marker: "ctx.db.patch(journal.plantId, canonicalIdentityFieldPatch" },
    ],
  },
  {
    path: "./plantTaxonomyChecks.ts",
    tables: ["plantsMaster"],
    operations: [
      { table: "plantsMaster", marker: "ctx.db.patch(plant._id, { family: currentFamilyNormalized" },
      { table: "plantsMaster", marker: "ctx.db.patch(plant._id, { family: consensusFamily" },
    ],
  },
  {
    path: "./careContentUpdatedAtMigration.ts",
    tables: ["plantCareI18n"],
    operations: [{ table: "plantCareI18n", marker: "ctx.db.patch(row._id, { contentUpdatedAt" }],
  },
  {
    path: "./plantImages.ts",
    tables: ["plantsMaster"],
    operations: [{ table: "plantsMaster", marker: "ctx.db.patch(args.plantId, { imageUrl" }],
  },
  {
    path: "./lib/canonicalPlantUpsert.ts",
    tables: ["plantsMaster", "plantExternalIdentities"],
    operations: [
      { table: "plantsMaster", marker: "ctx.db.patch(parent._id, canonicalIdentityFieldsForStorage" },
      { table: "plantsMaster", marker: "ctx.db.patch(plantId, {" },
      { table: "plantsMaster", marker: 'ctx.db.insert("plantsMaster"' },
      { table: "plantExternalIdentities", marker: "ctx.db.patch(externalRow._id," },
      { table: "plantExternalIdentities", marker: 'ctx.db.insert("plantExternalIdentities"' },
    ],
  },
  {
    path: "./lib/plantCare.ts",
    tables: ["plantCare", "plantCareI18n"],
    operations: [
      { table: "plantCare", marker: "ctx.db.patch(existing._id, doc)" },
      { table: "plantCare", marker: 'ctx.db.insert("plantCare"' },
      { table: "plantCareI18n", marker: "ctx.db.patch(existing._id, {" },
      { table: "plantCareI18n", marker: "ctx.db.delete(existing._id)" },
      { table: "plantCareI18n", marker: "ctx.db.patch(existing._id, payload)" },
      { table: "plantCareI18n", marker: 'ctx.db.insert("plantCareI18n"' },
    ],
  },
];

function matchingBrace(source: string, openingIndex: number): number {
  let depth = 0;
  let state: "code" | "single" | "double" | "template" | "line" | "block" = "code";
  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === "line") {
      if (character === "\n") state = "code";
      continue;
    }
    if (state === "block") {
      if (character === "*" && next === "/") {
        state = "code";
        index += 1;
      }
      continue;
    }
    if (state === "single" || state === "double" || state === "template") {
      if (character === "\\") {
        index += 1;
      } else if (
        (state === "single" && character === "'") ||
        (state === "double" && character === '"') ||
        (state === "template" && character === "`")
      ) {
        state = "code";
      }
      continue;
    }
    if (character === "/" && next === "/") {
      state = "line";
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      state = "block";
      index += 1;
      continue;
    }
    if (character === "'") {
      state = "single";
      continue;
    }
    if (character === '"') {
      state = "double";
      continue;
    }
    if (character === "`") {
      state = "template";
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function matchingPair(source: string, openingIndex: number, openingCharacter: string, closingCharacter: string): number {
  let depth = 0;
  let state: "code" | "single" | "double" | "template" | "line" | "block" = "code";
  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === "line") {
      if (character === "\n") state = "code";
      continue;
    }
    if (state === "block") {
      if (character === "*" && next === "/") {
        state = "code";
        index += 1;
      }
      continue;
    }
    if (state === "single" || state === "double" || state === "template") {
      if (character === "\\") {
        index += 1;
      } else if (
        (state === "single" && character === "'") ||
        (state === "double" && character === '"') ||
        (state === "template" && character === "`")
      ) {
        state = "code";
      }
      continue;
    }
    if (character === "/" && next === "/") {
      state = "line";
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      state = "block";
      index += 1;
      continue;
    }
    if (character === "'") {
      state = "single";
      continue;
    }
    if (character === '"') {
      state = "double";
      continue;
    }
    if (character === "`") {
      state = "template";
      continue;
    }
    if (character === openingCharacter) depth += 1;
    if (character === closingCharacter) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function bodyOpeningAfter(source: string, start: number, operationIndex: number): number {
  let cursor = start;
  while (cursor < operationIndex) {
    const opening = source.indexOf("{", cursor);
    if (opening < 0 || opening > operationIndex) return -1;
    if (matchingBrace(source, opening) > operationIndex) return opening;
    cursor = opening + 1;
  }
  return -1;
}

function enclosingFunctionBody(source: string, operationIndex: number): string | null {
  const starts = /(?:async\s+)?function\s+[A-Za-z0-9_$]+|handler\s*:\s*async/g;
  let bestOpening = -1;
  let bestClosing = -1;
  for (const match of source.matchAll(starts)) {
    const start = match.index ?? -1;
    if (start < 0 || start > operationIndex) break;
    let opening = -1;
    if (match[0].includes("handler")) {
      const arrow = source.indexOf("=>", start + match[0].length);
      opening = arrow < 0 ? -1 : bodyOpeningAfter(source, arrow + 2, operationIndex);
    } else {
      const parameters = source.indexOf("(", start + match[0].length);
      const parameterEnd = parameters < 0 ? -1 : matchingPair(source, parameters, "(", ")");
      opening = parameterEnd < 0 ? -1 : bodyOpeningAfter(source, parameterEnd + 1, operationIndex);
    }
    if (opening < 0 || opening > operationIndex) continue;
    const closing = matchingBrace(source, opening);
    if (closing > operationIndex && opening > bestOpening) {
      bestOpening = opening;
      bestClosing = closing;
    }
  }
  return bestClosing > bestOpening ? source.slice(bestOpening, bestClosing + 1) : null;
}

function allIndexes(source: string, marker: string): number[] {
  const indexes: number[] = [];
  let from = 0;
  while (from < source.length) {
    const index = source.indexOf(marker, from);
    if (index < 0) break;
    indexes.push(index);
    from = index + marker.length;
  }
  return indexes;
}

describe("CID-7 bounded Convex catalog snapshot", () => {
  const previousToken = process.env.CONVEX_ADMIN_FUNCTION_KEY;

  beforeEach(() => {
    process.env.CONVEX_ADMIN_FUNCTION_KEY = serviceToken;
  });

  afterEach(() => {
    if (previousToken === undefined) delete process.env.CONVEX_ADMIN_FUNCTION_KEY;
    else process.env.CONVEX_ADMIN_FUNCTION_KEY = previousToken;
  });

  it("returns bounded plant pages with a shared revision and category counts", async () => {
    const t = setup();
    const ids = await t.run(async (ctx) => {
      const first = await ctx.db.insert("plantsMaster", {
        scientificName: "Ocimum basilicum",
        group: "herbs",
        purposes: ["food"],
        genus: "Ocimum",
        species: "basilicum",
      });
      const second = await ctx.db.insert("plantsMaster", {
        scientificName: "Mentha spicata",
        group: "herbs",
        purposes: ["food"],
        genus: "Mentha",
        species: "spicata",
      });
      await ctx.db.insert("plantI18n", { plantId: first, locale: "en", commonName: "Basil" });
      await ctx.db.insert("plantCare", { plantId: first, propagationMethods: ["seed"] });
      await ctx.db.insert("plantCareI18n", { plantId: first, locale: "en", careContent: "## Care" });
      await ctx.db.insert("plantOriginCountries", { plantId: first, countryCode: "VN" });
      await ctx.db.insert("pestDiseaseI18n", {
        pestDiseaseKey: "aphids",
        locale: "en",
        name: "Aphids",
        detailContent: "## Aphids",
      });
      return { first, second };
    });

    await initializeCatalog(t);
    const metadata = await t.query(api.masterSync.getCatalogMetadata, { serviceToken });
    expect(metadata).toMatchObject({
      revision: 2,
      expectedCount: 2,
      expectedCounts: {
        plants: 2,
        i18n: 2,
        pestDiseaseI18n: 1,
        care: 1,
        geography: 1,
        propagation: 1,
      },
    });

    const firstPage = await t.query(api.masterSync.listPage, {
      serviceToken,
      locale: "en",
      cursor: null,
      limit: 1,
    });
    expect(firstPage.rows).toHaveLength(1);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.revision).toBe("2");
    expect(firstPage.expectedCount).toBe(2);
    expect(firstPage.expectedCounts).toEqual(metadata?.expectedCounts);
    expect(firstPage.rows[0]).toMatchObject({
      _id: ids.first,
      displayName: "Basil",
      originCountries: ["VN"],
      propagationMethods: ["seed"],
    });

    const secondPage = await t.query(api.masterSync.listPage, {
      serviceToken,
      locale: "en",
      cursor: firstPage.nextCursor,
      limit: 1,
    });
    expect(secondPage.rows).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
    expect(secondPage.revision).toBe(firstPage.revision);
    expect(secondPage.rows[0]).toMatchObject({ _id: ids.second });
  });

  it("advances revision and counts at the canonical plant/external-identity boundary", async () => {
    const t = setup();
    await initializeCatalog(t);
    const before = await t.query(api.masterSync.getCatalogMetadata, { serviceToken });
    const upsert = (internal as any).lib.canonicalPlantUpsert.upsertCanonicalPlantInternal;
    await t.mutation(upsert, {
      identity: {
        genus: "Ocimum",
        species: "basilicum",
        rank: null,
        infraspecificName: null,
        cultivar: null,
        scope: "base",
        parentCanonicalKey: null,
        parentMasterPlantId: null,
      },
      plant: {
        scientificName: "Ocimum basilicum",
        group: "herbs",
        purposes: ["food"],
        genus: "Ocimum",
        species: "basilicum",
      },
      sourceSystem: "cid7-test",
      sourceId: "ocimum-1",
    });
    const after = await t.query(api.masterSync.getCatalogMetadata, { serviceToken });
    expect(after?.revision).toBe((before?.revision ?? 0) + 1);
    expect(after?.expectedCounts.plants).toBe(1);
    expect(after?.expectedCounts.externalIdentities).toBe(1);
  });

  it("restarts partial counts after a routed writer changes the revision", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("plantsMaster", {
        scientificName: "Ocimum basilicum",
        group: "herbs",
        purposes: ["food"],
      });
    });
    await t.mutation(api.masterSync.initializeCatalogMetadata, { serviceToken });
    await t.mutation(api.masterSync.initializeCatalogMetadata, { serviceToken });

    const upsert = (internal as any).lib.canonicalPlantUpsert.upsertCanonicalPlantInternal;
    await t.mutation(upsert, {
      identity: {
        genus: "Mentha",
        species: "spicata",
        rank: null,
        infraspecificName: null,
        cultivar: null,
        scope: "base",
        parentCanonicalKey: null,
        parentMasterPlantId: null,
      },
      plant: {
        scientificName: "Mentha spicata",
        group: "herbs",
        purposes: ["food"],
        genus: "Mentha",
        species: "spicata",
      },
      sourceSystem: "cid7-test",
      sourceId: "mentha-1",
    });

    const restarted = await t.mutation(api.masterSync.initializeCatalogMetadata, { serviceToken });
    expect(restarted.initialized).toBe(false);
    await initializeCatalog(t);
    const metadata = await t.query(api.masterSync.getCatalogMetadata, { serviceToken });
    expect(metadata?.initialized).toBe(true);
    expect(metadata?.expectedCounts.plants).toBe(2);
  });
});

describe("CID-7 catalog routing audit", () => {
  it("keeps every master-sync write boundary coupled to the catalog bump", () => {
    const sourceFiles = [
      "./masterSync.ts",
      "./lib/canonicalPlantUpsert.ts",
      "./lib/plantCare.ts",
    ];
    for (const relativePath of sourceFiles) {
      const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
      expect(source, relativePath).toContain("bumpReconciliationCatalog");
    }

    const masterSync = readFileSync(fileURLToPath(new URL("./masterSync.ts", import.meta.url)), "utf8");
    for (const table of [
      "plantsMaster",
      "plantI18n",
      "plantCare",
      "plantCareI18n",
      "plantOriginCountries",
      "plantProvenRegions",
      "plantAdaptationTerms",
      "plantRelations",
    ]) {
      expect(masterSync, table).toContain(`\"${table}\"`);
    }
    expect(masterSync).toContain("initializeCatalogMetadata");
    expect(masterSync).toContain("listPage");
  });

  it("enumerates every production covered-table write and requires a same-boundary bump", () => {
    for (const entry of PRODUCTION_WRITER_INVENTORY) {
      // Fixtures are intentionally outside this inventory: only production
      // modules can bypass the catalog boundary at runtime.
      expect(entry.path, "fixture must not enter production inventory").not.toMatch(/\.test\.ts$/);
      const source = readFileSync(fileURLToPath(new URL(entry.path, import.meta.url)), "utf8");
      expect(source, `${entry.path}:missing catalog helper`).toContain("bumpReconciliationCatalog");

      for (const table of entry.tables) {
        expect(source, `${entry.path}:${table}:missing table reference`).toMatch(
          new RegExp(`[\\\"']${table}[\\\"']`),
        );
      }

      for (const operation of entry.operations) {
        const indexes = allIndexes(source, operation.marker);
        expect(indexes.length, `${entry.path}:${operation.table}:${operation.marker}`).toBeGreaterThan(0);
        for (const index of indexes) {
          const body = enclosingFunctionBody(source, index);
          expect(body, `${entry.path}:${operation.table}:${operation.marker}:no function boundary`).not.toBeNull();
          expect(body, `${entry.path}:${operation.table}:${operation.marker}:missing same-boundary bump`).toContain(
            "bumpReconciliationCatalog",
          );
        }
      }
    }
  });
});
