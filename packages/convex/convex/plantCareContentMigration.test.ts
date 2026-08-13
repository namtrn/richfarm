import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const serviceToken = "care-content-migration-test-token";

function setup() {
  return convexTest(schema, modules);
}

async function insertPlant(t: ReturnType<typeof setup>, suffix: string) {
  return await t.run(async (ctx) => await ctx.db.insert("plantsMaster", {
    scientificName: `Ocimum basilicum ${suffix}`,
    group: "herbs",
    purposes: ["food"],
  }));
}

async function insertCareRow(
  t: ReturnType<typeof setup>,
  plantId: string,
  locale: string,
  careContent: string,
) {
  return await t.run(async (ctx) => await ctx.db.insert("plantCareI18n", {
    plantId: plantId as any,
    locale,
    careContent,
  }));
}

describe("plant care Markdown migration", () => {
  const previousToken = process.env.CONVEX_ADMIN_FUNCTION_KEY;

  beforeEach(() => {
    process.env.CONVEX_ADMIN_FUNCTION_KEY = serviceToken;
  });

  afterEach(() => {
    if (previousToken === undefined) delete process.env.CONVEX_ADMIN_FUNCTION_KEY;
    else process.env.CONVEX_ADMIN_FUNCTION_KEY = previousToken;
  });

  it("walks every row exactly once with a stable cursor and terminal report", async () => {
    const t = setup();
    const plantId = await insertPlant(t, "cursor");
    await insertCareRow(t, plantId as any, "vi", JSON.stringify({
      watering: { intro: "Giữ ẩm đều.", items: ["Tưới buổi sáng"] },
    }));
    await insertCareRow(t, plantId as any, "en", JSON.stringify({ text: "Keep evenly moist." }));
    await insertCareRow(t, plantId as any, "fr", "## Guide\n\nArrosez le matin.\n");
    await insertCareRow(t, plantId as any, "es", JSON.stringify(["unsupported array"]));
    await insertCareRow(t, plantId as any, "de", JSON.stringify({ watering: {} }));

    const first = await t.mutation(api.plantCareContentMigration.migratePlantCareI18nJsonToString, {
      serviceToken,
      limit: 2,
    } as any);
    expect(first.scanned).toBe(2);
    expect(first.converted).toBe(2);
    expect(first.dispositions).toHaveLength(2);
    expect(first.dispositions.every((row: any) => row.disposition === "converted")).toBe(true);
    expect(first.isDone).toBe(false);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await t.mutation(api.plantCareContentMigration.migratePlantCareI18nJsonToString, {
      serviceToken,
      limit: 2,
      cursor: first.nextCursor,
    } as any);
    expect(second.scanned).toBe(2);
    expect(second.converted).toBe(0);
    expect(second.preserved).toBe(2);
    expect(second.alreadyCanonical).toBe(1);
    expect(second.unsupported).toBe(1);
    expect(second.failures).toHaveLength(1);
    expect(second.dispositions.map((row: any) => row.disposition)).toEqual([
      "preserved",
      "unsupported",
    ]);
    expect(second.isDone).toBe(false);
    expect(second.hasMore).toBe(true);
    expect(second.nextCursor).toEqual(expect.any(String));

    const third = await t.mutation(api.plantCareContentMigration.migratePlantCareI18nJsonToString, {
      serviceToken,
      limit: 2,
      cursor: second.nextCursor,
    } as any);
    expect(third.scanned).toBe(1);
    expect(third.converted).toBe(0);
    expect(third.skipped).toBe(1);
    expect(third.dispositions).toEqual([
      expect.objectContaining({ locale: "de", disposition: "skipped" }),
    ]);
    expect(third.isDone).toBe(true);
    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();

    const rows = await t.run(async (ctx) =>
      (await ctx.db.query("plantCareI18n").collect())
        .sort((left, right) => left.locale.localeCompare(right.locale)),
    );
    expect(rows.map((row) => [row.locale, row.careContent])).toEqual([
      ["de", JSON.stringify({ watering: {} })],
      ["en", "Keep evenly moist."],
      ["es", JSON.stringify(["unsupported array"])],
      ["fr", "## Guide\n\nArrosez le matin.\n"],
      ["vi", "## Tưới nước\n\nGiữ ẩm đều.\n\n- Tưới buổi sáng"],
    ]);

    // A complete replay is terminal and does not rewrite any canonical row.
    const replay = await t.mutation(api.plantCareContentMigration.migratePlantCareI18nJsonToString, {
      serviceToken,
      limit: 10,
    } as any);
    expect(replay.isDone).toBe(true);
    expect(replay.nextCursor).toBeNull();
    expect(replay.converted).toBe(0);
    expect(replay.dispositions).toHaveLength(5);
  });

  it("preserves unsupported and authored bytes while reporting hashes", async () => {
    const t = setup();
    const plantId = await insertPlant(t, "evidence");
    const authored = "  # Markdown\n\nUnicode 🌿, \"quotes\", and JSON-looking prose: [x]\n";
    const scalar = "42";
    const malformed = "{\"text\": \"unterminated";
    await insertCareRow(t, plantId as any, "en", authored);
    await insertCareRow(t, plantId as any, "es", scalar);
    await insertCareRow(t, plantId as any, "fr", malformed);

    const report = await t.mutation(api.plantCareContentMigration.migratePlantCareI18nJsonToString, {
      serviceToken,
      limit: 10,
    } as any);

    expect(report.scanned).toBe(3);
    expect(report.converted).toBe(0);
    expect(report.preserved).toBe(3);
    expect(report.alreadyCanonical).toBe(2);
    expect(report.unsupported).toBe(1);
    expect(report.failures).toHaveLength(1);
    expect(report.preservedHashes).toHaveLength(3);
    expect(report.failureHashes).toHaveLength(1);

    const rows = await t.run(async (ctx) => await ctx.db.query("plantCareI18n").collect());
    expect(rows.map((row) => row.careContent).sort()).toEqual([authored, malformed, scalar].sort());
  });
});
