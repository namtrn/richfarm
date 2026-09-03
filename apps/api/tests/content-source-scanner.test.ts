import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDatabase, type SqliteDatabase } from "../src/db";
import {
  getLastCompleteFullHashAuditAt,
  processCandidatePath,
  runFullHashAuditWindow,
  runLegacyBaseline,
  runStartupCatchUp,
  scanContentRoot,
} from "../src/content-source/scanner";
import { listChangeEvents } from "../src/content-source/repository";
import { stableJson } from "../src/content-manifests";

const databases: SqliteDatabase[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      fs.chmodSync(directory, 0o755);
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

function openDatabase(): SqliteDatabase {
  const db = createDatabase(":memory:");
  databases.push(db);
  return db;
}

function makeTree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "csrc-scan-"));
  temporaryDirectories.push(root);
  fs.mkdirSync(path.join(root, "content", "plants"), { recursive: true });
  fs.mkdirSync(path.join(root, "content", "pests-diseases"), { recursive: true });
  for (const [relPath, content] of Object.entries(files)) {
    const absolute = path.join(root, relPath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content, "utf8");
  }
  return root;
}

function manifestFor(locales: Record<string, string>, version = 1): string {
  return `${stableJson({
    schema_version: 1,
    kind: "plant",
    plant_code: "TEST_PLANT",
    locales: Object.fromEntries(
      Object.entries(locales).map(([locale, content]) => [
        locale,
        {
          file: `${locale}.md`,
          bytes: Buffer.byteLength(content),
          sha256: crypto.createHash("sha256").update(content).digest("hex"),
          content_version: version,
        },
      ]),
    ),
  })}\n`;
}

describe("MCD-3 legacy baseline and post-baseline missing manifests", () => {
  it("indexes mixed content without events and seals the baseline once", () => {
    const db = openDatabase();
    const boundVi = "# bound vi";
    const root = makeTree({
      "content/plants/bound/content.json": manifestFor({ vi: boundVi }),
      "content/plants/bound/vi.md": boundVi,
      "content/plants/legacy-only/vi.md": "# legacy",
    });

    const results = runLegacyBaseline({ db, repositoryRoot: root });
    expect(results.every((item) => item.complete)).toBe(true);
    expect(listChangeEvents(db).total).toBe(0);

    const rows = db
      .prepare(`SELECT path, state, owner_status FROM content_source_files ORDER BY path`)
      .all() as Array<{ path: string; state: string; owner_status: string }>;
    expect(rows.find((row) => row.path.includes("bound/vi.md"))).toMatchObject({
      state: "clean",
      owner_status: "manifest_ok",
    });
    expect(rows.find((row) => row.path.includes("legacy-only/vi.md"))).toMatchObject({
      state: "invalid",
      owner_status: "legacy_missing_manifest",
    });

    // Re-running is a no-op: baseline stays sealed, no duplicate work.
    const again = runLegacyBaseline({ db, repositoryRoot: root });
    expect(again[0]?.counts.pathsInspected ?? 0).toBe(0);

    void root;
  });

  it("emits a blocking missing-manifest event for post-baseline discoveries", () => {
    const db = openDatabase();
    const root = makeTree({});
    runLegacyBaseline({ db, repositoryRoot: root });

    fs.mkdirSync(path.join(root, "content", "plants", "new-legacy"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "content", "plants", "new-legacy", "vi.md"),
      "# new without manifest",
      "utf8",
    );

    const [result] = runStartupCatchUp({ db, repositoryRoot: root });
    expect(result.complete).toBe(true);
    const page = listChangeEvents(db);
    expect(page.total).toBe(1);
    const event = page.items[0];
    expect(event).toMatchObject({
      event_type: "created",
      review_state: "pending",
      detector_source: "startup_catchup",
    });
    const findings = JSON.parse(event?.findings_json ?? "{}") as Record<string, unknown>;
    expect(findings["OWNER_STATUS_MISSING_MANIFEST"]).toMatchObject({ severity: "blocked" });
    const rowState = db
      .prepare(`SELECT owner_status, state FROM content_source_files WHERE path LIKE '%new-legacy%'`)
      .get() as { owner_status: string; state: string };
    expect(rowState).toEqual({ owner_status: "missing_manifest", state: "invalid" });
  });

  it("revalidates legacy rows when a manifest appears and retires the blocked duplicate", () => {
    const db = openDatabase();
    const enV1 = "# okra en v1";
    const enV2 = "# okra en v2 changed";
    const vi = "# okra vi";
    const root = makeTree({
      "content/plants/okra/en.md": enV1,
      "content/plants/okra/vi.md": vi,
    });
    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });

    fs.writeFileSync(path.join(root, "content", "plants", "okra", "en.md"), enV2, "utf8");
    runStartupCatchUp({ db, repositoryRoot: root });
    const blocked = listChangeEvents(db, { reviewStates: ["pending"] }).items;
    expect(blocked).toHaveLength(1);
    expect(JSON.parse(blocked[0]!.findings_json)).toHaveProperty("OWNER_STATUS_MISSING_MANIFEST");

    fs.writeFileSync(
      path.join(root, "content", "plants", "okra", "content.json"),
      manifestFor({ en: enV2, vi }),
      "utf8",
    );
    processCandidatePath(
      { db, repositoryRoot: root },
      path.join(root, "content", "plants", "okra", "content.json"),
    );

    const pending = listChangeEvents(db, { reviewStates: ["pending"] }).items;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      path: "content/plants/okra/content.json",
      event_type: "created",
    });
    expect(listChangeEvents(db, { reviewStates: ["superseded"] }).items).toHaveLength(1);
    expect(
      db
        .prepare(
          `SELECT path, owner_status, state FROM content_source_files
           WHERE path IN ('content/plants/okra/en.md', 'content/plants/okra/vi.md')
           ORDER BY path`,
        )
        .all(),
    ).toEqual([
      { path: "content/plants/okra/en.md", owner_status: "manifest_ok", state: "clean" },
      { path: "content/plants/okra/vi.md", owner_status: "manifest_ok", state: "clean" },
    ]);
  });
});

