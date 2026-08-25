import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { pestsDiseasesSeed } from "../packages/convex/convex/data/pestsDiseasesSeed";
import {
  CONTENT_MANIFEST_FILE,
  dryRunContentImport,
  exactUtf8Digest,
  initializePlantManifest,
  refreshPestDiseaseManifests,
  refreshPlantManifests,
  stableJson,
  validateContentManifest,
} from "../apps/api/src/content-manifests";

const REPOSITORY_ROOT = path.resolve(__dirname, "..");

interface CliOptions {
  action: "refresh" | "init" | "dry-run-import" | "validate";
  kind: "all" | "plants" | "pests-diseases";
  dbPath: string;
  contentRoot: string;
  directoryPath?: string;
  plantCode?: string;
  manifestPaths: string[];
  outputPath?: string;
  write: boolean;
  apply: boolean;
}

function resolveRepositoryPath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(REPOSITORY_ROOT, value);
}

function defaultDatabasePath(): string {
  const configured = process.env.DB_PATH?.trim();
  if (configured) return resolveRepositoryPath(configured);
  return resolveRepositoryPath("apps/api/data/richfarm.db");
}

function usage(): string {
  return [
    "Usage: npm run content:manifests -- [options]",
    "",
    "Actions:",
    "  --action refresh          Read-only workspace refresh (add --write to write content.json)",
    "  --action init             Generate one plant manifest for an explicit plant_code",
    "  --action dry-run-import   Validate selected manifests against read-only SQLite",
    "  --action validate         Validate one manifest JSON file and Markdown hashes",
    "",
    "Options:",
    "  --db <path>               SQLite file (default: DB_PATH or apps/api/data/richfarm.db)",
    "  --content-root <path>     Content root (default: content)",
    "  --kind <kind>             all, plants, or pests-diseases (default: all)",
    "  --directory <path>        Plant directory for init",
    "  --plant-code <code>       Explicit immutable plant_code for init",
    "  --manifest <path>         Manifest path (repeatable for dry-run-import)",
    "  --output <path>           Write deterministic JSON report to this path",
    "  --write                   Write generated content.json files only",
    "  --apply                   Refused: this CLI iteration never applies to SQLite",
    "  --help                    Show this help",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    action: "refresh",
    kind: "all",
    dbPath: defaultDatabasePath(),
    contentRoot: resolveRepositoryPath("content"),
    manifestPaths: [],
    write: false,
    apply: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (arg === "--write") {
      options.write = true;
      continue;
    }
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}\n\n${usage()}`);
    if (arg === "--action") {
      if (value !== "refresh" && value !== "init" && value !== "dry-run-import" && value !== "validate") throw new Error(`Unsupported action: ${value}`);
      options.action = value;
    } else if (arg === "--kind") {
      if (value !== "all" && value !== "plants" && value !== "pests-diseases") throw new Error(`Unsupported kind: ${value}`);
      options.kind = value;
    } else if (arg === "--db") options.dbPath = resolveRepositoryPath(value);
    else if (arg === "--content-root") options.contentRoot = resolveRepositoryPath(value);
    else if (arg === "--directory") options.directoryPath = resolveRepositoryPath(value);
    else if (arg === "--plant-code") options.plantCode = value;
    else if (arg === "--manifest") options.manifestPaths.push(resolveRepositoryPath(value));
    else if (arg === "--output") options.outputPath = resolveRepositoryPath(value);
    else throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
    index += 1;
  }
  return options;
}

function writeReport(report: unknown, outputPath?: string): void {
  const json = stableJson(report);
  if (!outputPath) {
    process.stdout.write(json);
    return;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json, "utf8");
  process.stdout.write(json);
}

function writeManifest(manifestPath: string, value: unknown): void {
  fs.writeFileSync(manifestPath, stableJson(value), "utf8");
}

function openReadOnlyDatabase(databasePath: string): Database.Database {
  const resolved = resolveRepositoryPath(databasePath);
  if (!fs.existsSync(resolved)) throw new Error(`SQLite database does not exist: ${resolved}`);
  const db = new Database(resolved, { readonly: true, fileMustExist: true });
  db.pragma("foreign_keys = ON");
  return db;
}

function refresh(options: CliOptions, db: Database.Database): Record<string, unknown> {
  const results: Record<string, unknown> = {};
  if (options.kind === "all" || options.kind === "plants") {
    results.plants = refreshPlantManifests({
      db,
      contentRoot: path.join(options.contentRoot, "plants"),
      write: options.write,
    });
  }
  if (options.kind === "all" || options.kind === "pests-diseases") {
    results.pestsDiseases = refreshPestDiseaseManifests({
      contentRoot: path.join(options.contentRoot, "pests-diseases"),
      catalog: pestsDiseasesSeed.map((entry) => ({ key: entry.key, type: entry.type })),
      write: options.write,
    });
  }
  return {
    schema_version: 1,
    tool: "content-manifests",
    action: "refresh",
    mode: options.write ? "write" : "dry_run",
    database_path: path.resolve(options.dbPath),
    content_root: path.resolve(options.contentRoot),
    results,
  };
}

function init(options: CliOptions, db: Database.Database): Record<string, unknown> {
  if (!options.directoryPath || !options.plantCode) throw new Error("--action init requires both --directory and --plant-code");
  const result = initializePlantManifest({ db, directoryPath: options.directoryPath, plantCode: options.plantCode });
  const blocked = result.findings.some((item) => item.severity === "blocked");
  if (options.write && result.manifest && !blocked) writeManifest(result.manifestPath, result.manifest);
  return {
    schema_version: 1,
    tool: "content-manifests",
    action: "init",
    mode: options.write ? "write" : "dry_run",
    database_path: path.resolve(options.dbPath),
    result: {
      manifestPath: result.manifestPath,
      targetId: result.targetId,
      status: blocked ? "blocked" : options.write ? "generated" : "ready",
      findings: result.findings,
      manifest: result.manifest,
    },
  };
}

function validate(options: CliOptions): Record<string, unknown> {
  if (options.manifestPaths.length !== 1) throw new Error("--action validate requires exactly one --manifest");
  const manifestPath = options.manifestPaths[0];
  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  const validation = validateContentManifest(raw, manifestPath);
  const digestFindings = [] as Array<Record<string, unknown>>;
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "locales" in raw && raw.locales && typeof raw.locales === "object" && !Array.isArray(raw.locales)) {
    const directory = path.dirname(manifestPath);
    for (const [locale, entry] of Object.entries(raw.locales as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const file = (entry as { file?: unknown }).file;
      if (typeof file !== "string") continue;
      const filePath = path.join(directory, file);
      if (!fs.existsSync(filePath)) {
        digestFindings.push({ code: "CONTENT_FILE_MISSING", locale, file });
        continue;
      }
      const actual = exactUtf8Digest(fs.readFileSync(filePath));
      const expected = { bytes: (entry as { bytes?: unknown }).bytes, sha256: (entry as { sha256?: unknown }).sha256 };
      if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) digestFindings.push({ code: "CONTENT_HASH_MISMATCH", locale, expected, actual });
    }
  }
  return { schema_version: 1, tool: "content-manifests", action: "validate", manifest: manifestPath, valid: validation.valid && digestFindings.length === 0, findings: [...validation.findings, ...digestFindings] };
}

function dryRunImport(options: CliOptions, db: Database.Database): Record<string, unknown> {
  const report = dryRunContentImport(db, {
    manifestPaths: options.manifestPaths.length > 0 ? options.manifestPaths : undefined,
    contentRoot: options.contentRoot,
    repositoryRoot: REPOSITORY_ROOT,
    catalog: pestsDiseasesSeed.map((entry) => ({ key: entry.key, type: entry.type })),
  });
  return { schema_version: 1, tool: "content-manifests", action: "dry-run-import", database_path: path.resolve(options.dbPath), report };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.apply) throw new Error("CONTENT_IMPORT_APPLY_DISABLED_IN_CID6_ITERATION");
  if (options.action === "validate") {
    writeReport(validate(options), options.outputPath);
    return;
  }
  const db = openReadOnlyDatabase(options.dbPath);
  try {
    const report = options.action === "refresh"
      ? refresh(options, db)
      : options.action === "init"
        ? init(options, db)
        : dryRunImport(options, db);
    writeReport(report, options.outputPath);
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
