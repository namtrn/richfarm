import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const serviceToken = "plant-groups-test-service-token";

function setup() {
  return convexTest(schema, modules);
}

describe("plant group seed synchronization", () => {
  const previousToken = process.env.CONVEX_ADMIN_FUNCTION_KEY;

  beforeEach(() => {
    process.env.CONVEX_ADMIN_FUNCTION_KEY = serviceToken;
  });

  afterEach(() => {
    if (previousToken === undefined) delete process.env.CONVEX_ADMIN_FUNCTION_KEY;
    else process.env.CONVEX_ADMIN_FUNCTION_KEY = previousToken;
  });

  it("fills canonical Vietnamese names without erasing existing locales", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("plantGroups", {
        key: "herbs",
        displayName: {
          en: "Curated herbs",
          vi: "Cay gia vi",
          ja: "ハーブ",
        },
        sortOrder: 99,
      });
    });

    const dryRun = await t.mutation(internal.seed.syncPlantGroupNames, { dryRun: true });
    expect(dryRun).toMatchObject({ dryRun: true, inserted: 9, updated: 1, skipped: 0, total: 10 });
    expect(await t.query(api.plantGroups.getByKey, { key: "herbs" })).toMatchObject({
      displayName: { en: "Curated herbs", vi: "Cay gia vi", ja: "ハーブ" },
      sortOrder: 99,
    });

    const applied = await t.mutation(internal.seed.syncPlantGroupNames, { dryRun: false });
    expect(applied).toMatchObject({ dryRun: false, inserted: 9, updated: 1, skipped: 0, total: 10 });
    expect(await t.query(api.plantGroups.getByKey, { key: "herbs" })).toMatchObject({
      displayName: { en: "Curated herbs", vi: "Rau gia vị", ja: "ハーブ" },
      sortOrder: 1,
    });

    const metadata = await t.query(api.masterSync.getCatalogMetadata, { serviceToken });
    expect(metadata?.revision).toBeGreaterThan(0);

    const secondPass = await t.mutation(internal.seed.syncPlantGroupNames, { dryRun: false });
    expect(secondPass).toMatchObject({ dryRun: false, inserted: 0, updated: 0, skipped: 10, total: 10 });
  });
});
