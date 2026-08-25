import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { createDatabase, type SqliteDatabase } from "../src/db";
import {
  applyContentImport,
  dryRunContentImport,
  exactUtf8Digest,
  generatePestDiseaseManifest,
  initializePlantManifest,
  refreshPestDiseaseManifests,
  refreshPlantManifests,
  stableJson,
  validateContentManifest,
  validatePlantMarkdownPestLinks,
  type PlantContentManifest,
} from "../src/content-manifests";

import {
  CANONICAL_IDENTITY_VERSION,
  canonicalKeyFromPlantIdentity,
  type CanonicalInfraspecificRank,
} from "../../../packages/shared/src/canonicalPlantIdentity";

const databases: SqliteDatabase[] = [];
const temporaryDirectories: string[] = [];
const REPOSITORY_ROOT = path.resolve(__dirname, "../../..");

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

function openDatabase(): SqliteDatabase {
  const db = createDatabase(":memory:");
  databases.push(db);
  return db;
}

function temporaryDirectory(prefix = "richfarm-cid6-content-"): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function plantContentDirectory(root: string, slug: string, locales: { en?: string; vi?: string } = {}): string {
  const directory = path.join(root, slug);
  fs.mkdirSync(directory, { recursive: true });
  if (locales.en !== undefined) fs.writeFileSync(path.join(directory, "en.md"), locales.en, "utf8");
  if (locales.vi !== undefined) fs.writeFileSync(path.join(directory, "vi.md"), locales.vi, "utf8");
  return directory;
}

