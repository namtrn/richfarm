import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const serviceToken = "plant-admin-care-test-token";

function setup() {
  return convexTest(schema, modules);
}

async function insertPlant(t: ReturnType<typeof setup>) {
  return await t.run(async (ctx) => await ctx.db.insert("plantsMaster", {
    scientificName: "Ocimum basilicum",
    group: "herbs",
    purposes: ["food"],
    sourceSystem: "test",
    sourceId: "plant-admin-care",
  }));
}

function i18nArgs(plantId: string, overrides: Record<string, unknown> = {}) {
  return {
    serviceToken,
    plantId,
    locale: "fr",
    commonName: "Basilic",
    description: "Une herbe aromatique.",
    ...overrides,
  } as any;
}

function updateArgs(overrides: Record<string, unknown> = {}) {
  return {
    serviceToken,
    rowId: "",
    locale: "fr",
    commonName: "Basilic",
    description: "Une herbe aromatique.",
    ...overrides,
  } as any;
}

describe("plantAdmin localized care Markdown contract", () => {
  const previousToken = process.env.CONVEX_ADMIN_FUNCTION_KEY;

  beforeEach(() => {
    process.env.CONVEX_ADMIN_FUNCTION_KEY = serviceToken;
  });

  afterEach(() => {
    if (previousToken === undefined) delete process.env.CONVEX_ADMIN_FUNCTION_KEY;
    else process.env.CONVEX_ADMIN_FUNCTION_KEY = previousToken;
  });

  it("preserves absent/null/empty/string states and Markdown bytes", async () => {
    const t = setup();
    const plantId = await insertPlant(t);
    const markdown = "  ## Guide\n\nGiữ **ẩm**.  \n";
    const created = await t.mutation(api.plantAdmin.createPlantI18n, i18nArgs(plantId as any, {
      careContent: markdown,
      contentVersion: 3,
    }));

    let rows = await t.query(api.plantAdmin.listPlantI18n, { serviceToken });
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ locale: "fr", careContent: markdown }),
    ]));

    // Omitting careContent is a metadata-only update and must preserve bytes.
    await t.mutation(api.plantAdmin.updatePlantI18n, updateArgs({
      rowId: created.rowId,
      commonName: "Basilic modifié",
    }));
    rows = await t.query(api.plantAdmin.listPlantI18n, { serviceToken });
    expect(rows.find((row: any) => row.locale === "fr")?.careContent).toBe(markdown);

    // Explicit null and an explicitly submitted empty/whitespace string clear.
    await t.mutation(api.plantAdmin.updatePlantI18n, updateArgs({
      rowId: created.rowId,
      careContent: null,
    }));
    rows = await t.query(api.plantAdmin.listPlantI18n, { serviceToken });
    expect(rows.find((row: any) => row.locale === "fr")?.careContent).toBeUndefined();

    await t.mutation(api.plantAdmin.updatePlantI18n, updateArgs({
      rowId: created.rowId,
      careContent: markdown,
    }));
    await t.mutation(api.plantAdmin.updatePlantI18n, updateArgs({
      rowId: created.rowId,
      careContent: "   ",
    }));
    rows = await t.query(api.plantAdmin.listPlantI18n, { serviceToken });
    expect(rows.find((row: any) => row.locale === "fr")?.careContent).toBeUndefined();
  });

  it("moves localized care with a locale rename instead of deleting it", async () => {
    const t = setup();
    const plantId = await insertPlant(t);
    const markdown = "## Soins\n\nArrosez le matin.\n";
    const created = await t.mutation(api.plantAdmin.createPlantI18n, i18nArgs(plantId as any, {
      careContent: markdown,
      contentVersion: 7,
      source: "curated",
      sourceUrl: "https://example.test/care",
      contentStatus: "needs_review",
      reviewedAt: 123,
      reviewedBy: "reviewer",
    }));

    await t.mutation(api.plantAdmin.updatePlantI18n, updateArgs({
      rowId: created.rowId,
      locale: "de",
      commonName: "Basilikum",
    }));

    const rows = await t.query(api.plantAdmin.listPlantI18n, { serviceToken });
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        locale: "de",
        careContent: markdown,
        contentVersion: 7,
        source: "curated",
        sourceUrl: "https://example.test/care",
        contentStatus: "needs_review",
        reviewedAt: 123,
        reviewedBy: "reviewer",
      }),
    ]));
    expect(rows.some((row: any) => row.locale === "fr")).toBe(false);
  });
});
