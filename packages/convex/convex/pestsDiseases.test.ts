import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  return convexTest(schema, modules);
}

function issue(key: string, type: "pest" | "disease", sortOrder: number, plantKeys: string[]) {
  return {
    key,
    type,
    name: key,
    commonNameVi: key === "aphids" ? "Rệp mềm" : "Bệnh đốm lá",
    scientificNames: key === "aphids" ? ["Aphis gossypii"] : ["Alternaria spp."],
    plantKeys,
    identification: [],
    damage: [],
    prevention: [],
    control: { physical: [], organic: [], chemical: [] },
    plantsAffected: [],
    sortOrder,
  };
}

describe("pest and disease plant links", () => {
  it("filters by canonical plant key and keeps the lookup order", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("pestsDiseases", issue("leaf_spot", "disease", 2, ["solanum-lycopersicum"]));
      await ctx.db.insert("pestsDiseases", issue("aphids", "pest", 1, ["solanum-lycopersicum"]));
      await ctx.db.insert("pestsDiseases", issue("rust", "disease", 3, ["phaseolus-vulgaris"]));
    });

    const rows = await t.query((api as any).pestsDiseases.listForPlant, {
      plantKey: "solanum-lycopersicum",
    });

    expect(rows.map((row: any) => row.key)).toEqual(["aphids", "leaf_spot"]);
    expect(rows[0]).toMatchObject({
      commonNameVi: "Rệp mềm",
      scientificNames: ["Aphis gossypii"],
    });
  });

  it("can narrow the plant lookup to one issue type", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("pestsDiseases", issue("leaf_spot", "disease", 2, ["solanum-lycopersicum"]));
      await ctx.db.insert("pestsDiseases", issue("aphids", "pest", 1, ["solanum-lycopersicum"]));
    });

    const rows = await t.query((api as any).pestsDiseases.listForPlant, {
      plantKey: "solanum-lycopersicum",
      type: "disease",
    });

    expect(rows.map((row: any) => row.key)).toEqual(["leaf_spot"]);
  });
});
