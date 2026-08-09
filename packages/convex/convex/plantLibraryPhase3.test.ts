import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const serviceToken = "phase-3-test-service-token";

function setup() {
  return convexTest(schema, modules);
}

function backendRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    plant_code: "SOLANUM_LYCOPERSICUM",
    common_name: "Tomato",
    scientific_name: "Solanum lycopersicum",
    source_system: "sqlite",
    source_id: "101",
    record_version: 1,
    category: "vegetable",
    group: "nightshades",
    family: "Solanaceae",
    purposes: ["food"],
    growth_stage: "seedling",
    typical_days_to_harvest: 80,
    germination_days: 7,
    watering_frequency_days: 2,
    fertilizing_frequency_days: 14,
    soil_ph_min: 5.5,
    soil_ph_max: 6.8,
    moisture_target: 60,
    light_hours: 8,
    light_requirements: "full_sun",
    spacing_cm: 45,
    max_plants_per_m2: 4,
    seed_rate_per_m2: null,
    water_liters_per_m2: 2,
    yield_kg_per_m2: 5,
    image_url: null,
    is_active: true,
    notes: "Trusted test content",
    source_url: "https://example.com/tomato",
    content_status: "published" as const,
    content_version: 1,
    review_status: "reviewed" as const,
    reviewed_at: "2026-08-05T00:00:00.000Z",
    reviewed_by: "test",
    sync_origin: "local",
    metadata_json: { cultivar: "" },
    i18n: {
      vi: {
        common_name: "Cà chua",
        description: "Quả đỏ dùng trong món ăn.",
        care_content_json: { soil: { phMin: 5.5, phMax: 6.8 } },
        content_version: 1,
        source: "test",
        source_url: "https://example.com/tomato",
        content_status: "published" as const,
        review_status: "reviewed" as const,
        reviewed_at: "2026-08-05T00:00:00.000Z",
        reviewed_by: "test",
      },
      en: {
        common_name: "Tomato",
        description: "A red fruit used in cooking.",
        care_content_json: { soil: { phMin: 5.5, phMax: 6.8 } },
        content_version: 1,
        source: "test",
        source_url: "https://example.com/tomato",
        content_status: "published" as const,
        review_status: "reviewed" as const,
        reviewed_at: "2026-08-05T00:00:00.000Z",
        reviewed_by: "test",
      },
    },
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe("Phase 3 canonical plant library", () => {
  const previousToken = process.env.CONVEX_ADMIN_FUNCTION_KEY;

  beforeEach(() => {
    process.env.CONVEX_ADMIN_FUNCTION_KEY = serviceToken;
  });

  afterEach(() => {
    if (previousToken === undefined) delete process.env.CONVEX_ADMIN_FUNCTION_KEY;
    else process.env.CONVEX_ADMIN_FUNCTION_KEY = previousToken;
  });

  it("rejects direct backend writes without the server service token", async () => {
    const t = setup();
    await expect(t.mutation(api.masterSync.upsertPlantFromBackend, {
      source: "sqlite",
      row: backendRow(),
    } as any)).rejects.toThrow();

    await expect(t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken: "wrong-token",
      source: "sqlite",
      row: backendRow(),
    } as any)).rejects.toThrow();

    await expect(t.query(api.plantAdmin.listPlants, {
      page: 1,
      pageSize: 10,
    } as any)).rejects.toThrow();

    await expect(t.mutation(api.plantCareMigration.migratePlantMasterCareProfile, {
      limit: 1,
    } as any)).rejects.toThrow();

    await expect(t.mutation(api.plantTaxonomyMigration.runTaxonomyBackfill, {
      dryRun: true,
      limit: 1,
    } as any)).rejects.toThrow();
  });

  it("upserts by source identity and preserves full care/i18n metadata", async () => {
    const t = setup();
    const first = await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow(),
    } as any);
    const second = await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({
        common_name: "Tomato updated",
        record_version: 2,
        content_version: 2,
        soil_ph_min: 6,
      }),
    } as any);

    expect(first.action).toBe("inserted");
    expect(second.action).toBe("updated");
    const rows = await t.query(api.masterSync.listAll, { serviceToken, locale: "vi" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceSystem: "sqlite", sourceId: "101", recordVersion: 2 });
    expect(rows[0].i18nRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ locale: "vi", careContent: expect.any(String) }),
      expect.objectContaining({ locale: "en" }),
    ]));

    await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({
        i18n: {
          vi: (backendRow() as any).i18n.vi,
        },
      }),
    } as any);
    const afterLocaleDelete = await t.query(api.masterSync.listAll, { serviceToken, locale: "vi" });
    expect(afterLocaleDelete[0].i18nRows).toHaveLength(1);
  });

  it("accepts a new API DTO before SQLite has assigned local id/timestamps", async () => {
    const t = setup();
    const row = backendRow({
      id: undefined,
      plant_code: "MENTHA_SPICATA_API",
      common_name: "Spearmint",
      scientific_name: "Mentha spicata",
      source_id: "api-spearmint-1",
      created_at: undefined,
      updated_at: undefined,
      i18n: {
        vi: { common_name: "Bạc hà", description: "Lá thơm dùng trong món ăn." },
        en: { common_name: "Spearmint", description: "An aromatic herb used in cooking." },
      },
    });

    const result = await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row,
    } as any);
    expect(result.action).toBe("inserted");
    expect(result.sourceId).toBe("api-spearmint-1");
  });

  it("rejects backend deletion while a live user plant references the master row", async () => {
    const t = setup();
    const created = await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({ source_id: "referenced-plant", plant_code: "REFERENCED_PLANT" }),
    } as any);
    const userPlant = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: "phase-3-reference-user",
        isActive: true,
      });
      return ctx.db.insert("userPlants", {
        userId,
        plantMasterId: created.id,
        status: "growing",
        version: 1,
      });
    });

    await expect(t.mutation(api.masterSync.deletePlantFromBackend, {
      serviceToken,
      source: "sqlite",
      source_system: "sqlite",
      source_id: "referenced-plant",
    } as any)).rejects.toThrow(/user plants still reference/i);

    expect(userPlant).toBeDefined();
    const remaining = await t.query(api.masterSync.listAll, { serviceToken, locale: "en" });
    expect(remaining.some((plant: any) => plant.sourceId === "referenced-plant")).toBe(true);
  });

  it("treats infraspecific bases as display bases for variant ordering and deletion guards", async () => {
    const t = setup();
    const baseId = await t.run(async (ctx) => ctx.db.insert("plantsMaster", {
      scientificName: "Brassica rapa",
      genus: "Brassica",
      species: "rapa",
      cultivar: "var. chinensis",
      group: "leafy_greens",
      purposes: ["food"],
      isActive: true,
      contentStatus: "published",
      sourceSystem: "seed",
      sourceId: "brassica-var-base",
    }));

    const variant = await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({
        id: undefined,
        plant_code: "BRASSICA_RAPA_PURPLE_TOP",
        common_name: "Purple Top turnip",
        scientific_name: "Brassica rapa",
        source_id: "brassica-purple-top",
        metadata_json: { cultivar: "Purple Top" },
      }),
    } as any);

    expect(variant.action).toBe("inserted");
    expect(variant.sourceId).toBe("brassica-purple-top");

    await expect(t.mutation(api.masterSync.deletePlantFromBackend, {
      serviceToken,
      source: "seed",
      source_system: "seed",
      source_id: "brassica-var-base",
    } as any)).rejects.toThrow(/base plant while variants/i);

    const remaining = await t.query(api.masterSync.listAll, { serviceToken, locale: "en" });
    expect(remaining.some((plant: any) => plant.sourceId === "brassica-var-base")).toBe(true);
    expect(remaining.some((plant: any) => plant.sourceId === "brassica-purple-top")).toBe(true);
    expect(baseId).toBeDefined();
  });

  it("uses the same active, locale fallback, placeholder and base inheritance policy", async () => {
    const t = setup();
    const baseId = await t.run(async (ctx) => ctx.db.insert("plantsMaster", {
      scientificName: "Ocimum basilicum",
      cultivar: undefined,
      genus: "Ocimum",
      species: "basilicum",
      group: "herbs",
      purposes: ["food"],
      isActive: true,
      contentStatus: "published",
      sourceSystem: "seed",
      sourceId: "basil-base",
    }));
    const variantId = await t.run(async (ctx) => ctx.db.insert("plantsMaster", {
      scientificName: "Ocimum basilicum",
      cultivar: "Genovese",
      genus: "Ocimum",
      species: "basilicum",
      basePlantId: baseId,
      group: "herbs",
      purposes: ["food"],
      isActive: true,
      contentStatus: "published",
      sourceSystem: "seed",
      sourceId: "basil-genovese",
    }));
    await t.run(async (ctx) => {
      await ctx.db.patch(baseId, { basePlantId: baseId });
      await ctx.db.insert("plantI18n", {
        plantId: baseId,
        locale: "en",
        commonName: "Basil",
        description: "A fragrant herb for cooking.",
        contentStatus: "published",
      });
      await ctx.db.insert("plantI18n", {
        plantId: variantId,
        locale: "en",
        commonName: "Genovese basil",
        description: "is a popular plant for home gardens and small farms.",
        contentStatus: "published",
      });
      await ctx.db.insert("plantI18n", {
        plantId: variantId,
        locale: "vi",
        commonName: "Húng quế Genovese",
        description: "",
        contentStatus: "published",
      });
      await ctx.db.insert("plantsMaster", {
        scientificName: "Inactive plant",
        group: "other",
        purposes: [],
        isActive: false,
        sourceSystem: "seed",
        sourceId: "inactive",
      });
      const placeholderId = await ctx.db.insert("plantsMaster", {
        scientificName: "Placeholder plant",
        group: "other",
        purposes: [],
        isActive: true,
        sourceSystem: "seed",
        sourceId: "placeholder",
      });
      await ctx.db.insert("plantI18n", {
        plantId: placeholderId,
        locale: "en",
        commonName: "Placeholder plant",
        description: "is a popular plant for home gardens and small farms.",
        contentStatus: "published",
      });
    });

    const vi = await t.query(api.plantLibrary.listCanonical, { locale: "vi", limit: 100 });
    const picked = vi.find((plant: any) => String(plant._id) === String(variantId));
    expect(picked).toMatchObject({ displayName: "Húng quế Genovese", isActive: true });
    expect(picked?.description).toBe("A fragrant herb for cooking.");
    expect(vi.some((plant: any) => plant.sourceId === "inactive")).toBe(false);
    expect(vi.some((plant: any) => plant.sourceId === "placeholder")).toBe(false);

    const matched = await t.query(api.plantLibrary.matchPlantInLibrary, {
      commonNames: ["Húng quế Genovese"],
      locale: "vi",
    });
    expect(matched?.plantId).toBe(variantId);
  });

  it("keeps the admin snapshot complete while canonical reads hide non-production rows", async () => {
    const t = setup();
    const rows = await t.run(async (ctx) => {
      const activeId = await ctx.db.insert("plantsMaster", {
        scientificName: "Mentha spicata",
        group: "herbs",
        purposes: ["food"],
        isActive: true,
        contentStatus: "published",
        sourceSystem: "seed",
        sourceId: "mint-active",
      });
      const inactiveId = await ctx.db.insert("plantsMaster", {
        scientificName: "Mentha aquatica",
        group: "herbs",
        purposes: ["food"],
        isActive: false,
        contentStatus: "published",
        sourceSystem: "seed",
        sourceId: "mint-inactive",
      });
      const draftId = await ctx.db.insert("plantsMaster", {
        scientificName: "Mentha suaveolens",
        group: "herbs",
        purposes: ["food"],
        isActive: true,
        contentStatus: "draft",
        sourceSystem: "seed",
        sourceId: "mint-draft",
      });
      for (const [plantId, commonName] of [
        [activeId, "Spearmint"],
        [inactiveId, "Water mint"],
        [draftId, "Apple mint"],
      ] as const) {
        await ctx.db.insert("plantI18n", {
          plantId,
          locale: "en",
          commonName,
          description: `${commonName} has a verified production description.`,
          contentStatus: "published",
        });
      }
      return { activeId, inactiveId, draftId };
    });

    const canonical = await t.query(api.plantLibrary.listCanonical, { locale: "en", limit: 100 });
    expect(canonical.map((plant: any) => String(plant.sourceId))).toEqual(["mint-active"]);

    const adminSnapshot = await t.query(api.masterSync.listAll, { serviceToken, locale: "en" });
    expect(adminSnapshot.map((plant: any) => String(plant.sourceId))).toEqual(
      expect.arrayContaining(["mint-active", "mint-inactive", "mint-draft"]),
    );
    expect(adminSnapshot).toHaveLength(3);
    expect(rows.activeId).toBeDefined();
  });
});
