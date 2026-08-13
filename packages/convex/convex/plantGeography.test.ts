import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const serviceToken = "geography-test-service-token";

function setup() {
  return convexTest(schema, modules);
}

function backendRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 201,
    plant_code: "SOLANUM_LYCOPERSICUM",
    common_name: "Tomato",
    scientific_name: "Solanum lycopersicum",
    source_system: "sqlite",
    source_id: "201",
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
      vi: { common_name: "Cà chua", description: "Quả đỏ dùng trong món ăn." },
      en: { common_name: "Tomato", description: "A red fruit used in cooking." },
    },
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

async function seedTaxonomy(t: any) {
  await t.mutation(internal.seed.seedAdaptationTerms, {});
}

describe("Plant geography adaptation (Release 1, design doc §2/§3)", () => {
  const previousToken = process.env.CONVEX_ADMIN_FUNCTION_KEY;

  beforeEach(() => {
    process.env.CONVEX_ADMIN_FUNCTION_KEY = serviceToken;
  });

  afterEach(() => {
    if (previousToken === undefined) delete process.env.CONVEX_ADMIN_FUNCTION_KEY;
    else process.env.CONVEX_ADMIN_FUNCTION_KEY = previousToken;
  });

  it("persists geography join tables from the backend payload", async () => {
    const t = setup();
    await seedTaxonomy(t);

    const result = await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({
        origin_countries: ["US", "VN"],
        origin_country_source_refs: { VN: [{ sourceSystem: "seed-catalog" }] },
        proven_regions: [
          { country_code: "VN", subdivision_code: "HCM" },
          { country_code: "US" },
        ],
        adaptation_term_codes: ["hot", "humid", "tropical"],
        adaptation_term_source_refs: { hot: [{ sourceName: "Tropical handbook" }] },
      }),
    });
    expect(result.action).toBe("inserted");

    const list = (await t.query(api.masterSync.listAll, { serviceToken })) as any[];
    const plant = list.find((row: any) => String(row._id) === String(result.id));
    expect(plant.originCountries).toEqual(["US", "VN"]);
    expect(plant.provenRegions).toEqual([
      { countryCode: "VN", subdivisionCode: "HCM" },
      { countryCode: "US" },
    ]);
    expect(plant.adaptationTermCodes).toEqual(["hot", "humid", "tropical"]);
    // Provenance survives end to end for origin and adaptation too.
    expect(plant.originCountrySourceRefs).toEqual({
      VN: [{ sourceSystem: "seed-catalog" }],
    });
    expect(plant.adaptationTermSourceRefs).toEqual({
      hot: [{ sourceName: "Tropical handbook" }],
    });
  });

  it("rejects unknown country and unknown term codes, and new assignments to archived terms", async () => {
    const t = setup();
    await seedTaxonomy(t);

    await expect(t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({ origin_countries: ["XX"] }),
    })).rejects.toThrow(/Unknown country code/);

    await expect(t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({ adaptation_term_codes: ["not_a_term"] }),
    })).rejects.toThrow(/Unknown adaptation term code/);

    // Archive "hot" via the admin function, then attempt a new assignment.
    const terms = (await t.query(api.plantAdmin.listAdaptationTerms, { serviceToken })) as any[];
    const hot = terms.find((term: any) => term.code === "hot");
    await t.mutation(api.plantAdmin.archiveAdaptationTerm, {
      serviceToken,
      termId: hot._id,
      archived: true,
    });

    await expect(t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({ source_id: "fresh-plant", adaptation_term_codes: ["hot"] }),
    })).rejects.toThrow(/archived and cannot be newly assigned/);
  });

  it("rejects duplicate geography assignments at the authoritative Convex boundary", async () => {
    const t = setup();
    await seedTaxonomy(t);

    await expect(t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({ source_id: "duplicate-origin", origin_countries: ["VN", "VN"] }),
    })).rejects.toThrow(/Duplicate origin country assignment: VN/);

    await expect(t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({
        source_id: "duplicate-region",
        proven_regions: [
          { country_code: "VN", subdivision_code: "HCM" },
          { country_code: "VN", subdivision_code: "HCM" },
        ],
      }),
    })).rejects.toThrow(/Duplicate proven region assignment: VN\/HCM/);

    await expect(t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({ source_id: "duplicate-term", adaptation_term_codes: ["hot", "hot"] }),
    })).rejects.toThrow(/Duplicate adaptation term assignment: hot/);
  });

  it("preserves already-assigned archived terms on re-save (resolved archived rule)", async () => {
    const t = setup();
    await seedTaxonomy(t);

    const first = await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({ adaptation_term_codes: ["hot"] }),
    });
    expect(first.action).toBe("inserted");

    const terms = (await t.query(api.plantAdmin.listAdaptationTerms, { serviceToken })) as any[];
    const hot = terms.find((term: any) => term.code === "hot");
    await t.mutation(api.plantAdmin.archiveAdaptationTerm, {
      serviceToken,
      termId: hot._id,
      archived: true,
    });

    // Re-save the same plant (full payload still carries the archived code):
    // the already-assigned code is preserved, no outbox failure.
    const resave = await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({ adaptation_term_codes: ["hot"] }),
    });
    expect(resave.action).toBe("updated");

    const list = (await t.query(api.masterSync.listAll, { serviceToken })) as any[];
    const plant = list.find((row: any) => String(row._id) === String(first.id));
    expect(plant.adaptationTermCodes).toEqual(["hot"]);
  });

  it("resolves own-versus-inherited geography in the canonical projection", async () => {
    const t = setup();
    await seedTaxonomy(t);

    await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({
        id: 301,
        source_id: "301",
        origin_countries: ["US", "MX"],
        proven_regions: [{ country_code: "US" }],
        adaptation_term_codes: ["warm", "moderate"],
      }),
    });
    await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({
        id: 302,
        source_id: "302",
        metadata_json: { cultivar: "Cherry" },
        origin_countries: ["VN"],
      }),
    });

    const library = (await t.query(api.plantLibrary.listCanonical, {})) as any[];
    const cultivar = library.find((plant: any) => plant.cultivarNormalized === "cherry");
    expect(cultivar).toBeDefined();
    // Own origin wins; adaptation/proven inherit from the base.
    expect(cultivar.originCountries).toEqual([{ code: "VN", name: "Viet Nam" }]);
    expect(cultivar.geographySource.origin).toBe("own");
    expect(cultivar.geographySource.adaptation).toBe("inherited");
    expect(cultivar.adaptation.temperature).toEqual([{ code: "warm", label: "Warm" }]);
    expect(cultivar.adaptation.moisture).toEqual([{ code: "moderate", label: "Moderate" }]);
    expect(cultivar.provenRegions).toEqual([{ code: "US", name: "United States of America" }]);
    expect(cultivar.geographyInheritedFromId).toBeDefined();

    const base = library.find((plant: any) => String(plant._id) === String(cultivar.geographyInheritedFromId));
    expect(base.originCountries).toEqual([
      { code: "US", name: "United States of America" },
      { code: "MX", name: "Mexico" },
    ]);
  });

  it("keeps missing geography absent from the projection and never marks unsuitable", async () => {
    const t = setup();
    await seedTaxonomy(t);
    await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({ id: 401, source_id: "401" }),
    });

    const library = (await t.query(api.plantLibrary.listCanonical, {})) as any[];
    const plant = library.find((row: any) => row.sourceId === "401");
    expect(plant.originCountries).toEqual([]);
    expect(plant.provenRegions).toEqual([]);
    expect(plant.adaptation).toEqual({ temperature: [], moisture: [], climate: [], season: [] });
    expect(plant.geographySource).toEqual({ origin: "none", provenRegions: "none", adaptation: "none" });
    expect(plant.geographyInheritedFromId).toBeUndefined();
  });

  it("reports vi/en label fallback and archive state through listAdaptationTerms with usage counts", async () => {
    const t = setup();
    await seedTaxonomy(t);
    await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({ adaptation_term_codes: ["hot", "dry"] }),
    });

    const terms = (await t.query(api.plantAdmin.listAdaptationTerms, { serviceToken })) as any[];
    expect(terms.length).toBe(13);
    const hot = terms.find((term: any) => term.code === "hot");
    expect(hot.usageCount).toBe(1);
    expect(hot.translations.find((row: any) => row.locale === "vi").label).toBe("Nóng");
    expect(hot.translations.find((row: any) => row.locale === "en").label).toBe("Hot");

    const dimensions = terms.map((term: any) => term.dimension);
    expect([...new Set(dimensions)]).toEqual(["temperature", "moisture", "climate", "season"]);

    // Publication gate: an archived term's history stays readable.
    await t.mutation(api.plantAdmin.archiveAdaptationTerm, {
      serviceToken,
      termId: hot._id,
      archived: true,
    });
    const after = (await t.query(api.plantAdmin.listAdaptationTerms, { serviceToken })) as any[];
    expect(after.find((term: any) => term.code === "hot").status).toBe("archived");
    expect(after.find((term: any) => term.code === "hot").usageCount).toBe(1);
  });

  it("requires both vi and en labels before a term can be active", async () => {
    const t = setup();
    await seedTaxonomy(t);

    await expect(t.mutation(api.plantAdmin.createAdaptationTerm, {
      serviceToken,
      code: "snowy",
      dimension: "climate",
      sortOrder: 99,
      labelVi: "Tuyết",
      labelEn: "",
    })).rejects.toThrow(/Both Vietnamese and English labels/);

    const created = await t.mutation(api.plantAdmin.createAdaptationTerm, {
      serviceToken,
      code: "snowy",
      dimension: "climate",
      sortOrder: 99,
      labelVi: "Tuyết",
      labelEn: "Snowy",
    });
    expect(created.termId).toBeDefined();

    // An active term cannot be restored without both labels: delete en first.
    const terms = (await t.query(api.plantAdmin.listAdaptationTerms, { serviceToken })) as any[];
    const snowy = terms.find((term: any) => term.code === "snowy");
    const enTranslation = await t.query(api.plantAdmin.listAdaptationTerms, { serviceToken })
      .then((all: any[]) => all.find((term: any) => term.code === "snowy"));
    const en = enTranslation.translations.find((row: any) => row.locale === "en");
    await t.mutation(api.plantAdmin.updateAdaptationTermTranslation, {
      serviceToken,
      termId: snowy._id,
      locale: "en",
      label: "",
      translationStatus: "missing",
    });
    await t.mutation(api.plantAdmin.archiveAdaptationTerm, {
      serviceToken,
      termId: snowy._id,
      archived: true,
    });
    await expect(t.mutation(api.plantAdmin.archiveAdaptationTerm, {
      serviceToken,
      termId: snowy._id,
      archived: false,
    })).rejects.toThrow(/Both Vietnamese and English labels/);
  });

  it("seeds idempotently and reports a clean adaptation translation gate", async () => {
    const t = setup();
    const first = await t.mutation(internal.seed.seedAdaptationTerms, {});
    expect(first.terms.inserted).toBe(13);
    const second = await t.mutation(internal.seed.seedAdaptationTerms, {});
    expect(second.terms.inserted).toBe(0);
    expect(second.i18n.inserted).toBe(0);

    const report = await t.mutation(api.plantLibraryQuality.assertQualityGate, {
      serviceToken,
      sampleLimit: 10,
    });
    expect(report.issues.missingMandatoryAdaptationTranslationCount).toBe(0);
  });

  it("reports a clean approved taxonomy and detects orphan/extra geography rows read-only", async () => {
    const t = setup();
    await seedTaxonomy(t);

    const clean = await t.query(api.plantAdmin.adaptationReleasePreflight, { serviceToken });
    expect(clean.clean).toBe(true);
    expect(clean.expected.termCount).toBe(13);
    expect(clean.expected.translationCount).toBe(26);
    expect(clean.taxonomy.extraTermCodes).toEqual([]);
    expect(clean.orphans).toEqual({
      i18n: 0,
      origin: 0,
      provenRegions: 0,
      adaptationTerms: 0,
      adaptationTermCodes: 0,
    });

    const inserted = await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({ source_id: "preflight-plant", adaptation_term_codes: ["hot"] }),
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("adaptationTerms", {
        code: "qa_test",
        dimension: "climate",
        status: "archived",
        sortOrder: 999,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("adaptationTermI18n", {
        termCode: "ghost",
        locale: "vi",
        label: "Bóng ma",
        translationStatus: "missing",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("plantAdaptationTerms", {
        plantId: inserted.id as any,
        termCode: "ghost",
      });
    });

    const dirty = await t.query(api.plantAdmin.adaptationReleasePreflight, { serviceToken });
    expect(dirty.clean).toBe(false);
    expect(dirty.taxonomy.extraTermCodes).toEqual(["qa_test"]);
    expect(dirty.orphans.i18n).toBe(1);
    expect(dirty.orphans.adaptationTermCodes).toBe(1);
  });
});