function insertPlant(db: SqliteDatabase, options: {
  id?: number;
  plantCode: string;
  genus: string;
  species: string;
  rank?: CanonicalInfraspecificRank | null;
  infraspecificName?: string | null;
  canonicalStatus?: "active" | "archived" | "quarantined";
  careContent?: string | null;
  contentVersion?: number;
}): number {
  const rank = options.rank ?? null;
  const infraspecificName = options.infraspecificName ?? null;
  const scope = "base" as const;
  const canonicalKey = canonicalKeyFromPlantIdentity({
    genus: options.genus,
    species: options.species,
    rank,
    infraspecificName,
    cultivar: null,
    scope,
    parentCanonicalKey: null,
    parentMasterPlantId: null,
  });
  const columns = [
    ...(options.id === undefined ? [] : ["id"]),
    "plant_code",
    "common_name",
    "scientific_name",
    "source_system",
    "source_id",
    "canonical_identity_version",
    "canonical_key",
    "genus",
    "species",
    "infraspecific_rank",
    "infraspecific_name",
    "cultivar",
    "identity_scope",
    "parent_master_plant_id",
    "parent_canonical_key",
    "canonical_status",
  ];
  const values: unknown[] = [
    ...(options.id === undefined ? [] : [options.id]),
    options.plantCode,
    options.plantCode,
    `${options.genus} ${options.species}`,
    "sqlite",
    `cid6-${options.plantCode.toLowerCase()}`,
    CANONICAL_IDENTITY_VERSION,
    canonicalKey,
    options.genus.toLowerCase(),
    options.species.toLowerCase(),
    rank,
    infraspecificName,
    null,
    scope,
    null,
    null,
    options.canonicalStatus ?? "active",
  ];
  const result = db.prepare(`INSERT INTO master_plants (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...values);
  const id = Number(result.lastInsertRowid);
  for (const locale of ["en", "vi"]) {
    db.prepare(`
      INSERT INTO master_plant_i18n
        (master_plant_id, locale, common_name, care_content, content_version,
         content_status, review_status, content_origin, source_refs_json)
      VALUES (?, ?, ?, ?, ?, 'published', 'unreviewed', 'imported', '[]')
    `).run(id, locale, options.plantCode, options.careContent ?? null, options.contentVersion ?? 1);
  }
  return id;
}

function writeGeneratedPlantManifest(db: SqliteDatabase, directoryPath: string, plantCode: string): PlantContentManifest {
  const result = initializePlantManifest({ db, directoryPath, plantCode });
  expect(result.findings.filter((item) => item.severity === "blocked")).toEqual([]);
  expect(result.manifest).not.toBeNull();
  fs.writeFileSync(result.manifestPath, stableJson(result.manifest), "utf8");
  return result.manifest as PlantContentManifest;
}

function findingCodes(report: { findings: Array<{ code: string }> }): string[] {
  return report.findings.map((item) => item.code);
}

describe("CID-6 Git Markdown content manifests", () => {
  it("rejects dangling or malformed plant Markdown pest links with source path and locale", () => {
    const root = temporaryDirectory();
    const directory = plantContentDirectory(root, "solanum-lycopersicum", {
      en: "[Aphids](richfarm://pests-diseases/aphids)\n[Missing](richfarm://pests-diseases/missing_key)\n",
      vi: "[Sai](richfarm://pests-diseases/)\n",
    });

    const report = validatePlantMarkdownPestLinks({
      contentRoot: root,
      catalog: [{ key: "aphids", type: "pest" }],
    });

    expect(report.filesScanned).toBe(2);
    expect(report.linksScanned).toBe(3);
    expect(report.valid).toBe(false);
    const missing = report.findings.find((item) => item.code === "PEST_LINK_KEY_UNKNOWN");
    expect(missing).toMatchObject({
      path: path.join(directory, "en.md"),
      evidence: { sourcePath: path.join(directory, "en.md"), locale: "en", key: "missing_key" },
    });
    const malformed = report.findings.find((item) => item.code === "PEST_LINK_MALFORMED");
    expect(malformed).toMatchObject({
      path: path.join(directory, "vi.md"),
      evidence: { sourcePath: path.join(directory, "vi.md"), locale: "vi" },
    });
  });

  it("keeps stable JSON and exact UTF-8 bytes across repeated generation", () => {
    const db = openDatabase();
    const root = temporaryDirectory();
    const directory = plantContentDirectory(root, "solanum-lycopersicum", {
      en: "# Tomato\n\nKeep moist.\n",
      vi: "# Cà chua\r\n\r\nGiữ ẩm.\r\n",
    });
    insertPlant(db, { plantCode: "SOLANUM_LYCOPERSICUM", genus: "Solanum", species: "lycopersicum" });

    const first = initializePlantManifest({ db, directoryPath: directory, plantCode: "SOLANUM_LYCOPERSICUM" });
    const second = initializePlantManifest({ db, directoryPath: directory, plantCode: "SOLANUM_LYCOPERSICUM" });
    expect(first.manifest).not.toBeNull();
    expect(stableJson(first.manifest)).toBe(stableJson(second.manifest));
    const enBytes = fs.readFileSync(path.join(directory, "en.md"));
    const viBytes = fs.readFileSync(path.join(directory, "vi.md"));
    expect(first.manifest?.locales.en).toMatchObject(exactUtf8Digest(enBytes));
    expect(first.manifest?.locales.vi).toMatchObject(exactUtf8Digest(viBytes));
    expect(fs.readFileSync(path.join(directory, "vi.md"))).toEqual(viBytes);
    expect(stableJson({ z: 1, a: { y: 2, x: 3 } })).toBe(stableJson({ a: { x: 3, y: 2 }, z: 1 }));
  });

  it("rejects canonical-key and immutable plant_code tampering", () => {
    const db = openDatabase();
    const root = temporaryDirectory();
    const directory = plantContentDirectory(root, "solanum-lycopersicum", { en: "en", vi: "vi" });
    insertPlant(db, { plantCode: "SOLANUM_LYCOPERSICUM", genus: "Solanum", species: "lycopersicum" });
    const manifest = writeGeneratedPlantManifest(db, directory, "SOLANUM_LYCOPERSICUM");
    const manifestPath = path.join(directory, "content.json");

    fs.writeFileSync(manifestPath, stableJson({ ...manifest, canonical_key: "tampered" }), "utf8");
    const keyTamper = dryRunContentImport(db, { manifestPaths: [manifestPath], repositoryRoot: REPOSITORY_ROOT });
    expect(keyTamper.status).toBe("blocked");
    expect(findingCodes(keyTamper)).toContain("CANONICAL_KEY_RECOMPUTE_MISMATCH");

    fs.writeFileSync(manifestPath, stableJson({ ...manifest, plant_code: "SOLANUM_TAMPERED" }), "utf8");
    const plantCodeTamper = dryRunContentImport(db, { manifestPaths: [manifestPath], repositoryRoot: REPOSITORY_ROOT });
    expect(plantCodeTamper.status).toBe("blocked");
    expect(findingCodes(plantCodeTamper)).toContain("MISSING_PLANT_TARGET");
  });

  it("binds apply to the exact fingerprint and sorted manifest path set", () => {
    const db = openDatabase();
    const root = temporaryDirectory();
    const firstDirectory = plantContentDirectory(root, "solanum-lycopersicum", { en: "one en", vi: "one vi" });
    const secondDirectory = plantContentDirectory(root, "capsicum-annuum", { en: "two en", vi: "two vi" });
    insertPlant(db, { plantCode: "SOLANUM_LYCOPERSICUM", genus: "Solanum", species: "lycopersicum" });
    insertPlant(db, { plantCode: "CAPSICUM_ANNUUM", genus: "Capsicum", species: "annuum" });
    const firstPath = path.join(firstDirectory, "content.json");
    const secondPath = path.join(secondDirectory, "content.json");
    const firstManifest = writeGeneratedPlantManifest(db, firstDirectory, "SOLANUM_LYCOPERSICUM");
    writeGeneratedPlantManifest(db, secondDirectory, "CAPSICUM_ANNUUM");

    const report = dryRunContentImport(db, { manifestPaths: [firstPath], repositoryRoot: REPOSITORY_ROOT });
    const repeated = dryRunContentImport(db, { manifestPaths: [firstPath], repositoryRoot: REPOSITORY_ROOT });
    expect(report.status).toBe("ready");
    expect(report.target_db_revision).toBe(report.database_sha256);
    expect(report.manifest_paths).toEqual([path.resolve(firstPath)]);
    expect(report.proposal_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(repeated.proposal_fingerprint).toBe(report.proposal_fingerprint);

    fs.writeFileSync(firstPath, stableJson({
      ...firstManifest,
      locales: Object.fromEntries(Object.entries(firstManifest.locales).map(([locale, item]) => [locale, { ...item, content_version: 2 }])),
    }), "utf8");
    expect(() => applyContentImport(db, report, {
      authorized: true,
      runId: "cid6-fingerprint-edit",
      manifestPaths: [firstPath],
      repositoryRoot: REPOSITORY_ROOT,
    })).toThrow("CONTENT_IMPORT_PROPOSAL_MISMATCH");

    fs.writeFileSync(firstPath, stableJson(firstManifest), "utf8");
    expect(() => applyContentImport(db, report, {
      authorized: true,
      runId: "cid6-fingerprint-path-set",
      manifestPaths: [firstPath, secondPath],
      repositoryRoot: REPOSITORY_ROOT,
    })).toThrow("CONTENT_IMPORT_PROPOSAL_MISMATCH");
  });

  it("maps explicit rank directory identities to their structured targets", () => {
    const db = openDatabase();
    const root = temporaryDirectory();
    plantContentDirectory(root, "brassica-rapa-subsp-chinensis", { en: "en", vi: "vi" });
    plantContentDirectory(root, "brassica-oleracea-var-capitata", { en: "en", vi: "vi" });
    insertPlant(db, { id: 49, plantCode: "BRASSICA_RAPA_SUBSP_CHINENSIS", genus: "Brassica", species: "rapa", rank: "subsp", infraspecificName: "chinensis" });
    insertPlant(db, { id: 50, plantCode: "BRASSICA_OLERACEA_VAR_CAPITATA", genus: "Brassica", species: "oleracea", rank: "var", infraspecificName: "capitata" });

    const result = refreshPlantManifests({ db, contentRoot: root });
    expect(result.summary).toMatchObject({ directories: 2, generated: 2, blocked: 0, locales: 4 });
    expect(result.manifests.map((item) => [item.directory, item.targetId])).toEqual([
      ["brassica-oleracea-var-capitata", 50],
      ["brassica-rapa-subsp-chinensis", 49],
    ]);
    const generated = initializePlantManifest({ db, directoryPath: path.join(root, "brassica-rapa-subsp-chinensis"), plantCode: "BRASSICA_RAPA_SUBSP_CHINENSIS" });
    expect(generated.manifest).toMatchObject({ infraspecific_rank: "subsp", infraspecific_name: "chinensis", scope: "base", cultivar: null });
  });

  it("blocks missing locales and quarantined targets without writing manifests", () => {
    const db = openDatabase();
    const root = temporaryDirectory();
    const missing = plantContentDirectory(root, "solanum-lycopersicum", { vi: "vi" });
    const quarantinedRoot = temporaryDirectory();
    const quarantined = plantContentDirectory(quarantinedRoot, "basella-alba", { en: "en", vi: "vi" });
    insertPlant(db, { plantCode: "SOLANUM_LYCOPERSICUM", genus: "Solanum", species: "lycopersicum" });
    insertPlant(db, { plantCode: "BASELLA_ALBA", genus: "Basella", species: "alba", canonicalStatus: "quarantined" });

    const missingResult = refreshPlantManifests({ db, contentRoot: root, write: true });
    expect(missingResult.summary.blocked).toBe(1);
    expect(findingCodes(missingResult)).toContain("MISSING_LOCALE_FILE");
    expect(fs.existsSync(path.join(missing, "content.json"))).toBe(false);
    const quarantineResult = refreshPlantManifests({ db, contentRoot: quarantinedRoot, write: true });
    expect(quarantineResult.summary.blocked).toBe(1);
    expect(findingCodes(quarantineResult)).toContain("PLANT_TARGET_NOT_ACTIVE");
    expect(fs.existsSync(path.join(quarantined, "content.json"))).toBe(false);
  });

  it("distinguishes stale hash/version conflicts from an explicitly reviewed replacement", () => {
    const db = openDatabase();
    const root = temporaryDirectory();
    const directory = plantContentDirectory(root, "solanum-lycopersicum", { en: "new en", vi: "new vi" });
    insertPlant(db, { plantCode: "SOLANUM_LYCOPERSICUM", genus: "Solanum", species: "lycopersicum", careContent: "old database", contentVersion: 1 });
    const manifest = writeGeneratedPlantManifest(db, directory, "SOLANUM_LYCOPERSICUM");
    const manifestPath = path.join(directory, "content.json");

    const stale = dryRunContentImport(db, { manifestPaths: [manifestPath] });
    expect(stale.status).toBe("blocked");
    expect(stale.summary.conflicts).toBe(2);
    expect(stale.findings.filter((item) => item.code === "CONTENT_HASH_CONFLICT").every((item) => item.severity === "blocked")).toBe(true);

    const reviewed = {
      ...manifest,
      locales: Object.fromEntries(Object.entries(manifest.locales).map(([locale, item]) => [locale, {
        ...item,
        content_version: 2,
        review_status: "reviewed" as const,
        source_refs: [{ sourceSystem: "editorial", sourceLocator: `cid6/${locale}` }],
        conflict_resolution: {
          resolution: "replace_database" as const,
          reviewedBy: "cid6-test",
          reviewedAt: "2026-08-25T00:00:00Z",
          reason: "focused test replacement",
        },
      }])),
    };
    fs.writeFileSync(manifestPath, stableJson(reviewed), "utf8");
    const reviewedReport = dryRunContentImport(db, { manifestPaths: [manifestPath] });
    expect(reviewedReport.status).toBe("ready");
    expect(reviewedReport.findings.filter((item) => item.code === "CONTENT_HASH_CONFLICT_REVIEWED").every((item) => item.severity === "warning")).toBe(true);

    fs.writeFileSync(path.join(directory, "en.md"), "hash drift", "utf8");
    const hashDrift = dryRunContentImport(db, { manifestPaths: [manifestPath] });
    expect(hashDrift.status).toBe("blocked");
    expect(findingCodes(hashDrift)).toContain("CONTENT_HASH_MISMATCH");
  });

  it("keeps dry-run byte-identical and applies content with pending outbox entries", () => {
    const db = openDatabase();
    const root = temporaryDirectory();
    const directory = plantContentDirectory(root, "solanum-lycopersicum", { en: "apply en", vi: "apply vi" });
    insertPlant(db, { plantCode: "SOLANUM_LYCOPERSICUM", genus: "Solanum", species: "lycopersicum" });
    const manifestPath = path.join(directory, "content.json");
    writeGeneratedPlantManifest(db, directory, "SOLANUM_LYCOPERSICUM");
    const before = db.serialize().toString("hex");
    const beforeOutbox = db.prepare(`SELECT COUNT(*) AS count FROM sync_outbox`).get() as { count: number };
    const report = dryRunContentImport(db, { manifestPaths: [manifestPath] });
    expect(report.status).toBe("ready");
    expect(db.serialize().toString("hex")).toBe(before);
    expect((db.prepare(`SELECT COUNT(*) AS count FROM sync_outbox`).get() as { count: number }).count).toBe(beforeOutbox.count);
    expect(() => applyContentImport(db, report, { authorized: false, runId: "cid6-auth-required", manifestPaths: [manifestPath] })).toThrow("CONTENT_IMPORT_ADMIN_AUTH_REQUIRED");

    const applied = applyContentImport(db, report, { authorized: true, runId: "cid6-apply-test", manifestPaths: [manifestPath] });
    expect(applied).toMatchObject({ status: "applied", updatedLocales: 2, queuedOutbox: 2 });
    expect(db.prepare(`SELECT locale, care_content FROM master_plant_i18n ORDER BY locale`).all()).toEqual([
      { locale: "en", care_content: "apply en" },
      { locale: "vi", care_content: "apply vi" },
    ]);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM sync_outbox WHERE operation = 'upsert_i18n' AND status = 'pending'`).get()).toEqual({ count: 2 });
  });

  it("rolls back all locale and outbox writes when apply fails mid-transaction", () => {
    const db = openDatabase();
    const root = temporaryDirectory();
    const directory = plantContentDirectory(root, "solanum-lycopersicum", { en: "transaction en", vi: "transaction vi" });
    insertPlant(db, { plantCode: "SOLANUM_LYCOPERSICUM", genus: "Solanum", species: "lycopersicum" });
    const manifestPath = path.join(directory, "content.json");
    writeGeneratedPlantManifest(db, directory, "SOLANUM_LYCOPERSICUM");
    db.exec(`
      CREATE TRIGGER cid6_test_abort_vi
      BEFORE UPDATE OF care_content ON master_plant_i18n
      WHEN NEW.locale = 'vi'
      BEGIN
        SELECT RAISE(ABORT, 'CID6_TEST_APPLY_FAILURE');
      END;
    `);
    const report = dryRunContentImport(db, { manifestPaths: [manifestPath] });
    expect(report.status).toBe("ready");
    expect(() => applyContentImport(db, report, { authorized: true, runId: "cid6-rollback-test", manifestPaths: [manifestPath] })).toThrow("CID6_TEST_APPLY_FAILURE");
    expect(db.prepare(`SELECT locale, care_content FROM master_plant_i18n ORDER BY locale`).all()).toEqual([
      { locale: "en", care_content: null },
      { locale: "vi", care_content: null },
    ]);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM sync_outbox`).get()).toEqual({ count: 0 });
  });

  it("requires stable pest keys and all required locales", () => {
    const root = temporaryDirectory();
    const validDirectory = path.join(root, "aphids");
    fs.mkdirSync(validDirectory, { recursive: true });
    fs.writeFileSync(path.join(validDirectory, "en.md"), "aphids en", "utf8");
    fs.writeFileSync(path.join(validDirectory, "vi.md"), "aphids vi", "utf8");
    const valid = generatePestDiseaseManifest({ directoryPath: validDirectory, catalog: [{ key: "aphids", type: "pest" }] });
    expect(valid.findings).toEqual([]);
    expect(valid.manifest?.key).toBe("aphids");

    const unknownDirectory = path.join(root, "unknown-key");
    fs.mkdirSync(unknownDirectory, { recursive: true });
    fs.writeFileSync(path.join(unknownDirectory, "en.md"), "en", "utf8");
    const unknown = generatePestDiseaseManifest({ directoryPath: unknownDirectory, catalog: [{ key: "aphids", type: "pest" }] });
    expect(findingCodes(unknown)).toContain("MISSING_PEST_DISEASE_TARGET");

    const missingLocaleDirectory = path.join(root, "aphids-missing");
    fs.mkdirSync(missingLocaleDirectory, { recursive: true });
    fs.writeFileSync(path.join(missingLocaleDirectory, "en.md"), "en", "utf8");
    const missingLocale = generatePestDiseaseManifest({ directoryPath: missingLocaleDirectory, catalog: [{ key: "aphids-missing", type: "pest" }] });
    expect(findingCodes(missingLocale)).toContain("MISSING_LOCALE_FILE");
    const refresh = refreshPestDiseaseManifests({ contentRoot: root, catalog: [{ key: "aphids", type: "pest" }] });
    expect(refresh.summary.blocked).toBe(2);
  });

  it("requires an explicit pest catalog snapshot and rejects key/type tampering", () => {
    const db = openDatabase();
    const root = temporaryDirectory();
    const directory = path.join(root, "aphids");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "en.md"), "aphids en", "utf8");
    fs.writeFileSync(path.join(directory, "vi.md"), "aphids vi", "utf8");
    const generated = generatePestDiseaseManifest({ directoryPath: directory, catalog: [{ key: "aphids", type: "pest" }] });
    expect(generated.manifest).not.toBeNull();
    const manifestPath = path.join(directory, "content.json");
    fs.writeFileSync(manifestPath, stableJson(generated.manifest), "utf8");
    const catalog = [{ key: "aphids", type: "pest" as const }];

    const missingCatalog = dryRunContentImport(db, { manifestPaths: [manifestPath], repositoryRoot: REPOSITORY_ROOT });
    expect(missingCatalog.status).toBe("blocked");
    expect(findingCodes(missingCatalog)).toContain("PEST_CATALOG_REQUIRED");
    const valid = dryRunContentImport(db, { manifestPaths: [manifestPath], repositoryRoot: REPOSITORY_ROOT, catalog });
    expect(valid.status).toBe("ready");
    expect(valid.catalog_snapshot).toEqual(catalog);
    expect(valid.catalog_provided).toBe(true);

    const wrongType = dryRunContentImport(db, { manifestPaths: [manifestPath], repositoryRoot: REPOSITORY_ROOT, catalog: [{ key: "aphids", type: "disease" }] });
    expect(wrongType.status).toBe("blocked");
    expect(findingCodes(wrongType)).toContain("PEST_CATALOG_TYPE_MISMATCH");
    const unknownKey = dryRunContentImport(db, { manifestPaths: [manifestPath], repositoryRoot: REPOSITORY_ROOT, catalog: [{ key: "unknown", type: "pest" }] });
    expect(unknownKey.status).toBe("blocked");
    expect(findingCodes(unknownKey)).toContain("PEST_CATALOG_KEY_UNKNOWN");

    fs.writeFileSync(manifestPath, stableJson({ ...(generated.manifest as object), type: "disease" }), "utf8");
    const tamperedType = dryRunContentImport(db, { manifestPaths: [manifestPath], repositoryRoot: REPOSITORY_ROOT, catalog });
    expect(tamperedType.status).toBe("blocked");
    expect(findingCodes(tamperedType)).toContain("PEST_CATALOG_TYPE_MISMATCH");

    fs.writeFileSync(manifestPath, stableJson(generated.manifest), "utf8");
    expect(() => applyContentImport(db, valid, {
      authorized: true,
      runId: "cid6-catalog-tamper",
      manifestPaths: [manifestPath],
      repositoryRoot: REPOSITORY_ROOT,
      catalog: [{ key: "aphids", type: "disease" }],
    })).toThrow("CONTENT_IMPORT_PROPOSAL_MISMATCH");
  });

  it("validates every generated repository manifest as stable JSON", () => {
    const repositoryRoot = REPOSITORY_ROOT;
    const manifestPaths = ["plants", "pests-diseases"].flatMap((category) => {
      const categoryRoot = path.join(repositoryRoot, "content", category);
      return fs.readdirSync(categoryRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(categoryRoot, entry.name, "content.json"))
        .filter((filePath) => fs.existsSync(filePath));
    }).sort();
    expect(manifestPaths).toHaveLength(56);
    for (const manifestPath of manifestPaths) {
      const bytes = fs.readFileSync(manifestPath, "utf8");
      const parsed = JSON.parse(bytes) as unknown;
      expect(validateContentManifest(parsed, manifestPath).valid, manifestPath).toBe(true);
      expect(stableJson(parsed), manifestPath).toBe(bytes);
    }
  });

  it("refuses CLI apply even before opening a database", () => {
    const repositoryRoot = REPOSITORY_ROOT;
    const scriptPath = path.join(repositoryRoot, "scripts", "content-manifests.ts");
    const result = spawnSync(process.execPath, ["--import", "tsx", scriptPath, "--action", "refresh", "--apply", "--db", "missing.sqlite"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("CONTENT_IMPORT_APPLY_DISABLED_IN_CID6_ITERATION");
  });
});
