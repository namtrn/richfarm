import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import {
  auditCanonicalIdentityFile,
  type CanonicalConvexSnapshot,
} from "../apps/api/src/canonical-identity-audit";

interface CliOptions {
  dbPath?: string;
  convexPath?: string;
  outputPath?: string;
  runId?: string;
  summary: boolean;
  failOnFindings: boolean;
}

/** Every relative CLI path is resolved against the repository root. This is
 * stable even when npm --prefix changes the child script's working directory. */
export const REPOSITORY_ROOT = path.resolve(__dirname, "..");

export function resolveRepositoryPath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(REPOSITORY_ROOT, value);
}

function usage(): string {
  return [
    "Usage: npm run audit:canonical-identity -- [options]",
    "",
    "Options:",
    "  --db <path>                 SQLite file (default: DB_PATH or apps/api/data/richfarm.db)",
    "  --convex <path>             JSON admin snapshot ({ rows, ... } or an array)",
    "  --output <path>             Write deterministic JSON report to a file",
    "  --run-id <id>               Stable operator supplied audit identifier",
    "  --summary                   Print a one-line operator summary to stderr",
    "  --fail-on-findings          Exit 1 when blocked/warning findings exist",
    "  --help                      Show this help",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { summary: false, failOnFindings: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (arg === "--summary") {
      options.summary = true;
      continue;
    }
    if (arg === "--fail-on-findings") {
      options.failOnFindings = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}\n\n${usage()}`);
    }
    if (arg === "--db") options.dbPath = value;
    else if (arg === "--convex") options.convexPath = value;
    else if (arg === "--output") options.outputPath = value;
    else if (arg === "--run-id") options.runId = value;
    else throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
    index += 1;
  }
  return options;
}

function defaultDatabasePath(): string {
  const configured = process.env.DB_PATH?.trim();
  if (configured) return resolveRepositoryPath(configured);
  const candidates = [
    path.resolve(REPOSITORY_ROOT, "apps/api/data/richfarm.db"),
    path.resolve(REPOSITORY_ROOT, "data/richfarm.db"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function readConvexSnapshot(filePath: string): CanonicalConvexSnapshot | readonly unknown[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(resolveRepositoryPath(filePath), "utf8"));
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Convex snapshot JSON must be an array or an object containing rows");
  }
  return parsed as CanonicalConvexSnapshot;
}

function summaryLine(report: {
  status: string;
  auditId: string;
  summary: { sqliteRows: number; convexRows: number | null; totalFindings: number; blocked: number; warning: number };
}): string {
  return [
    `status=${report.status}`,
    `auditId=${report.auditId}`,
    `sqliteRows=${report.summary.sqliteRows}`,
    `convexRows=${report.summary.convexRows ?? "unavailable"}`,
    `findings=${report.summary.totalFindings}`,
    `blocked=${report.summary.blocked}`,
    `warnings=${report.summary.warning}`,
  ].join(" ");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const report = auditCanonicalIdentityFile(options.dbPath ?? defaultDatabasePath(), {
    runId: options.runId,
    convexSnapshot: options.convexPath ? readConvexSnapshot(options.convexPath) : null,
  });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.outputPath) {
    const outputPath = resolveRepositoryPath(options.outputPath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, json, "utf8");
  } else {
    process.stdout.write(json);
  }
  if (options.summary || options.outputPath) {
    process.stderr.write(`${summaryLine(report)}\n`);
  }
  if (options.failOnFindings && report.summary.totalFindings > 0) {
    process.exitCode = 1;
  }
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === path.resolve(__filename)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
