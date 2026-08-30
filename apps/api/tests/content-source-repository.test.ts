import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDatabase, type SqliteDatabase } from "../src/db";
import {
  bumpContentSourceRevision,
  computeEventIdempotencyKey,
  computeScopeFingerprint,
  correlateRenameEvents,
  countSourceFilesByOwnerStatus,
  createReviewProposal,
  finishMonitorRun,
  getChangeEvent,
  getContentSourceRevision,
  getMonitorLease,
  getReviewProposal,
  heartbeatMonitorRun,
  listChangeEvents,
  listDueQuarantinePaths,
  getCheckpoint,
  isBaselineSealed,
  markSourceFileDeleted,
  markSourceFileState,
  recordContentChangeEvent,
  releaseMonitorLease,
  renewMonitorLease,
  resolveQuarantine,
  sealLegacyBaseline,
  setCheckpoint,
  startMonitorRun,
  transitionChangeEventReviewState,
  transitionReviewProposalStatus,
  tryAcquireMonitorLease,
  upsertSourceFile,
  verifyProposalScopeEvidence,
  quarantinePath,
} from "../src/content-source/repository";
import { InvalidReviewTransitionError } from "../src/content-source/contract";

const databases: SqliteDatabase[] = [];
const temporaryDirectories: string[] = [];

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

function openFileDatabase(): { db: SqliteDatabase; filePath: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "csrc-repo-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "content-source.db");
  const db = createDatabase(filePath);
  databases.push(db);
  return { db, filePath };
}

function markdownObservation(overrides: Partial<Parameters<typeof upsertSourceFile>[1]> & { path: string }) {
  return {
    rootKey: "plants",
    entityKind: "plant" as const,
    entityKey: overrides.path.split("/")[2] ?? null,
    locale: "vi",
    fileKind: "markdown" as const,
    owningManifestPath: null,
    observedMtimeMs: 1000,
    byteSize: 10,
    sha256: "a".repeat(64),
    ...overrides,
  };
}

