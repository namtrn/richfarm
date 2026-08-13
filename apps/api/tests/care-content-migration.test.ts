import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase, migrateCareContentJsonToMarkdown, type SqliteDatabase } from "../src/db";
import { legacyCareJsonToMarkdown } from "../../../packages/shared/src/careContentLegacy";

/** Build a legacy-shaped DB (care_content_json column, full 16-column layout). */
function buildLegacyDatabase(dbPath: string): Database.Database {
  const legacy = new Database(dbPath);
  legacy.exec(`
    CREATE TABLE master_plants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plant_code TEXT NOT NULL UNIQUE,
      common_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE master_plant_i18n (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      master_plant_id INTEGER NOT NULL,
      locale TEXT NOT NULL,
      common_name TEXT NOT NULL,
      description TEXT,
      care_content_json TEXT NOT NULL DEFAULT '{}',
      content_version INTEGER NOT NULL DEFAULT 1,
      source TEXT,
      source_url TEXT,
      content_status TEXT NOT NULL DEFAULT 'published',
      review_status TEXT NOT NULL DEFAULT 'unreviewed',
      reviewed_at TEXT,
      reviewed_by TEXT,
      content_origin TEXT NOT NULL DEFAULT 'imported',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(master_plant_id, locale),
      FOREIGN KEY(master_plant_id) REFERENCES master_plants(id) ON DELETE CASCADE
    );
  `);
  return legacy;
}

