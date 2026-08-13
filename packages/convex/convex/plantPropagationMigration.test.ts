import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const serviceToken = "propagation-migration-test-token";
// The generated API snapshot is refreshed by `convex dev`; this mutation is
// intentionally covered here even when the local snapshot predates the file.
const migrationApi = (api as any).plantPropagationMigration;

function setup() {
  return convexTest(schema, modules);
}

async function insertLegacyPlant(
  t: ReturnType<typeof setup>,
  suffix: string,
  fields: Record<string, unknown> = {},
) {
  return await t.run(async (ctx) => await ctx.db.insert("plantsMaster", {
    scientificName: `Ocimum basilicum ${suffix}`,
    genus: "Ocimum",
    species: "basilicum",
    group: "herbs",
    purposes: ["food"],
    source: "seed",
    ...fields,
  } as any));
}

function backendRow(scientificName: string, sourceId: string) {
  return {
    id: 101,
    plant_code: "OCIMUM_BASILICUM",
    common_name: "Basil",
    scientific_name: scientificName,
    source_system: "sqlite",
    source_id: sourceId,
    record_version: 1,
    category: "herb",
    group: "herbs",
    family: "Lamiaceae",
    purposes: ["food"],
    growth_stage: "seedling",
    typical_days_to_harvest: null,
    germination_days: null,
    watering_frequency_days: null,
    fertilizing_frequency_days: null,
    soil_ph_min: null,
    soil_ph_max: null,
    moisture_target: null,
    light_hours: null,
    light_requirements: null,
    spacing_cm: null,
    max_plants_per_m2: null,
    seed_rate_per_m2: null,
    water_liters_per_m2: null,
    yield_kg_per_m2: null,
    image_url: null,
    is_active: true,
    notes: null,
    source_url: null,
    content_status: "published" as const,
    content_version: 1,
    review_status: "unreviewed" as const,
    reviewed_at: null,
    reviewed_by: null,
    i18n: {},
    created_at: null,
    updated_at: null,
  };
}

