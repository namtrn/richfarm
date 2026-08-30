import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

import { createDatabase, type SqliteDatabase } from "../apps/api/src/db";
import { FULL_HASH_AUDIT_DEFAULT_BUDGET } from "../apps/api/src/content-source/contract";
import {
  runFullHashAuditWindow,
  runLegacyBaseline,
  runStartupCatchUp,
  scanContentRoot,
} from "../apps/api/src/content-source/scanner";
import { compactContentSourceJournal } from "../apps/api/src/content-source/retention";
import { recordContentChangeEvent } from "../apps/api/src/content-source/repository";

interface CliArgs {
  fixtureDir: string;
  dbPath: string;
  metricsPath: string;
  dirs: number;
  burst: number;
  auditMaxFilesPerWindow: number;
  restartDrill: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    fixtureDir: path.resolve("artifacts/perf/content-source-50k"),
    dbPath: path.resolve("artifacts/perf/perf-run.db"),
    metricsPath: "",
    dirs: 25_000,
    burst: 500,
    auditMaxFilesPerWindow: FULL_HASH_AUDIT_DEFAULT_BUDGET.maxFilesPerWindow,
    restartDrill: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--fixture" && next) { args.fixtureDir = path.resolve(next); i += 1; }
    else if (arg === "--db" && next) { args.dbPath = path.resolve(next); i += 1; }
    else if (arg === "--metrics" && next) { args.metricsPath = path.resolve(next); i += 1; }
    else if (arg === "--dirs" && next) { args.dirs = Number(next); i += 1; }
    else if (arg === "--burst" && next) { args.burst = Number(next); i += 1; }
    else if (arg === "--audit-window" && next) { args.auditMaxFilesPerWindow = Number(next); i += 1; }
    else if (arg === "--no-restart-drill") { args.restartDrill = false; }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.metricsPath) {
    args.metricsPath = path.join(path.dirname(args.dbPath), `metrics-${Date.now()}.json`);
  }
  return args;
}

const hr = (): number => Date.now();
const rssMb = (): number => Math.round(process.memoryUsage().rss / (1024 * 1024));
const dbBytes = (dbPath: string): number => (fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0);
const mb = (bytes: number): number => Math.round(bytes / (1024 * 1024));

function log(message: string): void {
  process.stdout.write(`${new Date().toISOString()} ${message}\n`);
}

