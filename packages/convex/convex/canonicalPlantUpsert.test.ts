import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import {
  canonicalIdentityFromTaxonomy,
} from "./lib/canonicalPlantUpsert";

const modules = import.meta.glob("./**/*.ts");
const canonicalUpsert = (internal as any).lib.canonicalPlantUpsert.upsertCanonicalPlantInternal;

function setup() {
  return convexTest(schema, modules);
}

function basePlant(overrides: Record<string, unknown> = {}) {
  return {
    scientificName: "Ocimum basilicum",
    group: "herbs",
    purposes: ["food"],
    genus: "Ocimum",
    species: "basilicum",
    ...overrides,
  };
}

function baseIdentity() {
  return {
    genus: "Ocimum",
    species: "basilicum",
    rank: null,
    infraspecificName: null,
    cultivar: null,
    scope: "base" as const,
    parentCanonicalKey: null,
    parentMasterPlantId: null,
  };
}

describe("Convex canonical plantsMaster write boundary", () => {
  it("is idempotent, indexes the canonical row, and records source aliases", async () => {
    const t = setup();
    const first = await t.mutation(canonicalUpsert, {
      identity: baseIdentity(),
      plant: basePlant({ sourceSystem: "seed", sourceId: "ocimum-1" }),
      sourceSystem: "seed",
      sourceId: "ocimum-1",
    });
    const second = await t.mutation(canonicalUpsert, {
      identity: baseIdentity(),
      plant: basePlant({ sourceSystem: "seed", sourceId: "ocimum-1" }),
      sourceSystem: "seed",
      sourceId: "ocimum-1",
    });

    expect(first).toMatchObject({ action: "created", externalIdentityLinked: true });
    expect(second).toMatchObject({ action: "existing", plantId: first.plantId });
    const state = await t.run(async (ctx) => ({
      plants: await ctx.db.query("plantsMaster").collect(),
      aliases: await ctx.db.query("plantExternalIdentities").collect(),
    }));
    expect(state.plants).toHaveLength(1);
    expect(state.plants[0]).toMatchObject({
      canonicalKey: first.canonicalKey,
      canonicalIdentityVersion: "canonical_identity_v1",
      identityScope: "base",
    });
    expect(state.aliases).toHaveLength(1);
    expect(state.aliases[0]).toMatchObject({
      plantId: first.plantId,
      sourceSystem: "seed",
      sourceId: "ocimum-1",
    });
  });

  it("links a cultivar to its indexed base parent", async () => {
    const t = setup();
    const base = await t.mutation(canonicalUpsert, {
      identity: baseIdentity(),
      plant: basePlant({ sourceSystem: "seed", sourceId: "ocimum-base" }),
      sourceSystem: "seed",
      sourceId: "ocimum-base",
    });
    const cultivarIdentity = canonicalIdentityFromTaxonomy({
      scientificName: "Ocimum basilicum",
      genus: "Ocimum",
      species: "basilicum",
      cultivar: "Genovese",
      parentMasterPlantId: base.plantId,
    });
    const cultivar = await t.mutation(canonicalUpsert, {
      identity: cultivarIdentity,
      plant: basePlant({ cultivar: "Genovese", sourceSystem: "seed", sourceId: "ocimum-genovese" }),
      sourceSystem: "seed",
      sourceId: "ocimum-genovese",
    });

    const row = await t.run(async (ctx) => ctx.db.get(cultivar.plantId));
    expect(row).toMatchObject({
      identityScope: "cultivar",
      parentMasterPlantId: base.plantId,
      parentCanonicalKey: base.canonicalKey,
    });
  });

  it("rejects a new canonical write when a matching legacy row is present", async () => {
    const t = setup();
    await t.run(async (ctx) => ctx.db.insert("plantsMaster", {
      scientificName: "Ocimum basilicum",
      genus: "Ocimum",
      species: "basilicum",
      group: "herbs",
      purposes: ["food"],
      sourceSystem: "legacy",
      sourceId: "legacy-1",
    }));

    await expect(t.mutation(canonicalUpsert, {
      identity: baseIdentity(),
      plant: basePlant({ sourceSystem: "seed", sourceId: "new-1" }),
      sourceSystem: "seed",
      sourceId: "new-1",
    })).rejects.toThrow(/CANONICAL_LEGACY_DUPLICATE|legacy plant already has/i);
  });

  it("rejects duplicate source rows and duplicate external aliases instead of choosing first", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("plantsMaster", {
        ...basePlant({ sourceSystem: "sqlite", sourceId: "duplicate-source" }),
      } as any);
      await ctx.db.insert("plantsMaster", {
        ...basePlant({ sourceSystem: "sqlite", sourceId: "duplicate-source" }),
      } as any);
    });
    await expect(t.mutation(canonicalUpsert, {
      identity: baseIdentity(),
      plant: basePlant({ sourceSystem: "sqlite", sourceId: "duplicate-source" }),
      sourceSystem: "sqlite",
      sourceId: "duplicate-source",
    })).rejects.toThrow(/CANONICAL_SOURCE_DUPLICATE|multiple plants/i);

    const aliasState = await t.run(async (ctx) => {
      const plantId = await ctx.db.insert("plantsMaster", {
        ...basePlant({ sourceSystem: "alias-owner", sourceId: "owner" }),
        canonicalIdentityVersion: "canonical_identity_v1",
        canonicalKey: '["v1","ocimum","basilicum","","",""]',
        identityScope: "base",
      } as any);
      await ctx.db.insert("plantExternalIdentities", {
        plantId,
        sourceSystem: "legacy-alias",
        sourceId: "same-alias",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("plantExternalIdentities", {
        plantId,
        sourceSystem: "legacy-alias",
        sourceId: "same-alias",
        createdAt: 2,
        updatedAt: 2,
      });
      return plantId;
    });
    await expect(t.mutation(canonicalUpsert, {
      identity: baseIdentity(),
      plant: basePlant({ sourceSystem: "legacy-alias", sourceId: "same-alias" }),
      sourceSystem: "legacy-alias",
      sourceId: "same-alias",
    })).rejects.toThrow(/CANONICAL_EXTERNAL_DUPLICATE|multiple external/i);
    expect(aliasState).toBeDefined();
  });

  it("keeps every production plantsMaster insert behind the boundary", () => {
    for (const relativePath of ["masterSync.ts", "plantAdmin.ts", "seed.ts", "plantI18n.ts"]) {
      const source = readFileSync(
        fileURLToPath(new URL(`./${relativePath}`, import.meta.url)),
        "utf8",
      );
      expect(source, relativePath).toContain("upsertCanonicalPlant");
      expect(source, relativePath).not.toMatch(/(?:ctx|context)\.db\.insert\(["']plantsMaster["']/);
    }
  });

  it("routes taxonomy/source updates through the canonical boundary", () => {
    const adminSource = readFileSync(
      fileURLToPath(new URL("./plantAdmin.ts", import.meta.url)),
      "utf8",
    );
    const i18nSource = readFileSync(
      fileURLToPath(new URL("./plantI18n.ts", import.meta.url)),
      "utf8",
    );
    expect(adminSource).toContain("updateFields: plantPatch");
    expect(adminSource).not.toMatch(/ctx\.db\.patch\(args\.plantId,\s*\{/);
    expect(i18nSource).toContain("updateFields: updates");
    expect(i18nSource).not.toContain("ctx.db.patch(existing._id, updates)");
  });
});