describe("MCD-3 startup catch-up recovery", () => {
  it("recovers edits made while the service was stopped, idempotently", () => {
    const db = openDatabase();
    const original = "version one";
    const root = makeTree({
      "content/plants/tomato/vi.md": original,
    });
    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });

    fs.writeFileSync(path.join(root, "content", "plants", "tomato", "vi.md"), "version two", "utf8");
    // Deterministic mtime advance: identical-size edits within the same
    // millisecond are exactly what the daily full-hash audit exists for.
    const bumped = new Date(Date.now() + 2_000);
    fs.utimesSync(path.join(root, "content", "plants", "tomato", "vi.md"), bumped, bumped);
    const [recovery] = runStartupCatchUp({ db, repositoryRoot: root });
    expect(recovery.complete).toBe(true);
    expect(recovery.counts.eventsProduced).toBe(1);

    const modified = listChangeEvents(db, { reviewStates: ["pending"] }).items[0];
    expect(modified).toMatchObject({ event_type: "modified" });
    expect(modified?.old_sha256).not.toBe(modified?.new_sha256);

    const [repeat] = runStartupCatchUp({ db, repositoryRoot: root });
    expect(repeat.counts.eventsProduced).toBe(0);
    expect(listChangeEvents(db).total).toBe(1);
  });

  it("recovers a git pull burst across many directories without missing paths", () => {
    const db = openDatabase();
    const root = makeTree({});
    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });

    const files: Record<string, string> = {};
    for (const slug of ["alpha", "beta", "gamma"]) {
      for (const locale of ["en", "vi"]) {
        files[`content/plants/${slug}/${locale}.md`] = `${slug} ${locale}`;
      }
    }
    for (const [relPath, content] of Object.entries(files)) {
      const absolute = path.join(root, relPath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, content, "utf8");
    }

    const [burst] = runStartupCatchUp({ db, repositoryRoot: root });
    expect(burst.complete).toBe(true);
    expect(burst.counts.eventsProduced).toBe(6);
    expect(listChangeEvents(db, { reviewStates: ["pending"] }).total).toBe(6);
  });

  it("pairs rename delete+create evidence into one correlation group", () => {
    const db = openDatabase();
    const content = "same bytes";
    const oldRel = "content/plants/old-dir/vi.md";
    const root = makeTree({ [oldRel]: content });
    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });
    runStartupCatchUp({ db, repositoryRoot: root });
    db.prepare(`DELETE FROM content_change_events`).run();

    fs.renameSync(
      path.join(root, "content", "plants", "old-dir"),
      path.join(root, "content", "plants", "new-dir"),
    );
    const [result] = runStartupCatchUp({ db, repositoryRoot: root });
    expect(result.complete).toBe(true);

    const events = listChangeEvents(db, { reviewStates: ["pending"] }).items;
    const deleted = events.find((item) => item.event_type === "deleted");
    const created = events.find((item) => item.event_type === "created");
    expect(deleted?.path).toBe("content/plants/old-dir/vi.md");
    expect(created?.path).toBe("content/plants/new-dir/vi.md");
    expect(deleted?.correlation_group_id).toBeTruthy();
    expect(created?.correlation_group_id).toBe(deleted?.correlation_group_id);
  });

  it("records deletions as review events without touching content rows elsewhere", () => {
    const db = openDatabase();
    const root = makeTree({
      "content/plants/tomato/vi.md": "delete me",
      "content/plants/keep/vi.md": "keep me",
    });
    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });
    runStartupCatchUp({ db, repositoryRoot: root });
    db.prepare(`DELETE FROM content_change_events`).run();

    fs.rmSync(path.join(root, "content", "plants", "tomato", "vi.md"));
    const [result] = runStartupCatchUp({ db, repositoryRoot: root });
    expect(result.complete).toBe(true);
    expect(result.counts.deletionsDetected).toBe(1);
    const event = listChangeEvents(db).items[0];
    expect(event).toMatchObject({ event_type: "deleted", review_state: "pending" });
    expect(
      db
        .prepare(`SELECT owner_status FROM content_source_files WHERE path LIKE '%keep%'`)
        .get(),
    ).toEqual({ owner_status: "legacy_missing_manifest" });
  });
});

