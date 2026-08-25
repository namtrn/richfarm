import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  auditCanonicalIdentity,
  auditCanonicalIdentityFile,
} from "../src/canonical-identity-audit";
import { createDatabase, type SqliteDatabase } from "../src/db";

const openDatabases: SqliteDatabase[] = [];

afterEach(() => {
  while (openDatabases.length > 0) openDatabases.pop()?.close();
});

function plant(db: SqliteDatabase, values: {
  id?: number;
  plantCode: string;
  scientificName: string;
  metadata?: Record<string, unknown>;
  directCultivar?: string | null;
  canonicalKey?: string;
  canonicalStatus?: "active" | "archived" | "quarantined";
  canonicalIdentityVersion?: string;
  archivedIntoId?: number;
}) {
  const columns = ["plant_code", "common_name", "scientific_name", "metadata_json", "canonical_status"];
  const params: unknown[] = [
    values.plantCode,
    values.plantCode,
    values.scientificName,
    JSON.stringify(values.metadata ?? {}),
    values.canonicalStatus ?? "quarantined",
  ];
  if (values.id !== undefined) {
    columns.unshift("id");
    params.unshift(values.id);
  }
  if (values.canonicalKey !== undefined) {
    columns.push("canonical_key");
    params.push(values.canonicalKey);
    columns.push("canonical_identity_version");
    params.push(values.canonicalIdentityVersion ?? "canonical_identity_v1");
  }
  if (values.archivedIntoId !== undefined) {
    columns.push("canonical_archived_into_id");
    params.push(values.archivedIntoId);
  }
  if (values.directCultivar !== undefined) {
    columns.push("cultivar");
    params.push(values.directCultivar);
  }
  // :memory: databases use the current migration schema; canonical_key is
  // intentionally added only by the future CID-3 migration, so this test
  // exercises both legacy and explicit-key audit inputs separately.
  db.prepare(`INSERT INTO master_plants (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...params);
}

describe("canonical identity audit", () => {
  it("finds an exact legacy duplicate without writing SQLite", () => {
    const db = createDatabase(":memory:");
    openDatabases.push(db);
    const canonicalKey = '["v1","solanum","lycopersicum","","",""]';
    plant(db, {
      id: 6,
      plantCode: "TOMATO_A",
      scientificName: "Solanum lycopersicum",
      canonicalStatus: "active",
      canonicalKey,
    });
    plant(db, {
      id: 1554,
      plantCode: "TOMATO_B",
      scientificName: "Solanum lycopersicum",
      canonicalStatus: "active",
      canonicalKey,
    });

    const first = auditCanonicalIdentity(db);
    const second = auditCanonicalIdentity(db);
    expect(second).toEqual(first);
    expect(first.status).toBe("blocked");
    expect(first.findings).toContainEqual(expect.objectContaining({
      code: "DUPLICATE_CANONICAL_KEY_SQLITE",
      evidence: expect.objectContaining({
        classification: "exact_duplicate",
        rowIds: [6, 1554],
      }),
    }));
    expect(first.findings.some((finding) => finding.sqliteIdentities.some((identity) => identity.id === 6))).toBe(true);
    expect(first.findings.some((finding) => finding.sqliteIdentities.some((identity) => identity.id === 1554))).toBe(true);
  });

  it("treats a valid archived redirect as a non-blocking canonical alias", () => {
    const db = createDatabase(":memory:");
    openDatabases.push(db);
    const canonicalKey = '["v1","solanum","lycopersicum","","",""]';
    plant(db, {
      id: 1554,
      plantCode: "SOLANUM_LYCOPERSICUM",
      scientificName: "Solanum lycopersicum",
      canonicalStatus: "active",
      canonicalKey,
    });
    plant(db, {
      id: 6,
      plantCode: "SOLANUM_LYCOPERSICUM_D50D81CYHR",
      scientificName: "Solanum lycopersicum",
      canonicalStatus: "archived",
      canonicalKey,
      archivedIntoId: 1554,
    });

    const report = auditCanonicalIdentity(db);
    expect(report.status).toBe("healthy");
    expect(report.sources.sqlite.duplicateCanonicalKeyCount).toBe(0);
    expect(report.findings).toContainEqual(expect.objectContaining({
      severity: "info",
      code: "ARCHIVED_CANONICAL_ALIAS_SQLITE",
      canonicalKey,
      evidence: expect.objectContaining({
        classification: "archived_alias",
        rowId: 6,
        targetRowId: 1554,
        targetCanonicalKey: canonicalKey,
        activeWinnerRowIds: [1554],
      }),
    }));
    expect(report.findings.some((finding) => finding.code === "DUPLICATE_CANONICAL_KEY_SQLITE")).toBe(false);
  });

  it("blocks an archived row whose redirect target is missing or mismatched", () => {
    const db = createDatabase(":memory:");
    openDatabases.push(db);
    const canonicalKey = '["v1","solanum","lycopersicum","","",""]';
    plant(db, {
      id: 1554,
      plantCode: "SOLANUM_LYCOPERSICUM",
      scientificName: "Solanum lycopersicum",
      canonicalStatus: "active",
      canonicalKey,
    });
    plant(db, {
      id: 6,
      plantCode: "SOLANUM_LYCOPERSICUM_D50D81CYHR",
      scientificName: "Solanum lycopersicum",
      canonicalStatus: "archived",
      canonicalKey,
      archivedIntoId: 9999,
    });

    const report = auditCanonicalIdentity(db);
    expect(report.status).toBe("blocked");
    expect(report.findings).toContainEqual(expect.objectContaining({
      severity: "blocked",
      code: "ARCHIVED_CANONICAL_REDIRECT_INVALID_SQLITE",
      evidence: expect.objectContaining({
        classification: "invalid_archived_alias",
        rowId: 6,
        redirectTargetId: 9999,
        reasons: expect.arrayContaining(["archive_target_not_found"]),
      }),
    }));
    expect(report.findings.some((finding) => finding.code === "DUPLICATE_CANONICAL_KEY_SQLITE")).toBe(false);
  });

  it("keeps cultivar and infraspecific identities distinct", () => {
    const db = createDatabase(":memory:");
    openDatabases.push(db);
    plant(db, {
      plantCode: "BASE",
      scientificName: "Brassica rapa subsp. chinensis",
    });
    plant(db, {
      plantCode: "CULTIVAR",
      scientificName: "Brassica rapa",
      metadata: { cultivar: "Cantonese\u00a0Green" },
    });
    const report = auditCanonicalIdentity(db);
    expect(report.sources.sqlite.duplicateCanonicalKeyCount).toBe(0);
    const cultivarParentFindings = report.findings.filter((finding) => (
      finding.sqliteIdentities.some((identity) => identity.plantCode === "CULTIVAR")
    ));
    expect(cultivarParentFindings.map((finding) => finding.code)).toEqual(["MISSING_BASE_PARENT"]);
    expect(report.findings.some((finding) => finding.code === "DUPLICATE_CANONICAL_KEY_SQLITE")).toBe(false);
  });

  it("audits exact legacy rank metadata after nullable direct columns are installed", () => {
    const db = createDatabase(":memory:");
    openDatabases.push(db);
    const fixtures = [
      [49, "Brassica rapa", "subsp. chinensis"],
      [53, "Brassica rapa", "subsp. pekinensis"],
      [120, "Brassica rapa", "subsp. rapa"],
      [471, "Brassica rapa", "subsp. narinosa"],
      [50, "Brassica oleracea", "var. capitata"],
      [435, "Brassica oleracea", "var. sabellica"],
      [591, "Brassica napus", "var. napobrassica"],
    ] as const;
    for (const [id, scientificName, qualifier] of fixtures) {
      plant(db, {
        id,
        plantCode: `LEGACY_${id}`,
        scientificName,
        directCultivar: null,
        metadata: { cultivar: qualifier, cultivarNormalized: qualifier },
      });
    }
    for (const [id, scientificName] of [
      [1548, "Brassica rapa"],
      [1549, "Brassica oleracea"],
      [1550, "Brassica napus"],
    ] as const) {
      plant(db, {
        id,
        plantCode: `LEGACY_${id}`,
        scientificName,
        directCultivar: null,
        metadata: { cultivarNormalized: "__default__" },
      });
    }

    const report = auditCanonicalIdentity(db);
    expect(report.sources.sqlite.duplicateCanonicalKeyCount).toBe(0);
    expect(report.summary.legacyParentlessCultivars).toBe(0);
    expect(report.findings.some((finding) => finding.code === "DUPLICATE_CANONICAL_KEY_SQLITE")).toBe(false);
  });

  it("compares a complete Convex snapshot without using sync/upsert paths", () => {
    const db = createDatabase(":memory:");
    openDatabases.push(db);
    plant(db, { plantCode: "TOMATO", scientificName: "Solanum lycopersicum" });
    const report = auditCanonicalIdentity(db, {
      convexSnapshot: {
        rows: [{
          _id: "convex-1",
          plantCode: "TOMATO",
          scientificName: "Solanum lycopersicum",
          recordVersion: 1,
        }],
        expectedCount: 1,
        pageCount: 1,
        terminalCursor: null,
        complete: true,
      },
    });
    expect(report.freshnessBoundary.snapshotComplete).toBe(true);
    expect(report.findings.some((finding) => finding.code === "VERSION_REGRESSION")).toBe(false);
    expect(report.findings.some((finding) => finding.code === "CANONICAL_IDENTITY_DRIFT")).toBe(false);
  });

  it("opens a DB file read-only and leaves its bytes unchanged", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "richfarm-cid-"));
    const dbPath = path.join(directory, "audit.db");
    const writer = createDatabase(dbPath);
    plant(writer, { plantCode: "TOMATO", scientificName: "Solanum lycopersicum" });
    writer.close();
    const before = crypto.createHash("sha256").update(fs.readFileSync(dbPath)).digest("hex");
    const report = auditCanonicalIdentityFile(dbPath);
    const after = crypto.createHash("sha256").update(fs.readFileSync(dbPath)).digest("hex");
    expect(report.sources.sqlite.rowCount).toBe(1);
    expect(after).toBe(before);
    fs.rmSync(directory, { recursive: true, force: true });
  });
});