describe("Phase 2 care content migration", () => {
  let dir: string;
  let db: SqliteDatabase;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "richfarm-care-migration-"));
    db = createDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("is a no-op on fresh databases (idempotent, no legacy column)", () => {
    const report = migrateCareContentJsonToMarkdown(db);
    expect(report.migrated).toBe(false);
    const columns = db.prepare(`PRAGMA table_info(master_plant_i18n)`).all() as Array<{ name: string }>;
    expect(columns.some((col) => col.name === "care_content_json")).toBe(false);
    expect(columns.some((col) => col.name === "care_content")).toBe(true);
  });

  it("backfills deterministic display dates by stable plant code", () => {
    const dbPath = path.join(dir, "care-dates.db");
    const seeded = createDatabase(dbPath);
    seeded.prepare(`INSERT INTO master_plants (plant_code, common_name) VALUES (?, ?)`).run("BASELLA_ALBA_09A582HJFJ", "mutable");
    seeded.prepare(`INSERT INTO master_plants (plant_code, common_name) VALUES (?, ?)`).run("OTHER_STABLE_CODE", "other");
    seeded.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name, care_content, content_status) VALUES (1, 'vi', 'x', '# Guide', 'published')`).run();
    seeded.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name, care_content, content_status) VALUES (2, 'en', 'y', '# Guide', 'published')`).run();
    seeded.close();

    const migrated = createDatabase(dbPath);
    const rows = migrated.prepare(`SELECT content_updated_at FROM master_plant_i18n ORDER BY master_plant_id`).all() as Array<{ content_updated_at: string }>;
    expect(rows.map((row) => row.content_updated_at)).toEqual([
      '2026-08-13T00:00:00.000Z',
      '2026-07-13T00:00:00.000Z',
    ]);
    migrated.close();
  });

  it("converts legacy section objects and { text } shapes and reports failures", () => {
    const legacyPath = path.join(dir, "legacy.db");
    const legacy = buildLegacyDatabase(legacyPath);
    legacy.prepare(`INSERT INTO master_plants (plant_code, common_name) VALUES (?, ?)`).run("M1", "Plant one");
    legacy.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name, care_content_json) VALUES (1, 'vi', 'Cây', ?)`).run(
      JSON.stringify({
        watering: { intro: "Giữ ẩm đều.", items: ["Tưới buổi sáng", "Phủ gốc"] },
        soil: { intro: "Đất thoát nước tốt." },
      }),
    );
    // Authored free-form shape produced by the old dashboard fallback.
    legacy.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name, care_content_json) VALUES (1, 'en', 'Plant', ?)`).run(
      JSON.stringify({ text: "Keep evenly moist." }),
    );
    // Unrecognized structured shape: must be reported, not converted.
    legacy.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name, care_content_json) VALUES (1, 'es', 'Planta', ?)`).run(
      JSON.stringify({ ph: [5.5, 6.8] }),
    );
    // Empty legacy value: stays empty.
    legacy.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name, care_content_json) VALUES (1, 'fr', 'Plante', '{}')`).run();

    // Run the migration directly on the legacy DB (not through createDatabase)
    // so the evidence report reflects an actual conversion pass.
    const report = migrateCareContentJsonToMarkdown(legacy);

    expect(report.migrated).toBe(true);
    expect(report.totalRowsBefore).toBe(4);
    expect(report.totalRowsAfter).toBe(4);
    expect(report.legacyNonEmpty).toBe(3);
    expect(report.converted).toBe(2);
    expect(report.authoredTextCount).toBe(1);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatchObject({ locale: "es" });
    expect(report.viBefore).toBe(1);
    expect(report.enBefore).toBe(1);
    expect(report.viAfter).toBe(1);
    expect(report.enAfter).toBe(1);
    expect(report.foreignKeyIssues).toBe(0);

    const rows = legacy.prepare(`SELECT locale, care_content FROM master_plant_i18n ORDER BY id ASC`).all() as Array<{ locale: string; care_content: string | null }>;
    expect(rows[0].care_content).toBe(
      "## Tưới nước\n\nGiữ ẩm đều.\n\n- Tưới buổi sáng\n- Phủ gốc\n\n## Đất trồng\n\nĐất thoát nước tốt.",
    );
    expect(rows[1].care_content).toBe("Keep evenly moist.");
    expect(rows[2].care_content).toBeNull();
    expect(rows[3].care_content).toBeNull();

    // Legacy column is gone; care_content exists; vi/en both preserved.
    const columns = legacy.prepare(`PRAGMA table_info(master_plant_i18n)`).all() as Array<{ name: string }>;
    expect(columns.some((col) => col.name === "care_content_json")).toBe(false);
    expect(columns.some((col) => col.name === "care_content")).toBe(true);
    // This legacy clone intentionally has no source_refs_json column. The
    // rebuild must add it with its deterministic empty-array default rather
    // than failing while selecting from the renamed legacy table.
    expect(columns.some((col) => col.name === "source_refs_json")).toBe(true);
    expect((legacy.prepare(`SELECT source_refs_json FROM master_plant_i18n WHERE locale = 'vi'`).get() as { source_refs_json: string }).source_refs_json).toBe("[]");
    expect((legacy.prepare(`SELECT COUNT(*) AS n FROM master_plant_i18n WHERE locale IN ('vi','en')`).get() as { n: number }).n).toBe(2);
    expect((legacy.prepare(`PRAGMA foreign_key_check`).all() as unknown[]).length).toBe(0);

    // A second direct run is a no-op (idempotent).
    expect(migrateCareContentJsonToMarkdown(legacy).migrated).toBe(false);
    legacy.close();
  });

  it("reports converted/failure evidence when run directly on a legacy clone", () => {
    const legacyPath = path.join(dir, "legacy-clone.db");
    const legacy = buildLegacyDatabase(legacyPath);
    legacy.prepare(`INSERT INTO master_plants (plant_code, common_name) VALUES (?, ?)`).run("M1", "Plant one");
    legacy.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name, care_content_json) VALUES (1, 'vi', 'Cây', ?)`).run(
      JSON.stringify({ watering: { intro: "Giữ ẩm đều.", items: ["Tưới buổi sáng"] } }),
    );
    legacy.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name, care_content_json) VALUES (1, 'en', 'Plant', ?)`).run(
      JSON.stringify({ text: "Keep evenly moist." }),
    );
    legacy.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name, care_content_json) VALUES (1, 'es', 'Planta', ?)`).run(
      JSON.stringify({ ph: [5.5, 6.8] }),
    );
    legacy.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name, care_content_json) VALUES (1, 'fr', 'Plante', '{}')`).run();

    const report = migrateCareContentJsonToMarkdown(legacy);
    expect(report.migrated).toBe(true);
    expect(report.legacyNonEmpty).toBe(3);
    expect(report.converted).toBe(2);
    expect(report.authoredTextCount).toBe(1);
    expect(report.failures).toHaveLength(1);
    expect(report.converted + report.failures.length).toBe(report.legacyNonEmpty);

    // Evidence assertions on the migrated clone state.
    expect((legacy.prepare(`SELECT COUNT(*) AS n FROM master_plant_i18n`).get() as { n: number }).n).toBe(4);
    expect((legacy.prepare(`SELECT COUNT(*) AS n FROM master_plant_i18n WHERE care_content IS NOT NULL AND care_content != ''`).get() as { n: number }).n).toBe(2);
    expect((legacy.prepare(`SELECT COUNT(*) AS n FROM master_plant_i18n WHERE care_content IS NULL`).get() as { n: number }).n).toBe(2);
    legacy.close();
  });

  it("keeps authored { text } strings byte-for-byte with matching hashes", () => {
    const legacyPath = path.join(dir, "legacy.db");
    const legacy = buildLegacyDatabase(legacyPath);
    legacy.prepare(`INSERT INTO master_plants (plant_code, common_name) VALUES (?, ?)`).run("M2", "Two");
    const authored = "  Leading and trailing spaces kept  with \"quotes\" and\nnewlines ";
    legacy.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name, care_content_json) VALUES (1, 'en', 'Two', ?)`).run(
      JSON.stringify({ text: authored }),
    );
    legacy.close();

    const migrated = createDatabase(legacyPath);
    const row = migrated.prepare(`SELECT care_content FROM master_plant_i18n WHERE locale = 'en'`).get() as { care_content: string };
    expect(row.care_content).toBe(authored);
    migrated.close();
  });

  it("preserves provenance columns losslessly across the rebuild", () => {
    const legacyPath = path.join(dir, "legacy.db");
    const legacy = buildLegacyDatabase(legacyPath);
    legacy.prepare(`INSERT INTO master_plants (plant_code, common_name) VALUES (?, ?)`).run("M3", "Three");
    legacy.prepare(`
      INSERT INTO master_plant_i18n (
        master_plant_id, locale, common_name, description, care_content_json,
        content_version, source, source_url, content_status, review_status,
        reviewed_at, reviewed_by, content_origin
      ) VALUES (1, 'vi', 'Ba', 'desc', ?, 7, 'garden', 'https://example.com', 'published', 'reviewed', '2026-01-01', 'qa', 'authored')
    `).run(JSON.stringify({ text: "Tưới nước" }));
    legacy.close();

    const migrated = createDatabase(legacyPath);
    const row = migrated.prepare(`
      SELECT common_name, description, content_version, source, source_url,
             content_status, review_status, reviewed_at, reviewed_by, content_origin
      FROM master_plant_i18n WHERE locale = 'vi'
    `).get() as Record<string, unknown>;
    expect(row).toEqual({
      common_name: "Ba",
      description: "desc",
      content_version: 7,
      source: "garden",
      source_url: "https://example.com",
      content_status: "published",
      review_status: "reviewed",
      reviewed_at: "2026-01-01",
      reviewed_by: "qa",
      content_origin: "authored",
    });
    migrated.close();
  });

  it("matches the shared legacy converter output exactly", () => {
    const raw = JSON.stringify({
      watering: { intro: "Giữ ẩm đều.", items: ["Tưới buổi sáng"] },
      temperature: { intro: "18–30°C" },
    });
    const expected = legacyCareJsonToMarkdown(raw, "vi");
    expect(expected.kind).toBe("markdown");
    expect(expected.kind === "markdown" && expected.markdown).toBe(
      "## Tưới nước\n\nGiữ ẩm đều.\n\n- Tưới buổi sáng\n\n## Nhiệt độ\n\n18–30°C",
    );
  });

  it("rehearses on a disposable clone file: total rows equal, foreign keys clean", () => {
    const legacyPath = path.join(dir, "legacy.db");
    const legacy = buildLegacyDatabase(legacyPath);
    legacy.prepare(`INSERT INTO master_plants (plant_code, common_name) VALUES (?, ?)`).run("M4", "Four");
    legacy.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name, care_content_json) VALUES (1, 'vi', 'Bốn', ?)`).run(
      JSON.stringify({ watering: { items: ["Tưới"] } }),
    );
    legacy.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name, care_content_json) VALUES (1, 'en', 'Four', ?)`).run(
      JSON.stringify({ text: "Water." }),
    );
    legacy.close();

    const before = new Database(legacyPath);
    const beforeCount = (before.prepare(`SELECT COUNT(*) AS n FROM master_plant_i18n`).get() as { n: number }).n;
    before.close();

    const migrated = createDatabase(legacyPath);
    const afterCount = (migrated.prepare(`SELECT COUNT(*) AS n FROM master_plant_i18n`).get() as { n: number }).n;
    const fk = (migrated.prepare(`PRAGMA foreign_key_check`).all() as unknown[]).length;
    expect(afterCount).toBe(beforeCount);
    expect(fk).toBe(0);
    expect((migrated.prepare(`SELECT COUNT(*) AS n FROM master_plant_i18n WHERE locale IN ('vi','en')`).get() as { n: number }).n).toBe(2);
    migrated.close();
  });
});