describe("MCD-3 manifest neighborhood validation", () => {
  it("emits manifest_changed only for the manifest and warns on digest drift", () => {
    const db = openDatabase();
    const vi = "# tomato vi";
    const root = makeTree({
      "content/plants/tomato/content.json": manifestFor({ vi }),
      "content/plants/tomato/vi.md": vi,
    });
    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });
    runStartupCatchUp({ db, repositoryRoot: root });
    db.prepare(`DELETE FROM content_change_events`).run();

    // Manifest-only change revalidates the neighborhood but must not create
    // Markdown events when locale bytes are unchanged.
    fs.writeFileSync(
      path.join(root, "content", "plants", "tomato", "content.json"),
      manifestFor({ vi }, 2),
      "utf8",
    );
    let result = runStartupCatchUp({ db, repositoryRoot: root })[0];
    expect(result.complete).toBe(true);
    let events = listChangeEvents(db).items;
    expect(events.map((item) => item.event_type)).toEqual(["manifest_changed"]);

    db.prepare(`DELETE FROM content_change_events`).run();
    // Locale drift against a stale manifest surfaces the warning finding.
    fs.writeFileSync(
      path.join(root, "content", "plants", "tomato", "vi.md"),
      "# tomato vi edited",
      "utf8",
    );
    result = runStartupCatchUp({ db, repositoryRoot: root })[0];
    events = listChangeEvents(db).items;
    expect(events.map((item) => item.event_type)).toEqual(["modified"]);
    const findings = JSON.parse(events[0]?.findings_json ?? "{}") as Record<string, unknown>;
    expect(findings["CONTENT_SOURCE_MANIFEST_DIGEST_MISMATCH"]).toBeDefined();
  });
});

describe("MCD-3 shard isolation and quarantine", () => {
  it("quarantines a failed shard while clean shards still recover", () => {
    const db = openDatabase();
    const root = makeTree({
      "content/plants/good/vi.md": "good",
    });
    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });

    const badDir = path.join(root, "content", "plants", "locked");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, "vi.md"), "locked", "utf8");
    runStartupCatchUp({ db, repositoryRoot: root });
    db.prepare(`DELETE FROM content_change_events`).run();

    fs.chmodSync(badDir, 0o000);
    try {
      fs.writeFileSync(path.join(root, "content", "plants", "good", "vi.md"), "good v2", "utf8");
      const [result] = runStartupCatchUp({ db, repositoryRoot: root });
      expect(result.complete).toBe(false);
      expect(result.errors.some((message) => message.includes("locked"))).toBe(true);
      expect(
        listChangeEvents(db, { reviewStates: ["pending"] }).items.some(
          (item) => item.event_type === "modified" && item.path.includes("good"),
        ),
      ).toBe(true);
      const quarantined = db
        .prepare(`SELECT path, reason FROM content_source_quarantine WHERE resolved_at IS NULL`)
        .all() as Array<{ path: string; reason: string }>;
      expect(quarantined.some((row) => row.path.includes("locked"))).toBe(true);
    } finally {
      fs.chmodSync(badDir, 0o755);
    }
  });
});