describe("MCD-2 additive schema", () => {
  it("recreates identical schema on reopen without losing rows", () => {
    const { db, filePath } = openFileDatabase();
    upsertSourceFile(db, markdownObservation({ path: "content/plants/tomato/vi.md" }));
    db.close();
    const reopened = createDatabase(filePath);
    databases.push(reopened);
    const row = reopened
      .prepare(`SELECT path, state FROM content_source_files`)
      .get() as { path: string; state: string };
    expect(row).toEqual({
      path: "content/plants/tomato/vi.md",
      state: "new",
    });
    const tableNames = (
      reopened
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'content_%' ORDER BY name`,
        )
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    expect(tableNames).toContain("content_source_files");
    expect(tableNames).toContain("content_change_events");
    expect(tableNames).toContain("content_source_monitor_runs");
    expect(tableNames).toContain("content_source_checkpoints");
    expect(tableNames).toContain("content_source_quarantine");
    expect(tableNames).toContain("content_source_monitor_leases");
    expect(tableNames).toContain("content_review_proposals");
  });

  it("leaves CID tables, findings, and outbox untouched", () => {
    const db = openDatabase();
    const outboxCountBefore = (
      db.prepare(`SELECT COUNT(*) AS count FROM sync_outbox`).get() as { count: number }
    ).count;
    const findingsCountBefore = (
      db.prepare(`SELECT COUNT(*) AS count FROM sync_findings`).get() as { count: number }
    ).count;
    bumpContentSourceRevision(db);
    expect(outboxCountBefore).toBe(0);
    expect(findingsCountBefore).toBe(0);
    expect(
      (db.prepare(`SELECT COUNT(*) AS count FROM sync_outbox`).get() as { count: number }).count,
    ).toBe(0);
  });
});

describe("MCD-2 content source index", () => {
  it("is idempotent for identical observations and bumps revisions on real changes", () => {
    const db = openDatabase();
    const relPath = "content/plants/tomato/vi.md";
    const first = upsertSourceFile(db, markdownObservation({ path: relPath }));
    expect(first).toMatchObject({ changed: true, evidenceRevision: 1 });

    const repeat = upsertSourceFile(db, markdownObservation({ path: relPath }));
    expect(repeat.changed).toBe(false);
    expect(repeat.evidenceRevision).toBe(1);

    const touched = upsertSourceFile(
      db,
      markdownObservation({ path: relPath, observedMtimeMs: 2000 }),
    );
    expect(touched.changed).toBe(true);
    expect(touched.state).toBe("clean");
    expect(touched.evidenceRevision).toBe(2);

    const edited = upsertSourceFile(
      db,
      markdownObservation({ path: relPath, sha256: "b".repeat(64), byteSize: 12 }),
    );
    expect(edited.state).toBe("changed");
    expect(edited.evidenceRevision).toBe(3);
  });

  it("marks manifest loss invalid and manifest restore clean, with monotonic revisions", () => {
    const db = openDatabase();
    const relPath = "content/plants/tomato/vi.md";
    const bound = upsertSourceFile(db, {
      ...markdownObservation({ path: relPath }),
      ownerStatus: "manifest_ok",
      owningManifestPath: "content/plants/tomato/content.json",
    });
    const lost = upsertSourceFile(db, {
      ...markdownObservation({ path: relPath }),
      ownerStatus: "missing_manifest",
    });
    expect(lost.state).toBe("invalid");
    expect(lost.evidenceRevision).toBe(bound.evidenceRevision + 1);
    expect(countSourceFilesByOwnerStatus(db, "missing_manifest")).toBe(1);

    const restored = upsertSourceFile(db, {
      ...markdownObservation({ path: relPath }),
      ownerStatus: "manifest_ok",
      owningManifestPath: "content/plants/tomato/content.json",
    });
    expect(restored.state).toBe("clean");
  });

  it("records deletions once and treats reappearance as new evidence", () => {
    const db = openDatabase();
    const relPath = "content/plants/tomato/vi.md";
    upsertSourceFile(db, markdownObservation({ path: relPath }));
    const deleted = markSourceFileDeleted(db, relPath, {
      at: "2026-08-25T00:00:00.000Z",
    });
    expect(deleted?.state).toBe("deleted");
    expect(markSourceFileDeleted(db, relPath)).toBeNull();

    const reappeared = upsertSourceFile(
      db,
      markdownObservation({ path: relPath, sha256: "c".repeat(64) }),
    );
    expect(reappeared.state).toBe("changed");
    expect(reappeared.evidenceRevision).toBe(3);
  });

  it("supports explicit invalid/unreadable marking", () => {
    const db = openDatabase();
    const relPath = "content/plants/tomato/vi.md";
    upsertSourceFile(db, markdownObservation({ path: relPath }));
    expect(markSourceFileState(db, relPath, "unreadable", "EACCES")).toBe(2);
    const row = db
      .prepare(`SELECT state, error FROM content_source_files WHERE path = ?`)
      .get(relPath) as { state: string; error: string | null };
    expect(row).toEqual({ state: "unreadable", error: "EACCES" });
  });
});

describe("MCD-2 durable event journal", () => {
  function eventInput(path: string, evidenceRevision: number, eventType: "created" | "modified" | "deleted" = "modified") {
    return {
      path,
      rootKey: "plants",
      entityKind: "plant" as const,
      entityKey: "tomato",
      locale: "vi",
      eventType,
      oldSha256: eventType === "created" ? null : "a".repeat(64),
      newSha256: eventType === "deleted" ? null : "b".repeat(64),
      detectorSource: "startup_catchup" as const,
      evidenceRevision,
    };
  }

  it("coalesces repeated delivery of identical evidence into one live event", () => {
    const db = openDatabase();
    const first = recordContentChangeEvent(db, eventInput("content/plants/tomato/vi.md", 1), {
      at: "2026-08-25T10:00:00.000Z",
    });
    const repeat = recordContentChangeEvent(db, eventInput("content/plants/tomato/vi.md", 1), {
      at: "2026-08-25T10:00:05.000Z",
    });
    expect(repeat.eventId).toBe(first.eventId);
    expect(repeat.coalescedIntoExisting).toBe(true);
    const row = getChangeEvent(db, first.eventId);
    expect(row?.coalesced_count).toBe(2);
    expect(row?.last_detected_at).toBe("2026-08-25T10:00:05.000Z");
    expect(listChangeEvents(db).total).toBe(1);
  });

  it("supersedes prior pending events for a path when newer evidence arrives", () => {
    const db = openDatabase();
    const oldEvent = recordContentChangeEvent(db, eventInput("content/plants/tomato/vi.md", 1));
    const newEvent = recordContentChangeEvent(
      db,
      eventInput("content/plants/tomato/vi.md", 2),
      { supersedePriorForPath: true },
    );
    expect(newEvent.eventId).not.toBe(oldEvent.eventId);
    expect(getChangeEvent(db, oldEvent.eventId)?.review_state).toBe("superseded");
    expect(getChangeEvent(db, oldEvent.eventId)?.superseded_by_event_id).toBe(
      newEvent.eventId,
    );
    expect(getChangeEvent(db, newEvent.eventId)?.review_state).toBe("pending");
  });

  it("ignores redelivery matching a terminal event instead of resurrecting it", () => {
    const db = openDatabase();
    const event = recordContentChangeEvent(db, eventInput("content/plants/tomato/vi.md", 1));
    transitionChangeEventReviewState(db, event.eventId, "dismissed", {
      reviewerId: "admin-1",
      reviewerRole: "admin",
      reason: "not needed",
    });
    const redelivered = recordContentChangeEvent(
      db,
      eventInput("content/plants/tomato/vi.md", 1),
    );
    expect(redelivered.ignoredAsTerminalDuplicate).toBe(true);
    expect(redelivered.coalescedIntoExisting).toBe(false);
    expect(getChangeEvent(db, event.eventId)?.review_state).toBe("dismissed");
    expect(listChangeEvents(db).total).toBe(1);
  });

  it("correlates rename pairs into one group and rejects invalid targets", () => {
    const db = openDatabase();
    const deleted = recordContentChangeEvent(
      db,
      eventInput("content/plants/tomato/old/vi.md", 1, "deleted"),
    );
    const created = recordContentChangeEvent(
      db,
      eventInput("content/plants/tomato/new/vi.md", 1, "created"),
    );
    const group = correlateRenameEvents(db, deleted.eventId, created.eventId);
    expect(getChangeEvent(db, deleted.eventId)?.correlation_group_id).toBe(group);
    expect(getChangeEvent(db, created.eventId)?.correlation_group_id).toBe(group);
    expect(() =>
      correlateRenameEvents(db, deleted.eventId, "missing-event"),
    ).toThrow("RENAME_CORRELATION_TARGETS_INVALID");
  });

  it("guards review transitions and records the actor audit trail", () => {
    const db = openDatabase();
    const event = recordContentChangeEvent(db, eventInput("content/plants/tomato/vi.md", 1));
    expect(() =>
      transitionChangeEventReviewState(db, event.eventId, "applied", {
        reviewerId: "admin-1",
        reviewerRole: "admin",
        reason: "skip gates",
      }),
    ).toThrow(InvalidReviewTransitionError);
    transitionChangeEventReviewState(db, event.eventId, "approved", {
      reviewerId: "admin-1",
      reviewerRole: "admin",
      reason: "verified preview",
    });
    transitionChangeEventReviewState(db, event.eventId, "applied", {
      reviewerId: "system",
      reviewerRole: "admin",
      reason: "apply",
    }, {
      refs: { proposalId: "prop-1", outboxItemId: 7 },
    });
    const row = getChangeEvent(db, event.eventId);
    expect(row?.review_state).toBe("applied");
    expect(row?.reviewer_id).toBe("system");
    expect(row?.proposal_id).toBe("prop-1");
    expect(row?.outbox_item_id).toBe(7);
  });

  it("paginates and filters the journal deterministically", () => {
    const db = openDatabase();
    for (const [index, locale] of ["vi", "en"].entries()) {
      recordContentChangeEvent(db, {
        ...eventInput(`content/plants/tomato/${locale}.md`, index + 1),
        locale,
        detectorSource: index === 0 ? "watcher" : "periodic_reconcile",
      }, { at: `2026-08-25T10:0${index}:00.000Z` });
    }
    const pageOne = listChangeEvents(db, { limit: 1, offset: 0 });
    expect(pageOne.total).toBe(2);
    expect(pageOne.items).toHaveLength(1);
    expect(pageOne.items[0]?.locale).toBe("en");
    const watchersOnly = listChangeEvents(db, { detectorSources: ["watcher"] });
    expect(watchersOnly.total).toBe(1);
    expect(watchersOnly.items[0]?.locale).toBe("vi");
    const pageTwo = listChangeEvents(db, { limit: 1, offset: 1 });
    expect(pageTwo.items[0]?.locale).toBe("vi");
  });

  it("computes stable idempotency keys from final evidence", () => {
    expect(computeEventIdempotencyKey({
      path: "p",
      eventType: "modified",
      oldSha256: null,
      newSha256: "x",
      detectorSource: "ci",
      evidenceRevision: 3,
    })).toBe(computeEventIdempotencyKey({
      path: "p",
      eventType: "modified",
      oldSha256: null,
      newSha256: "x",
      detectorSource: "ci",
      evidenceRevision: 3,
    }));
    expect(computeEventIdempotencyKey({
      path: "p",
      eventType: "modified",
      oldSha256: null,
      newSha256: "x",
      detectorSource: "ci",
      evidenceRevision: 3,
    })).not.toBe(computeEventIdempotencyKey({
      path: "p",
      eventType: "modified",
      oldSha256: null,
      newSha256: "x",
      detectorSource: "ci",
      evidenceRevision: 4,
    }));
  });
});

describe("MCD-2 checkpoints, baseline, quarantine, runs, revision", () => {
  it("stores checkpoints per root/shard/kind independently", () => {
    const db = openDatabase();
    setCheckpoint(db, "plants", "", "metadata", "cursor-a", 5);
    setCheckpoint(db, "plants", "solanum-lycopersicum", "metadata", "cursor-b", 9);
    setCheckpoint(db, "pests-diseases", "", "full_hash", "cursor-c", 2);
    expect(getCheckpoint(db, "plants", "", "metadata")?.checkpoint_value).toBe("cursor-a");
    expect(getCheckpoint(db, "plants", "solanum-lycopersicum", "metadata")?.checkpoint_value).toBe("cursor-b");
    expect(getCheckpoint(db, "plants", "", "full_hash")).toBeNull();
    setCheckpoint(db, "plants", "", "metadata", "cursor-a2", 6);
    expect(getCheckpoint(db, "plants", "", "metadata")?.checkpoint_value).toBe("cursor-a2");
    expect(getCheckpoint(db, "plants", "", "metadata")?.evidence_revision_watermark).toBe(6);
    expect(isBaselineSealed(db, "plants")).toBe(false);
    setCheckpoint(db, "plants", "", "baseline", "sealed", 0);
    expect(isBaselineSealed(db, "plants")).toBe(true);
  });

  it("indexes the legacy baseline without inbox events and seals atomically", () => {
    const db = openDatabase();
    const summary = sealLegacyBaseline(db, {
      rootKey: "plants",
      sealedAt: "2026-08-25T00:00:00.000Z",
      files: [
        markdownObservation({ path: "content/plants/legacy-one/vi.md", sha256: "d".repeat(64) }),
        markdownObservation({ path: "content/plants/legacy-two/en.md", locale: "en", sha256: "e".repeat(64) }),
      ],
    });
    expect(summary.indexed).toBe(2);
    expect(summary.representativePaths).toHaveLength(2);
    expect(isBaselineSealed(db, "plants")).toBe(true);
    expect(countSourceFilesByOwnerStatus(db, "legacy_missing_manifest")).toBe(2);
    expect(listChangeEvents(db).total).toBe(0);
    const states = (
      db.prepare(`SELECT DISTINCT state FROM content_source_files`).all() as Array<{ state: string }>
    ).map((row) => row.state);
    expect(states).toEqual(["invalid"]);
  });

  it("rolls back the entire baseline when any row fails mid-seal", () => {
    const db = openDatabase();
    db.exec(`
      CREATE TRIGGER csrc_baseline_abort
      BEFORE INSERT ON content_source_files
      WHEN NEW.path LIKE '%boom%'
      BEGIN
        SELECT RAISE(ABORT, 'CSRC_TEST_BASELINE_FAILURE');
      END;
    `);
    expect(() =>
      sealLegacyBaseline(db, {
        rootKey: "plants",
        files: [
          markdownObservation({ path: "content/plants/ok/vi.md" }),
          markdownObservation({ path: "content/plants/boom/vi.md" }),
        ],
      }),
    ).toThrow("CSRC_TEST_BASELINE_FAILURE");
    expect(isBaselineSealed(db, "plants")).toBe(false);
    expect(
      (db.prepare(`SELECT COUNT(*) AS count FROM content_source_files`).get() as { count: number }).count,
    ).toBe(0);
  });

  it("tracks quarantine retries and due work without losing first-failure time", () => {
    const db = openDatabase();
    quarantinePath(db, "locked/vi.md", "EACCES", "permission denied", {
      at: "2026-08-25T09:00:00.000Z",
      nextRetryAt: "2026-08-25T09:01:00.000Z",
    });
    quarantinePath(db, "locked/vi.md", "EACCES_AGAIN", "still denied", {
      at: "2026-08-25T09:02:00.000Z",
      nextRetryAt: "2026-08-25T09:04:00.000Z",
    });
    const entry = listDueQuarantinePaths(db, "2026-08-25T09:04:00.000Z");
    expect(entry).toHaveLength(1);
    expect(entry[0]).toMatchObject({
      path: "locked/vi.md",
      retry_count: 1,
      first_failed_at: "2026-08-25T09:00:00.000Z",
      last_failed_at: "2026-08-25T09:02:00.000Z",
      next_retry_at: "2026-08-25T09:04:00.000Z",
    });
    expect(listDueQuarantinePaths(db, "2026-08-25T09:03:59.999Z")).toHaveLength(0);
    resolveQuarantine(db, "locked/vi.md", "2026-08-25T09:05:00.000Z");
    expect(listDueQuarantinePaths(db, "2026-08-25T10:00:00.000Z")).toHaveLength(0);
  });

  it("keeps monitor run metrics including heartbeats and counters", () => {
    const db = openDatabase();
    bumpContentSourceRevision(db);
    startMonitorRun(db, {
      runId: "run-1",
      detectorMode: "startup_catchup",
      sourceRevisionBefore: 0,
    });
    heartbeatMonitorRun(db, "run-1");
    finishMonitorRun(db, "run-1", {
      status: "complete",
      complete: true,
      pathsInspected: 120,
      metadataComparisons: 110,
      filesHashed: 4,
      eventsProduced: 2,
      sourceRevisionAfter: 1,
    });
    const run = db
      .prepare(`SELECT * FROM content_source_monitor_runs WHERE run_id = 'run-1'`)
      .get() as Record<string, unknown>;
    expect(run).toMatchObject({
      detector_mode: "startup_catchup",
      status: "complete",
      complete: 1,
      paths_inspected: 120,
      files_hashed: 4,
      events_produced: 2,
      source_revision_before: 0,
      source_revision_after: 1,
    });
    expect(run.last_heartbeat_at).toBeTruthy();
    expect(run.finished_at).toBeTruthy();
  });

  it("advances a monotonic health-only global source revision", () => {
    const db = openDatabase();
    expect(getContentSourceRevision(db)).toBe(0);
    expect(bumpContentSourceRevision(db)).toBe(1);
    expect(bumpContentSourceRevision(db)).toBe(2);
    expect(getContentSourceRevision(db)).toBe(2);
  });
});

describe("MCD-2 monitor lease", () => {
  const T0 = 1_800_000_000_000;

  it("allows one active owner with expiry-based takeover", () => {
    const db = openDatabase();
    expect(tryAcquireMonitorLease(db, "plants", "api-1", 30_000, T0)).toBe(true);
    expect(tryAcquireMonitorLease(db, "plants", "api-2", 30_000, T0 + 5_000)).toBe(false);
    expect(getMonitorLease(db, "plants")?.owner_id).toBe("api-1");

    expect(renewMonitorLease(db, "plants", "api-2", 30_000, T0 + 10_000)).toBe(false);
    expect(renewMonitorLease(db, "plants", "api-1", 30_000, T0 + 10_000)).toBe(true);
    expect(getMonitorLease(db, "plants")?.expires_at).toBe(new Date(T0 + 40_000).toISOString());

    // Expired lease: renewal refuses, takeover succeeds.
    expect(renewMonitorLease(db, "plants", "api-1", 30_000, T0 + 60_000)).toBe(false);
    expect(tryAcquireMonitorLease(db, "plants", "api-2", 30_000, T0 + 61_000)).toBe(true);
    expect(getMonitorLease(db, "plants")?.owner_id).toBe("api-2");
    expect(getMonitorLease(db, "plants")?.acquired_at).toBe(new Date(T0 + 61_000).toISOString());

    expect(releaseMonitorLease(db, "plants", "api-1")).toBe(false);
    expect(releaseMonitorLease(db, "plants", "api-2")).toBe(true);
    expect(tryAcquireMonitorLease(db, "plants", "api-1", 30_000, T0 + 62_000)).toBe(true);
  });
});

describe("MCD-2 scoped proposal watermarks", () => {
  const scopePaths = [
    "content/plants/tomato/vi.md",
    "content/plants/tomato/content.json",
  ];

  function prepareScope(db: SqliteDatabase): {
    digests: Record<string, string>;
    maxRevision: number;
  } {
    upsertSourceFile(db, markdownObservation({
      path: "content/plants/tomato/vi.md",
      sha256: "a".repeat(64),
    }));
    upsertSourceFile(db, {
      ...markdownObservation({
        path: "content/plants/tomato/content.json",
        fileKind: "manifest",
        locale: null,
        sha256: "f".repeat(64),
        owningManifestPath: "content/plants/tomato/content.json",
        ownerStatus: "manifest_ok",
      }),
    });
    const digests: Record<string, string> = {};
    let maxRevision = 0;
    for (const relPath of scopePaths) {
      const row = db
        .prepare(`SELECT sha256, evidence_revision FROM content_source_files WHERE path = ?`)
        .get(relPath) as { sha256: string; evidence_revision: number };
      digests[relPath] = row.sha256;
      maxRevision = Math.max(maxRevision, row.evidence_revision);
    }
    return { digests, maxRevision };
  }

  function createTomatoProposal(
    db: SqliteDatabase,
    prepared = prepareScope(db),
  ): ReturnType<typeof createReviewProposal> {
    return createReviewProposal(db, {
      proposalId: "prop-tomato",
      scopeDefinition: { kind: "explicit-paths", rootKey: "plants" },
      scopeCardinality: scopePaths.length,
      scopePaths,
      scopeMaxEvidenceRevision: prepared.maxRevision,
      scopeDigests: prepared.digests,
      createdBy: "admin-1",
    });
  }

  it("persists reproducible scope membership, not just a fingerprint", () => {
    const db = openDatabase();
    const prepared = prepareScope(db);
    const proposal = createTomatoProposal(db, prepared);
    expect(proposal.scope_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(proposal.scope_paths_json)).toEqual([...scopePaths].sort());
    expect(proposal.scope_cardinality).toBe(2);
    expect(proposal.scope_definition_json).toContain("explicit-paths");

    const again = createReviewProposal(db, {
      proposalId: "prop-tomato-2",
      scopeDefinition: { kind: "explicit-paths", rootKey: "plants" },
      scopeCardinality: scopePaths.length,
      scopePaths,
      scopeMaxEvidenceRevision: prepared.maxRevision,
      scopeDigests: prepared.digests,
    });
    expect(again.scope_fingerprint).toBe(proposal.scope_fingerprint);
    expect(computeScopeFingerprint({
      scopePaths,
      scopeCardinality: 2,
      scopeMaxEvidenceRevision: prepared.maxRevision,
      scopeDigests: prepared.digests,
    })).toBe(proposal.scope_fingerprint);
  });

  it("accepts unchanged scope evidence and rejects in-scope changes only", () => {
    const db = openDatabase();
    prepareScope(db);
    createTomatoProposal(db);

    expect(verifyProposalScopeEvidence(db, "prop-tomato")).toEqual({
      ok: true,
      fingerprint: getReviewProposal(db, "prop-tomato")!.scope_fingerprint,
    });

    upsertSourceFile(db, {
      ...markdownObservation({ path: "content/plants/basella/vi.md", sha256: "1".repeat(64) }),
    });
    expect(verifyProposalScopeEvidence(db, "prop-tomato").ok).toBe(true);

    upsertSourceFile(db, {
      ...markdownObservation({
        path: "content/plants/tomato/vi.md",
        sha256: "2".repeat(64),
      }),
    });
    const stale = verifyProposalScopeEvidence(db, "prop-tomato");
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.reason).toBe("SCOPE_FINGERPRINT_MISMATCH");
    }

    markSourceFileDeleted(db, "content/plants/tomato/content.json");
    const deletedEvidence = verifyProposalScopeEvidence(db, "prop-tomato");
    expect(deletedEvidence.ok).toBe(false);
  });

  it("guards proposal status transitions through apply", () => {
    const db = openDatabase();
    prepareScope(db);
    createTomatoProposal(db);
    expect(getReviewProposal(db, "prop-tomato")?.status).toBe("draft");
    transitionReviewProposalStatus(db, "prop-tomato", "ready");
    transitionReviewProposalStatus(db, "prop-tomato", "approved", { approvedBy: "admin-1" });
    transitionReviewProposalStatus(db, "prop-tomato", "applied");
    expect(() =>
      transitionReviewProposalStatus(db, "prop-tomato", "stale"),
    ).toThrow("REVIEW_PROPOSAL_TRANSITION_INVALID");

    const dbTwo = openDatabase();
    prepareScope(dbTwo);
    createTomatoProposal(dbTwo);
    transitionReviewProposalStatus(dbTwo, "prop-tomato", "ready");
    transitionReviewProposalStatus(dbTwo, "prop-tomato", "stale", { reason: "scope moved" });
    expect(getReviewProposal(dbTwo, "prop-tomato")?.status).toBe("stale");
    transitionReviewProposalStatus(dbTwo, "prop-tomato", "ready");
    expect(getReviewProposal(dbTwo, "prop-tomato")?.stale_reason).toContain("scope moved");
  });
});
