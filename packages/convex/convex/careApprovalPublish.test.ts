import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const serviceToken = "cap-publish-test-token";

function setup() {
  return convexTest(schema, modules);
}

function backendRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 921,
    plant_code: "BOUGAINVILLEA_GLABRA_7RED82HAMQ",
    common_name: "Bougainvillea",
    scientific_name: "Bougainvillea glabra",
    source_system: "sqlite",
    source_id: "sqlite-local-921",
    record_version: 1,
    category: "general",
    group: "other",
    family: "Nyctaginaceae",
    purposes: [],
    growth_stage: "seedling",
    is_active: true,
    content_status: "published" as const,
    content_version: 1,
    review_status: "reviewed" as const,
    reviewed_at: "2026-08-31T08:00:00.000Z",
    reviewed_by: "1:admin@example.com",
    sync_origin: "local",
    metadata_json: { cultivar: "" },
    i18n: {
      vi: {
        common_name: "Hoa giấy",
        description: "Cây leo có gai, hoa màu rực rỡ.",
        care_content: "## Chăm sóc\n\nGiữ ẩm.",
        content_version: 1,
        content_status: "published" as const,
        review_status: "reviewed" as const,
        reviewed_at: "2026-08-31T08:00:00.000Z",
        reviewed_by: "1:admin@example.com",
      },
      en: {
        common_name: "Bougainvillea",
        description: "Thorny climber with colorful bracts.",
        care_content: "## Care\n\nKeep moist.",
        content_version: 1,
        content_status: "published" as const,
        review_status: "reviewed" as const,
        reviewed_at: "2026-08-31T08:00:00.000Z",
        reviewed_by: "1:admin@example.com",
      },
    },
    ...overrides,
  };
}

function readContentMarkdown(locale: "en" | "vi"): string {
  return fs.readFileSync(
    new URL(`../../../content/plants/bougainvillea-glabra/${locale}.md`, import.meta.url),
    "utf8",
  );
}

describe("CAP approved-content publication contract", () => {
  const previousToken = process.env.CONVEX_ADMIN_FUNCTION_KEY;

  beforeEach(() => {
    process.env.CONVEX_ADMIN_FUNCTION_KEY = serviceToken;
  });

  afterEach(() => {
    if (previousToken === undefined) delete process.env.CONVEX_ADMIN_FUNCTION_KEY;
    else process.env.CONVEX_ADMIN_FUNCTION_KEY = previousToken;
  });

  it("accepts the complete approved SQLite snapshot and preserves review metadata", async () => {
    const t = setup();
    await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow(),
    } as any);

    const snapshot = await t.query(api.masterSync.listAll, { serviceToken, locale: "vi" });
    const plant = snapshot.find((item: any) => String(item.sourceId) === "sqlite-local-921") as
        { contentStatus: string; reviewStatus: string; reviewedBy: string; reviewedAt: number; i18nRows: Array<Record<string, unknown>> } | undefined;
    expect(plant).toBeDefined();
    if (!plant) throw new Error("approved snapshot plant missing");
    expect(plant).toMatchObject({
      contentStatus: "published",
      reviewStatus: "reviewed",
      reviewedBy: "1:admin@example.com",
      reviewedAt: 1788163200000,
    });
    const viRow = plant.i18nRows.find((row: any) => row.locale === "vi") as
        { contentStatus: string; reviewStatus: string; reviewedBy: string; reviewedAt: number } | undefined;
    expect(viRow).toBeDefined();
    expect(viRow).toMatchObject({
      contentStatus: "published",
      reviewStatus: "reviewed",
      reviewedBy: "1:admin@example.com",
      reviewedAt: 1788163200000,
    });
  });

  it("stores the approved EN and VI care Markdown byte-for-byte (4,036 / 4,042 UTF-8 bytes)", async () => {
    const enMarkdown = readContentMarkdown("en");
    const viMarkdown = readContentMarkdown("vi");
    expect(Buffer.byteLength(enMarkdown, "utf8")).toBe(4036);
    expect(Buffer.byteLength(viMarkdown, "utf8")).toBe(4042);

    const t = setup();
    await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({
        i18n: {
          vi: {
            common_name: "Hoa giấy",
            description: "Cây leo có gai, hoa màu rực rỡ.",
            care_content: viMarkdown,
            content_version: 1,
            content_status: "published",
            review_status: "reviewed",
            reviewed_at: "2026-08-31T08:00:00.000Z",
            reviewed_by: "1:admin@example.com",
          },
          en: {
            common_name: "Bougainvillea",
            description: "Thorny climber with colorful bracts.",
            care_content: enMarkdown,
            content_version: 1,
            content_status: "published",
            review_status: "reviewed",
            reviewed_at: "2026-08-31T08:00:00.000Z",
            reviewed_by: "1:admin@example.com",
          },
        },
      }),
    } as any);

    const canonical = await t.query(api.plantLibrary.listCanonical, { locale: "en", limit: 100 });
    const plant = canonical.find((item: any) => String(item.sourceId) === "sqlite-local-921");
    expect(plant).toBeDefined();
    const enRow = plant.i18nRows.find((row: any) => row.locale === "en");
    const viRow = plant.i18nRows.find((row: any) => row.locale === "vi");
    expect(enRow.careContent).toBe(enMarkdown);
    expect(viRow.careContent).toBe(viMarkdown);
    expect(Buffer.byteLength(enRow.careContent as string, "utf8")).toBe(4036);
    expect(Buffer.byteLength(viRow.careContent as string, "utf8")).toBe(4042);
  });

  it("exposes published care content publicly and never drafts", async () => {
    const t = setup();
    await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow(),
    } as any);
    await t.mutation(api.masterSync.upsertPlantFromBackend, {
      serviceToken,
      source: "sqlite",
      row: backendRow({
        plant_code: "DRAFT_PLANT_1",
        scientific_name: "Plantus draftus",
        common_name: "Draft plant",
        source_id: "draft-1",
        i18n: {
          vi: {
            common_name: "Cây nháp",
            description: "Mô tả nháp.",
            care_content: "## Nháp\n\nChưa duyệt.",
            content_version: 1,
            content_status: "needs_review" as const,
            review_status: "unreviewed" as const,
          },
          en: {
            common_name: "Draft plant",
            description: "Draft description.",
            care_content: "## Draft\n\nNot approved.",
            content_version: 1,
            content_status: "needs_review" as const,
            review_status: "unreviewed" as const,
          },
        },
      }),
    } as any);

    const canonical = await t.query(api.plantLibrary.listCanonical, { locale: "en", limit: 100 });
    const approved = canonical.find((item: any) => String(item.sourceId) === "sqlite-local-921");
    const draft = canonical.find((item: any) => String(item.sourceId) === "draft-1");
    expect(approved).toBeDefined();
    expect(approved.i18nRows.find((row: any) => row.locale === "en").careContent).toBe("## Care\n\nKeep moist.");
    // The draft plant must never expose care content publicly: it is either
    // hidden entirely (its locale rows are unusable) or present without care.
    if (draft) {
      for (const row of draft.i18nRows) {
        expect(row.careContent).toBeUndefined();
      }
    }
  });
});