describe("MCD-3 full-hash audit", () => {
  it("catches an mtime+size-preserving edit that metadata reconcile misses", () => {
    const db = openDatabase();
    const original = "0123456789";
    const filePath = path.join(makeTree({}), "content", "plants", "stealth", "vi.md");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, original, "utf8");
    const root = path.dirname(path.dirname(path.dirname(path.dirname(filePath))));
    const relPath = "content/plants/stealth/vi.md";

    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });
    runStartupCatchUp({ db, repositoryRoot: root });
    db.prepare(`DELETE FROM content_change_events`).run();

    const before = fs.statSync(filePath);
    fs.writeFileSync(filePath, "1234567890".slice(0, original.length), "utf8");
    fs.utimesSync(filePath, before.atime, before.mtime);

    const metadataPass = scanContentRoot(
      { db, repositoryRoot: root, rootKey: "plants", detectorSource: "periodic_reconcile" },
      { mode: "periodic_reconcile" },
    );
    expect(metadataPass.counts.filesHashed).toBe(0);
    expect(metadataPass.counts.eventsProduced).toBe(0);

    const audit = runFullHashAuditWindow(
      { db, repositoryRoot: root },
      { budget: { windowDurationMs: 60_000, maxFilesPerWindow: 100 } },
    );
    expect(audit.mismatches).toBe(1);
    expect(audit.cycleComplete).toBe(true);
    const event = listChangeEvents(db, { reviewStates: ["pending"] }).items[0];
    expect(event?.event_type).toBe("modified");
    expect(getLastCompleteFullHashAuditAt(db)).not.toBeNull();
  });

  it("resumes across windows from the persisted cursor", () => {
    const db = openDatabase();
    const files: Record<string, string> = {};
    for (const slug of ["a-one", "b-two", "c-three"]) {
      files[`content/plants/${slug}/vi.md`] = slug;
    }
    const root = makeTree(files);
    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });

    const budget = { windowDurationMs: 60_000, maxFilesPerWindow: 2 };
    const first = runFullHashAuditWindow({ db, repositoryRoot: root }, { budget });
    expect(first.processed).toBe(2);
    expect(first.cycleComplete).toBe(false);
    expect(first.cursorByRoot["plants"]).toContain("b-two");

    const second = runFullHashAuditWindow({ db, repositoryRoot: root }, { budget });
    expect(second.processed).toBe(1);
    expect(second.cycleComplete).toBe(true);
    expect(second.cursorByRoot["plants"]).toContain("c-three");

    // A fresh cycle after wrap starts over and hashes everything again.
    const third = runFullHashAuditWindow({ db, repositoryRoot: root }, { budget });
    expect(third.processed).toBe(2);
  });

  it("reports an incomplete cycle while a file is unreadable, then completes after recovery", () => {
    const db = openDatabase();
    const root = makeTree({
      "content/plants/victim/vi.md": "victim bytes",
      "content/plants/healthy/vi.md": "healthy bytes",
    });
    const victimPath = path.join(root, "content", "plants", "victim", "vi.md");

    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });
    runStartupCatchUp({ db, repositoryRoot: root });

    fs.chmodSync(victimPath, 0o000);
    try {
      const dirty = runFullHashAuditWindow(
        { db, repositoryRoot: root },
        { budget: { windowDurationMs: 60_000, maxFilesPerWindow: 50 } },
      );
      expect(dirty.quarantined).toBe(1);
      expect(dirty.cycleComplete).toBe(false);
      const dirtyRun = db
        .prepare(
          `SELECT status FROM content_source_monitor_runs
           WHERE detector_mode = 'full_hash_audit' ORDER BY started_at DESC LIMIT 1`,
        )
        .get() as { status: string };
      expect(dirtyRun.status).toBe("incomplete");
      expect(getLastCompleteFullHashAuditAt(db)).toBeNull();

      // Recovery: readable again — the next cycle verifies the bytes itself,
      // resolves the quarantine, and only then claims a complete audit.
    } finally {
      fs.chmodSync(victimPath, 0o644);
    }

    const recovered = runFullHashAuditWindow(
      { db, repositoryRoot: root },
      { budget: { windowDurationMs: 60_000, maxFilesPerWindow: 50 } },
    );
    expect(recovered.quarantined).toBe(0);
    expect(recovered.cycleComplete).toBe(true);
    expect(getLastCompleteFullHashAuditAt(db)).not.toBeNull();
    const quarantine = db
      .prepare(`SELECT resolved_at FROM content_source_quarantine WHERE path LIKE '%victim%'`)
      .get() as { resolved_at: string | null };
    expect(quarantine.resolved_at).not.toBeNull();
  });
});

