import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDatabase, type SqliteDatabase } from "../src/db";
import {
  backupSqliteDatabaseFile,
  compactContentSourceJournal,
  getDatabaseByteSize,
} from "../src/content-source/retention";
import {
  recordContentChangeEvent,
  transitionChangeEventReviewState,
  upsertSourceFile,
} from "../src/content-source/repository";

const databases: SqliteDatabase[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

function openFileDatabase(): { db: SqliteDatabase; filePath: string; directory: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "csrc-retention-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "retention.db");
  const db = createDatabase(filePath);
  databases.push(db);
  return { db, filePath, directory };
}

function seedEventHistory(
  db: SqliteDatabase,
  nowMs: number,
): Record<string, string> {
  const eventIds: Record<string, string> = {};
  const markdown = (relPath: string, locale = "vi") => ({
    path: relPath,
    rootKey: "plants",
    entityKind: "plant" as const,
    locale,
    fileKind: "markdown" as const,
  });
  const day = (index: number) =>
    new Date(nowMs - index * 86_400_000).toISOString();

  upsertSourceFile(db, {
    ...markdown("content/plants/tomato/vi.md"),
    sha256: "a".repeat(64),
  });

  // Old dismissed event on tomato; a recent pending sibling becomes the
  // path anchor, so the old terminal row is deletable.
  let result = recordContentChangeEvent(db, {
    ...markdown("content/plants/tomato/vi.md"),
    entityKey: "tomato",
    eventType: "modified",
    detectorSource: "periodic_reconcile",
    evidenceRevision: 1,
  }, { at: day(200) });
  eventIds.tomatoViDismissedOld = result.eventId;
  transitionChangeEventReviewState(db, result.eventId, "dismissed", {
    reviewerId: "admin-1",
    reviewerRole: "admin",
    reason: "old cleanup",
  }, { at: day(199) });

  result = recordContentChangeEvent(db, {
    ...markdown("content/plants/tomato/vi.md"),
    entityKey: "tomato",
    eventType: "modified",
    detectorSource: "watcher",
    evidenceRevision: 2,
  }, { at: day(10) });
  eventIds.tomatoViPendingRecent = result.eventId;

  // Sole applied event on basella: terminal AND old, but still the latest
  // event for its path, so compaction must preserve it as the audit anchor.
  upsertSourceFile(db, {
    ...markdown("content/plants/basella/vi.md"),
    sha256: "b".repeat(64),
  });
  result = recordContentChangeEvent(db, {
    ...markdown("content/plants/basella/vi.md"),
    entityKey: "basella",
    eventType: "created",
    oldSha256: null,
    newSha256: "b".repeat(64),
    detectorSource: "watcher",
    evidenceRevision: 1,
  }, { at: day(150) });
  transitionChangeEventReviewState(db, result.eventId, "approved", {
    reviewerId: "admin-1",
    reviewerRole: "admin",
    reason: "ok",
  }, { at: day(149) });
  transitionChangeEventReviewState(db, result.eventId, "applied", {
    reviewerId: "admin-1",
    reviewerRole: "admin",
    reason: "ok",
  }, { at: day(149) });
  eventIds.basellaSoleApplied = result.eventId;

  // Old pending event (must never be deleted).
  upsertSourceFile(db, {
    ...markdown("content/plants/pepper/vi.md"),
    sha256: "d".repeat(64),
  });
  result = recordContentChangeEvent(db, {
    ...markdown("content/plants/pepper/vi.md"),
    entityKey: "pepper",
    eventType: "modified",
    detectorSource: "startup_catchup",
    evidenceRevision: 1,
  }, { at: day(180) });
  eventIds.pepperPending = result.eventId;

  // Old supersession chain (must never be deleted).
  upsertSourceFile(db, {
    ...markdown("content/plants/tomato/en.md", "en"),
    locale: "en",
    sha256: "c".repeat(64),
  });
  result = recordContentChangeEvent(db, {
    ...markdown("content/plants/tomato/en.md", "en"),
    entityKey: "tomato",
    locale: "en",
    eventType: "modified",
    detectorSource: "watcher",
    evidenceRevision: 2,
  }, { at: day(120) });
  eventIds.tomatoEnSuperseded = result.eventId;
  const newer = recordContentChangeEvent(db, {
    ...markdown("content/plants/tomato/en.md", "en"),
    entityKey: "tomato",
    locale: "en",
    eventType: "modified",
    detectorSource: "watcher",
    evidenceRevision: 3,
  }, { at: day(119), supersedePriorForPath: true });
  eventIds.tomatoEnNewer = newer.eventId;

  return eventIds;
}

describe("MCD-2 retention and compaction", () => {
  it("never deletes anything while disabled by default", () => {
    const { db } = openFileDatabase();
    seedEventHistory(db, Date.now());
    const report = compactContentSourceJournal(db);
    expect(report).toMatchObject({ ran: false, enabled: false, trigger: "disabled" });
    expect(
      (db.prepare(`SELECT COUNT(*) AS count FROM content_change_events`).get() as { count: number })
        .count,
    ).toBe(6);
  });

  it("skips compaction under the size trigger without a maintenance pass", () => {
    const { db } = openFileDatabase();
    const report = compactContentSourceJournal(db, { enabled: true });
    expect(report).toMatchObject({ ran: false, trigger: "none" });
  });

  it("deletes only non-latest old terminal events and preserves anchors", () => {
    const { db } = openFileDatabase();
    const ids = seedEventHistory(db, Date.now());

    const report = compactContentSourceJournal(db, {
      enabled: true,
      maintenancePass: true,
      terminalEventDays: 90,
    });
    expect(report.ran).toBe(true);

    const states = new Map(
      (
        db.prepare(`SELECT event_id, review_state FROM content_change_events`).all() as Array<{
          event_id: string;
          review_state: string;
        }>
      ).map((row) => [row.event_id, row.review_state]),
    );

    expect(states.has(ids.tomatoViDismissedOld)).toBe(false);
    expect(report.terminalEventsDeleted).toBe(1);

    expect(states.get(ids.tomatoViPendingRecent)).toBe("pending");
    expect(states.get(ids.basellaSoleApplied)).toBe("applied");
    expect(states.get(ids.pepperPending)).toBe("pending");
    expect(states.get(ids.tomatoEnSuperseded)).toBe("superseded");
    expect(states.get(ids.tomatoEnNewer)).toBe("pending");
  });

  it("compacts from the size trigger with a tiny byte cap", () => {
    const { db } = openFileDatabase();
    seedEventHistory(db, Date.now());
    expect(getDatabaseByteSize(db)).toBeGreaterThan(0);
    const report = compactContentSourceJournal(db, {
      enabled: true,
      maxDatabaseBytes: 1,
    });
    expect(report.trigger).toBe("size");
    expect(report.ran).toBe(true);
  });

  it("proves backup/rebuild behavior before deletion is trusted", () => {
    const first = openFileDatabase();
    seedEventHistory(first.db, Date.now());
    const originalCounts = (
      first.db
        .prepare(`SELECT COUNT(*) AS count FROM content_change_events`)
        .get() as { count: number }
    ).count;
    first.db.close();
    databases.pop();

    const backupPath = path.join(first.directory, "rebuild", "restored.db");
    const backup = backupSqliteDatabaseFile(first.filePath, backupPath);
    expect(backup.bytes).toBeGreaterThan(0);

    const rebuilt = createDatabase(backupPath);
    databases.push(rebuilt);
    const restoredCount = (
      rebuilt.prepare(`SELECT COUNT(*) AS count FROM content_change_events`).get() as { count: number }
    ).count;
    expect(restoredCount).toBe(originalCounts);
    const integrity = rebuilt.pragma("integrity_check") as Array<{ integrity_check: string }>;
    expect(integrity[0]?.integrity_check).toBe("ok");

    const report = compactContentSourceJournal(rebuilt, {
      enabled: true,
      maintenancePass: true,
    });
    expect(report.ran).toBe(true);
    expect(report.terminalEventsDeleted).toBe(1);
    expect(
      (rebuilt.prepare(`SELECT COUNT(*) AS count FROM content_change_events`).get() as { count: number })
        .count,
    ).toBe(originalCounts - 1);
  });
});