describe("legacy propagation and care migrations", () => {
  beforeEach(() => {
    process.env.CONVEX_ADMIN_FUNCTION_KEY = serviceToken;
  });

  it("copies all legacy care fields, including zero values, before cleanup", async () => {
    const t = setup();
    const plantId = await insertLegacyPlant(t, "care", {
      soilPhMin: 0,
      soilPhMax: 6.8,
      moistureTarget: 0,
      lightHours: 0,
    });

    const report = await t.mutation(api.plantCareMigration.migratePlantMasterCareProfile, {
      serviceToken,
      dryRun: false,
    } as any);
    expect(report.migrated).toBe(1);
    expect(report.cleaned).toBe(1);
    expect(report.remaining).toBe(0);

    const state = await t.run(async (ctx) => ({
      plant: await ctx.db.get(plantId),
      care: await ctx.db.query("plantCare").withIndex("by_plant", (q) => q.eq("plantId", plantId)).unique(),
    }));
    expect(state.care).toMatchObject({
      soilPhMin: 0,
      soilPhMax: 6.8,
      moistureTarget: 0,
      lightHours: 0,
    });
    expect((state.plant as any).soilPhMin).toBeUndefined();
    expect((state.plant as any).moistureTarget).toBeUndefined();
  });

  it("does not mutate when dryRun is omitted, defaulting to dry-run", async () => {
    const t = setup();
    const plantId = await insertLegacyPlant(t, "care-safeguard", {
      soilPhMin: 5.5,
      soilPhMax: 6.8,
    });

    const report = await t.mutation(api.plantCareMigration.migratePlantMasterCareProfile, {
      serviceToken,
    } as any);
    expect(report.dryRun).toBe(true);
    expect(report.migrated).toBe(0);
    expect(report.cleaned).toBe(0);
    expect(report.remaining).toBe(1);

    const state = await t.run(async (ctx) => ({
      plant: await ctx.db.get(plantId),
      care: await ctx.db.query("plantCare").withIndex("by_plant", (q) => q.eq("plantId", plantId)).unique(),
    }));
    expect((state.plant as any).soilPhMin).toBe(5.5);
    expect(state.care).toBeNull();
  });

  it("does not stamp incoming backend identity onto an unmigrated legacy row", async () => {
    const t = setup();
    const scientificName = "Ocimum basilicum legacy-sync";
    const plantId = await insertLegacyPlant(t, "legacy-sync", {
      scientificName,
    });

    const result = await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow(scientificName, "incoming-identity"),
    } as any);
    expect(result.action).toBe("updated");

    const row = await t.run(async (ctx) => await ctx.db.get(plantId));
    expect(row?.source).toBe("seed");
    expect((row as any)?.sourceSystem).toBeUndefined();
    expect((row as any)?.sourceId).toBeUndefined();
  });

  it("leaves conflicting legacy values for review instead of overwriting care", async () => {
    const t = setup();
    const plantId = await insertLegacyPlant(t, "care-conflict", { soilPhMin: 5.5 });
    await t.run(async (ctx) => ctx.db.insert("plantCare", {
      plantId,
      soilPhMin: 6.2,
    }));

    const report = await t.mutation(api.plantCareMigration.migratePlantMasterCareProfile, {
      serviceToken,
      dryRun: false,
    } as any);
    expect(report.migrated).toBe(0);
    expect(report.cleaned).toBe(0);
    expect(report.remaining).toBe(1);
    expect(report.conflicts).toEqual([
      { id: String(plantId), fields: ["soilPhMin"] },
    ]);

    const state = await t.run(async (ctx) => ({
      plant: await ctx.db.get(plantId),
      care: await ctx.db.query("plantCare").withIndex("by_plant", (q) => q.eq("plantId", plantId)).unique(),
    }));
    expect(state.care?.soilPhMin).toBe(6.2);
    expect((state.plant as any)?.soilPhMin).toBe(5.5);
  });

  it("projects legacy care values while the rollout migration still has remaining rows", async () => {
    const t = setup();
    const plantId = await insertLegacyPlant(t, "projection", {
      soilPhMin: 5.4,
      soilPhMax: 6.7,
      moistureTarget: 42,
      lightHours: 9,
    });
    await t.run(async (ctx) => ctx.db.insert("plantI18n", {
      plantId,
      locale: "en",
      commonName: "Basil projection",
      description: "A useful basil description.",
      contentStatus: "published",
    }));

    const adminRows = await t.query(api.masterSync.listAll, {
      serviceToken,
      locale: "en",
    } as any);
    expect(adminRows[0]).toMatchObject({
      soilPhMin: 5.4,
      soilPhMax: 6.7,
      moistureTarget: 42,
      lightHours: 9,
    });

    const canonicalRows = await t.query(api.plantLibrary.listCanonical, {
      locale: "en",
      limit: 10,
    } as any);
    expect(canonicalRows.find((row: any) => row._id === plantId)).toMatchObject({
      soilPhMin: 5.4,
      soilPhMax: 6.7,
      moistureTarget: 42,
      lightHours: 9,
    });
  });

  it("reports deterministic pages and already-migrated rows", async () => {
    const t = setup();
    await insertLegacyPlant(t, "page-a");
    await insertLegacyPlant(t, "page-b");

    const first = await t.mutation(migrationApi.migrateLegacyPropagationMethods, {
      serviceToken,
      dryRun: true,
      limit: 1,
    } as any);
    expect(first.scanned).toBe(1);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(first.migrated).toBe(0);
    expect(first.alreadyMigrated).toBe(0);
    expect(first.remaining).toBe(1);

    const second = await t.mutation(migrationApi.migrateLegacyPropagationMethods, {
      serviceToken,
      dryRun: false,
      limit: 1,
      cursor: first.nextCursor,
    } as any);
    expect(second.scanned).toBe(1);
    expect(second.hasMore).toBe(false);
    expect(second.migrated).toBe(1);
    expect(second.remaining).toBe(0);

    const already = await t.mutation(migrationApi.migrateLegacyPropagationMethods, {
      serviceToken,
      dryRun: true,
      limit: 10,
    } as any);
    expect(already.alreadyMigrated).toBe(0);
  });

  it("counts a legacy row with an existing mapped method as already migrated", async () => {
    const t = setup();
    const alreadyPlantId = await insertLegacyPlant(t, "already", { source: "cutting" });
    await t.run(async (ctx) => ctx.db.insert("plantCare", {
      plantId: alreadyPlantId,
      propagationMethods: ["stem_cutting"],
    }));

    const report = await t.mutation(migrationApi.migrateLegacyPropagationMethods, {
      serviceToken,
      dryRun: true,
      limit: 10,
    } as any);
    expect(report.migrated).toBe(0);
    expect(report.alreadyMigrated).toBe(1);
    expect(report.remaining).toBe(1);
    expect(report.bySource.cutting.alreadyMigrated).toBe(1);
  });
});