function ensureFixture(args: CliArgs): void {
  const plantsRoot = path.join(args.fixtureDir, "content", "plants");
  const pestsDiseasesRoot = path.join(args.fixtureDir, "content", "pests-diseases");
  const existing = fs.existsSync(plantsRoot)
    ? fs.readdirSync(plantsRoot).length
    : 0;
  if (existing < args.dirs) {
    log(`fixture: generating ${args.dirs} directories (this can take a while)…`);
    const result = spawnSync(
      process.execPath,
      [
        "--import", "tsx",
        path.resolve("scripts/generate-content-source-perf-fixture.ts"),
        "--out", args.fixtureDir,
        "--dirs", String(args.dirs),
        "--locales", "en,vi",
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      throw new Error("fixture generation failed");
    }
  } else {
    log(`fixture: reusing ${existing} directories at ${args.fixtureDir}`);
  }
  // Keep both configured roots present. The generator resets its output tree,
  // so this must happen after generation as well as on fixture reuse.
  fs.mkdirSync(pestsDiseasesRoot, { recursive: true });
}

function slugFile(fixtureDir: string, index: number, locale: string): string {
  return path.join(
    fixtureDir,
    "content",
    "plants",
    `perf-${String(index).padStart(6, "0")}`,
    `${locale}.md`,
  );
}

function editFiles(fixtureDir: string, from: number, to: number, tag: string): void {
  for (let index = from; index < to; index += 1) {
    const file = slugFile(fixtureDir, index, "vi");
    const original = fs.readFileSync(file, "utf8");
    // Same length is NOT required here; a real edit changes bytes and mtime.
    fs.writeFileSync(file, `${original}\n<!-- ${tag} -->\n`, "utf8");
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const metrics: Record<string, unknown> = { startedAt: new Date().toISOString(), args };
  fs.mkdirSync(path.dirname(args.dbPath), { recursive: true });

  ensureFixture(args);

  if (fs.existsSync(args.dbPath)) fs.rmSync(args.dbPath);
  log("db: creating fresh database");
  let db: SqliteDatabase = createDatabase(args.dbPath);
  const phases: Record<string, unknown> = {};

  // ---- Phase A: initial indexing (baseline + catch-up) -------------------
  let t0 = hr();
  const baselineResults = runLegacyBaseline({ db, repositoryRoot: args.fixtureDir });
  const baselineMs = hr() - t0;
  t0 = hr();
  const catchUpResults = runStartupCatchUp({ db, repositoryRoot: args.fixtureDir });
  const catchUpMs = hr() - t0;
  const indexedRows = (
    db.prepare(`SELECT COUNT(*) AS count FROM content_source_files`).get() as { count: number }
  ).count;
  phases.initialIndex = {
    baselineMs,
    catchUpMs,
    totalMs: baselineMs + catchUpMs,
    indexedRows,
    eventsProduced: baselineResults.reduce((sum, r) => sum + r.counts.eventsProduced, 0)
      + catchUpResults.reduce((sum, r) => sum + r.counts.eventsProduced, 0),
    complete: [...baselineResults, ...catchUpResults].every((r) => r.complete),
    databaseMb: mb(dbBytes(args.dbPath)),
    rssMb: rssMb(),
  };
  log(`initial-index: ${JSON.stringify(phases.initialIndex)}`);

  // ---- Phase B: periodic metadata reconciliation -------------------------
  t0 = hr();
  const reconcilePlants = scanContentRoot(
    { db, repositoryRoot: args.fixtureDir, rootKey: "plants", detectorSource: "periodic_reconcile" },
    { mode: "periodic_reconcile" },
  );
  const reconcileMs = hr() - t0;
  phases.periodicReconcile = {
    durationMs: reconcileMs,
    pathsInspected: reconcilePlants.counts.pathsInspected,
    filesHashed: reconcilePlants.counts.filesHashed,
    eventsProduced: reconcilePlants.counts.eventsProduced,
    rssMb: rssMb(),
  };
  log(`periodic-reconcile: ${JSON.stringify(phases.periodicReconcile)}`);

  // ---- Phase C: steady-state single-file edit ----------------------------
  editFiles(args.fixtureDir, 0, 1, "steady-1");
  t0 = hr();
  const singleScan = scanContentRoot(
    { db, repositoryRoot: args.fixtureDir, rootKey: "plants", detectorSource: "watcher" },
    { mode: "periodic_reconcile" },
  );
  const singleMs = hr() - t0;
  phases.singleEdit = {
    durationMs: singleMs,
    filesHashed: singleScan.counts.filesHashed,
    eventsProduced: singleScan.counts.eventsProduced,
    criterion: "files hashed must stay at the edited-file minimum (<=2)",
  };
  log(`single-edit: ${JSON.stringify(phases.singleEdit)}`);

  // ---- Phase D: large burst ------------------------------------------------
  const burstCount = Math.min(args.burst, args.dirs);
  t0 = hr();
  editFiles(args.fixtureDir, 1, 1 + burstCount, "burst");
  const burstScan = scanContentRoot(
    { db, repositoryRoot: args.fixtureDir, rootKey: "plants", detectorSource: "startup_catchup" },
    { mode: "startup_catchup" },
  );
  const burstMs = hr() - t0;
  phases.burst = {
    editedFiles: burstCount,
    durationMs: burstMs,
    eventsProduced: burstScan.counts.eventsProduced,
    filesHashed: burstScan.counts.filesHashed,
    eventsPerSecond: Math.round((burstScan.counts.eventsProduced / Math.max(burstMs, 1)) * 1000),
    rssMb: rssMb(),
  };
  log(`burst(${burstCount}): ${JSON.stringify(phases.burst)}`);

  // ---- Phase E: full-hash audit cycle with restart-resume drill ----------
  const budget = { windowDurationMs: 10 * 60_000, maxFilesPerWindow: args.auditMaxFilesPerWindow };
  const windows: Array<Record<string, unknown>> = [];
  let cycleDone = false;
  let restartProven = false;
  let windowIndex = 0;
  while (!cycleDone && windowIndex < 500) {
    const w0 = hr();
    const window = runFullHashAuditWindow({ db, repositoryRoot: args.fixtureDir }, { budget });
    const row = {
      windowIndex,
      processed: window.processed,
      mismatches: window.mismatches,
      quarantined: window.quarantined,
      durationMs: hr() - w0,
      cursorPlants: window.cursorByRoot.plants ?? "",
    };
    windows.push(row);
    log(`audit-window#${windowIndex}: ${JSON.stringify(row)}`);
    windowIndex += 1;

    if (args.restartDrill && windowIndex === 1 && !window.cycleComplete) {
      // Restart drill: close and reopen the database mid-cycle.
      const cursorBefore = (
        db
          .prepare(`SELECT checkpoint_value FROM content_source_checkpoints WHERE root_key='plants' AND checkpoint_kind='full_hash'`)
          .get() as { checkpoint_value: string } | undefined
      )?.checkpoint_value;
      db.close();
      db = createDatabase(args.dbPath);
      const cursorAfter = (
        db
          .prepare(`SELECT checkpoint_value FROM content_source_checkpoints WHERE root_key='plants' AND checkpoint_kind='full_hash'`)
          .get() as { checkpoint_value: string } | undefined
        )?.checkpoint_value;
      restartProven = cursorBefore === cursorAfter && Boolean(cursorAfter);
      log(`restart-drill: cursor preserved (${cursorAfter?.slice(0, 40)}…) => ${restartProven}`);
    }
    cycleDone = !window.stoppedForBudget;
  }
  const totalAuditProcessed = windows.reduce((sum, w) => sum + Number(w.processed), 0);
  const totalAuditMs = windows.reduce((sum, w) => sum + Number(w.durationMs), 0);
  phases.fullHashAuditCycle = {
    windows: windows.length,
    totalProcessed: totalAuditProcessed,
    totalDurationMs: totalAuditMs,
    throughputFilesPerSecond: Math.round(totalAuditProcessed / Math.max(totalAuditMs / 1000, 0.001)),
    restartResumeProven: restartProven,
    perWindow: windows.slice(0, 6),
  };
  log(`audit-cycle: windows=${windows.length} processed=${totalAuditProcessed} durationMs=${totalAuditMs}`);

  // ---- Phase F: journal growth + retention compaction --------------------
  t0 = hr();
  const seedMany = db.transaction(() => {
    const insert = db.prepare(
      `INSERT INTO content_change_events (
         event_id, idempotency_key, root_key, path, entity_kind, event_type,
         detector_source, evidence_revision, review_state, reviewed_at, first_detected_at, last_detected_at
       ) VALUES (?, ?, 'plants', ?, 'plant', 'modified', 'watcher', 1, 'applied', ?, ?, ?)`,
    );
    const oldIso = new Date(Date.now() - 120 * 86_400_000).toISOString();
    for (let index = 0; index < 20_000; index += 1) {
      const id = crypto.randomUUID();
      insert.run(id, `idem-${id}`, `synthetic/${index % 5_000}.md`, oldIso, oldIso, oldIso);
    }
  });
  seedMany();
  const sizeWithJournal = dbBytes(args.dbPath);
  const compactReport = compactContentSourceJournal(db, { enabled: true, maintenancePass: true });
  const vacuumStart = hr();
  db.exec("VACUUM");
  const vacuumMs = hr() - vacuumStart;
  const compactMs = hr() - t0;
  (phases.retention as Record<string, unknown> | undefined);
  metrics.retentionVacuumMs = vacuumMs;
  phases.retention = {
    syntheticTerminalEvents: 20_000,
    deleted: compactReport.terminalEventsDeleted,
    compactDurationMs: compactMs,
    sizeBeforeCompactionMb: mb(sizeWithJournal),
    sizeAfterCompactionMb: mb(dbBytes(args.dbPath)),
  };
  log(`retention: ${JSON.stringify(phases.retention)}`);

  metrics.phases = phases;
  metrics.finishedAt = new Date().toISOString();
  metrics.finalRssMb = rssMb();
  metrics.databaseFinalMb = mb(dbBytes(args.dbPath));
  fs.mkdirSync(path.dirname(args.metricsPath), { recursive: true });
  fs.writeFileSync(args.metricsPath, JSON.stringify(metrics, null, 2));
  log(`metrics written to ${args.metricsPath}`);
  db.close();

  // Budget suggestion from measured throughput.
  const throughput = (phases.fullHashAuditCycle as unknown as { throughputFilesPerSecond?: number }).throughputFilesPerSecond ?? 0;
  if (throughput > 0) {
    const suggestedHourly = Math.max(1_000, Math.min(50_000, Math.round(throughput * 600))); // 10-min window/hour
    log(`budget-suggestion: measured ${throughput} files/s → maxFilesPerWindow ≈ ${suggestedHourly} (10-min hourly window)`);
  }
}

main().catch((error) => {
  log(`FATAL: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