describe("MCD-3/MCD-4 shared candidate interface", () => {
  it("processes one watcher candidate with only its manifest neighborhood", () => {
    const db = openDatabase();
    const vi = "# candidate";
    const root = makeTree({
      "content/plants/tomato/content.json": manifestFor({ vi }),
      "content/plants/tomato/vi.md": vi,
      "content/plants/other/vi.md": "other",
    });
    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });
    runStartupCatchUp({ db, repositoryRoot: root });
    db.prepare(`DELETE FROM content_change_events`).run();

    fs.writeFileSync(path.join(root, "content", "plants", "tomato", "vi.md"), "# changed", "utf8");
    const outcome = processCandidatePath(
      { db, repositoryRoot: root },
      path.join(root, "content", "plants", "tomato", "vi.md"),
    );
    expect(outcome.processed).toBe(true);
    expect(outcome.neighborhood).toEqual([
      "content/plants/tomato/content.json",
      "content/plants/tomato/vi.md",
    ]);

    const events = listChangeEvents(db).items;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_type: "modified",
      detector_source: "watcher",
      path: "content/plants/tomato/vi.md",
    });
  });

  it("ignores candidates outside the watched contract", () => {
    const db = openDatabase();
    const root = makeTree({});
    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });
    const outcome = processCandidatePath(
      { db, repositoryRoot: root },
      path.join(root, "docs", "tasks", "note.md"),
    );
    expect(outcome.processed).toBe(false);
    expect(listChangeEvents(db).total).toBe(0);
  });
});

describe("MCD-3 event idempotency under burst redelivery", () => {
  it("coalesces watcher redelivery of the same final evidence", () => {
    const db = openDatabase();
    const root = makeTree({ "content/plants/dup/vi.md": "dup" });
    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });
    runStartupCatchUp({ db, repositoryRoot: root });
    db.prepare(`DELETE FROM content_change_events`).run();

    fs.writeFileSync(path.join(root, "content", "plants", "dup", "vi.md"), "dup v2", "utf8");
    processCandidatePath({ db, repositoryRoot: root }, "content/plants/dup/vi.md");
    // Watcher duplicates the same change before debounce; scanner re-run sees
    // identical final bytes and must not duplicate the inbox item.
    processCandidatePath({ db, repositoryRoot: root }, "content/plants/dup/vi.md");
    expect(listChangeEvents(db).total).toBe(1);
  });
});

describe("MCD-7 query-plan and throughput guards", () => {
  it("uses an index for per-shard lookups instead of a table scan", () => {
    const db = openDatabase();
    const root = makeTree({
      "content/plants/tomato/vi.md": "plan check",
    });
    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });
    const plan = db
      .prepare(
        `EXPLAIN QUERY PLAN SELECT path FROM content_source_files
         WHERE path >= ? AND path < ? AND deleted_at IS NULL`,
      )
      .all("content/plants/tomato/", "content/plants/tomatop") as Array<{ detail: string }>;
    const joined = plan.map((row) => row.detail).join(" | ");
    expect(joined).toMatch(/idx_content_source_files_path|UNIQUE|INDEX/);
    expect(joined).not.toMatch(/SCAN .*content_source_files(?!_)/);
  });

  it("keeps steady-state reconcile hashing at edited-file minimum", () => {
    const db = openDatabase();
    const root = makeTree({
      "content/plants/solo/vi.md": "# v1",
      "content/plants/solo/en.md": "en v1",
      "content/plants/solo/content.json": "{}",
    });
    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });
    runStartupCatchUp({ db, repositoryRoot: root });
    db.prepare(`DELETE FROM content_change_events`).run();

    fs.writeFileSync(path.join(root, "content", "plants", "solo", "vi.md"), "# v2", "utf8");
    const bumped = new Date(Date.now() + 5_000);
    fs.utimesSync(path.join(root, "content", "plants", "solo", "vi.md"), bumped, bumped);
    const [result] = runStartupCatchUp({ db, repositoryRoot: root });
    expect(result.counts.filesHashed).toBeLessThanOrEqual(2);
    expect(result.counts.eventsProduced).toBe(1);
  });
});
