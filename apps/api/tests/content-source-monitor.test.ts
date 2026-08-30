import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDatabase, type SqliteDatabase } from "../src/db";
import {
  createContentSourceMonitor,
  type WatchAdapterFactory,
} from "../src/content-source/monitor";
import { getMonitorLease } from "../src/content-source/repository";
import { listChangeEvents } from "../src/content-source/repository";
import { FULL_HASH_AUDIT_DEFAULT_BUDGET } from "../src/content-source/contract";
import {
  createCandidateQueue,
  type DebounceSchedule,
} from "../src/content-source/watcher";

const databases: SqliteDatabase[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

function makeContentTree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "csrc-mon-"));
  temporaryDirectories.push(root);
  fs.mkdirSync(path.join(root, "content", "plants", "tomato"), { recursive: true });
  fs.mkdirSync(path.join(root, "content", "pests-diseases"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "content", "plants", "tomato", "vi.md"),
    "# tomato",
    "utf8",
  );
  return root;
}

function openDatabase(): SqliteDatabase {
  const db = createDatabase(":memory:");
  databases.push(db);
  return db;
}

interface FakeAdapterHandle {
  stopCalls: number;
  emit(absolutePath: string): void;
  fail(error: Error): void;
}

function fakeAdapterFactory(handles: FakeAdapterHandle[]): WatchAdapterFactory {
  return (watchRoots, handlers) => {
    const handle: FakeAdapterHandle = {
      stopCalls: 0,
      emit(absolutePath: string) {
        handlers.onCandidate(absolutePath, "change");
      },
      fail(error: Error) {
        handlers.onError(error);
      },
    };
    handles.push(handle);
    return {
      kind: "test" as const,
      stop: async () => {
        handle.stopCalls += 1;
      },
    };
  };
}

const fastConfig = (repositoryRoot: string) => ({
  repositoryRoot,
  instanceId: "",
  auditIntervalMs: 3_600_000,
  reconcileIntervalMs: 300_000,
  auditBudget: { ...FULL_HASH_AUDIT_DEFAULT_BUDGET },
});

describe("MCD-4 monitor lifecycle and lease ownership", () => {
  it("starts active with baseline, catch-up, reconcile, and a completed audit", async () => {
    const db = openDatabase();
    const root = makeContentTree();
    const handles: FakeAdapterHandle[] = [];
    const monitor = createContentSourceMonitor({
      db,
      config: { ...fastConfig(root), instanceId: "api-a" },
      watchAdapterFactory: fakeAdapterFactory(handles),
    });

    await monitor.start();
    const health = monitor.getStatus();
    expect(health.phase).toBe("ready");
    expect(health.watching).toBe(true);
    expect(health.baselineSealed).toEqual({ plants: true, "pests-diseases": true });
    expect(health.lastCatchUp?.complete).toBe(true);
    expect(health.lastReconcile?.complete).toBe(true);
    expect(health.fullHashAudit.lastCompleteAt).not.toBeNull();

    await monitor.stop();
    expect(monitor.getStatus().phase).toBe("stopped");
  });

  it("keeps exactly one active instance; the other stays passive until expiry", async () => {
    const db = openDatabase();
    const root = makeContentTree();
    const handlesA: FakeAdapterHandle[] = [];
    const handlesB: FakeAdapterHandle[] = [];

    const monitorA = createContentSourceMonitor({
      db,
      config: { ...fastConfig(root), instanceId: "api-a", leasePollMs: 50 },
      watchAdapterFactory: fakeAdapterFactory(handlesA),
    });
    const monitorB = createContentSourceMonitor({
      db,
      config: { ...fastConfig(root), instanceId: "api-b", leasePollMs: 50 },
      watchAdapterFactory: fakeAdapterFactory(handlesB),
    });

    await monitorA.start();
    await monitorB.start();
    expect(monitorA.getStatus().watching).toBe(true);
    expect(monitorB.getStatus().phase).toBe("passive");
    expect(monitorB.getStatus().watching).toBe(false);

    // Passive instance must not process candidates.
    monitorB.handleCandidatePaths([path.join(root, "content/plants/tomato/vi.md")]);
    expect(listChangeEvents(db, { detectorSources: ["watcher"] }).total).toBe(0);

    // Force lease expiry without waiting TTL: B takes over only via its poll.
    db.prepare(`UPDATE content_source_monitor_leases SET expires_at = ?`).run(
      new Date(Date.now() - 1_000).toISOString(),
    );
    monitorB.pollLeaseNow();
    expect(monitorB.getStatus().watching).toBe(true);
    expect(handlesB.length).toBeGreaterThan(0);

    // A's next renewal fails after takeover: it must stop watching.
    monitorA.pollLeaseNow();
    expect(monitorA.getStatus().watching).toBe(false);
    expect(handlesA.every((handle) => handle.stopCalls >= 1)).toBe(true);

    await Promise.all([monitorA.stop(), monitorB.stop()]);
  });

  it("releases leases and closes watcher handles on shutdown", async () => {
    const db = openDatabase();
    const root = makeContentTree();
    const handles: FakeAdapterHandle[] = [];
    const monitor = createContentSourceMonitor({
      db,
      config: { ...fastConfig(root), instanceId: "api-a" },
      watchAdapterFactory: fakeAdapterFactory(handles),
    });
    await monitor.start();
    await monitor.stop();

    expect(getMonitorLease(db, "plants")).toBeNull();
    expect(getMonitorLease(db, "pests-diseases")).toBeNull();
    expect(handles.every((handle) => handle.stopCalls === 1)).toBe(true);
  });

  it("disables itself when the content tree is unavailable", async () => {
    const db = openDatabase();
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "csrc-empty-"));
    temporaryDirectories.push(emptyRoot);
    const monitor = createContentSourceMonitor({
      db,
      config: { ...fastConfig(emptyRoot), instanceId: "api-a" },
    });
    await monitor.start();
    expect(monitor.getStatus().phase).toBe("disabled");
    await monitor.stop();
  });

  it("degrades on queue overflow without losing evidence", async () => {
    const db = openDatabase();
    const root = makeContentTree();
    for (let index = 0; index < 6; index += 1) {
      const slug = `overflow-${String(index).padStart(2, "0")}`;
      fs.mkdirSync(path.join(root, "content", "plants", slug), { recursive: true });
      fs.writeFileSync(path.join(root, "content", "plants", slug, "vi.md"), slug, "utf8");
    }

    const handles: FakeAdapterHandle[] = [];
    const monitor = createContentSourceMonitor({
      db,
      config: {
        ...fastConfig(root),
        instanceId: "api-a",
        maxQueueSize: 2,
        debounceMs: 5,
      },
      watchAdapterFactory: fakeAdapterFactory(handles),
    });
    await monitor.start();
    expect(monitor.getStatus().phase).toBe("ready");

    // Real changes, not redelivery of identical bytes.
    const slugs = fs.readdirSync(path.join(root, "content", "plants"));
    const candidates: string[] = [];
    for (const slug of slugs) {
      const absolute = path.join(root, "content", "plants", slug, "vi.md");
      fs.writeFileSync(absolute, `${slug} changed`, "utf8");
      candidates.push(absolute);
    }
    monitor.handleCandidatePaths(candidates);

    const health = monitor.getStatus();
    expect(health.watcher.overflowCount).toBeGreaterThanOrEqual(1);
    expect(health.degradedReasons).toContain("WATCH_QUEUE_OVERFLOW");
    // Backpressure flushed batches instead of dropping them: every file is
    // processed exactly once through the durable journal.
    const processed = listChangeEvents(db, { detectorSources: ["watcher"] }).total;
    expect(processed).toBe(7);

    await monitor.stop();
  });

  it("routes watcher candidates to durable events through the shared pipeline", async () => {
    const db = openDatabase();
    const root = makeContentTree();
    const handles: FakeAdapterHandle[] = [];
    const monitor = createContentSourceMonitor({
      db,
      config: { ...fastConfig(root), instanceId: "api-a" },
      watchAdapterFactory: fakeAdapterFactory(handles),
    });
    await monitor.start();

    fs.writeFileSync(
      path.join(root, "content", "plants", "tomato", "vi.md"),
      "# tomato v2",
      "utf8",
    );
    monitor.handleCandidatePaths([path.join(root, "content", "plants", "tomato", "vi.md")]);

    const events = listChangeEvents(db, { reviewStates: ["pending"] }).items;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_type: "modified",
      detector_source: "watcher",
      path: "content/plants/tomato/vi.md",
    });

    await monitor.stop();
  });

  it("passes the configured locale policy through live candidate processing", async () => {
    const db = openDatabase();
    const root = makeContentTree();
    const frenchPath = path.join(root, "content", "plants", "tomato", "fr.md");
    fs.writeFileSync(frenchPath, "# tomate", "utf8");
    const handles: FakeAdapterHandle[] = [];
    const monitor = createContentSourceMonitor({
      db,
      config: { ...fastConfig(root), instanceId: "api-a", requiredLocales: ["fr"] },
      watchAdapterFactory: fakeAdapterFactory(handles),
    });
    await monitor.start();

    fs.writeFileSync(frenchPath, "# tomate v2", "utf8");
    monitor.handleCandidatePaths([frenchPath]);

    expect(listChangeEvents(db, { detectorSources: ["watcher"] }).items).toMatchObject([
      { path: "content/plants/tomato/fr.md", event_type: "modified" },
    ]);
    await monitor.stop();
  });

  it("marks health degraded when the adapter reports an error", async () => {
    const db = openDatabase();
    const root = makeContentTree();
    const handles: FakeAdapterHandle[] = [];
    const monitor = createContentSourceMonitor({
      db,
      config: { ...fastConfig(root), instanceId: "api-a" },
      watchAdapterFactory: fakeAdapterFactory(handles),
    });
    await monitor.start();

    handles[0]?.fail(new Error("EPERM: watch failed"));
    const health = monitor.getStatus();
    expect(health.phase).toBe("degraded");
    expect(health.degradedReasons).toContain("WATCHER_ERROR");
    expect(health.watcher.lastError).toContain("EPERM");

    await monitor.stop();
  });
});

describe("MCD-4 review fixes: lease-first startup and atomic ownership", () => {
  it("a passive instance writes zero detector state while another owns the lease", async () => {
    const db = openDatabase();
    const root = makeContentTree();
    const handlesA: FakeAdapterHandle[] = [];
    const handlesB: FakeAdapterHandle[] = [];
    const monitorA = createContentSourceMonitor({
      db,
      config: { ...fastConfig(root), instanceId: "api-a" },
      watchAdapterFactory: fakeAdapterFactory(handlesA),
    });
    await monitorA.start();

    const snapshot = () =>
      JSON.stringify({
        counts: [
          "content_source_monitor_runs",
          "content_change_events",
          "content_source_files",
          "content_source_checkpoints",
          "content_source_quarantine",
          "content_source_monitor_leases",
        ].map(
          (table) =>
            (
              db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
            ).count,
        ),
        // Full row contents: a same-count UPDATE of owner/expiry must fail
        // this snapshot too.
        leaseRows: db
          .prepare(
            `SELECT root_key, owner_id, acquired_at, renewed_at, expires_at
             FROM content_source_monitor_leases ORDER BY root_key`,
          )
          .all(),
      });
    const stateBefore = snapshot();
    const revisionBefore = (
      db.prepare(`SELECT revision FROM content_source_revision WHERE id = 1`).get() as {
        revision: number;
      }
    ).revision;

    const monitorB = createContentSourceMonitor({
      db,
      config: { ...fastConfig(root), instanceId: "api-b", leasePollMs: 50 },
      watchAdapterFactory: fakeAdapterFactory(handlesB),
    });
    await monitorB.start();
    // Exercise the passive instance's poll path too before asserting.
    monitorB.pollLeaseNow();

    expect(monitorB.getStatus().phase).toBe("passive");
    expect(monitorB.getStatus().lastCatchUp).toBeNull();
    expect(snapshot()).not.toBe("");
    expect(snapshot()).toBe(stateBefore);
    expect(
      (db.prepare(`SELECT revision FROM content_source_revision WHERE id = 1`).get() as {
        revision: number;
      }).revision,
    ).toBe(revisionBefore);
    // Not even the baseline may be re-run by the passive instance.
    expect(handlesB).toHaveLength(0);

    await Promise.all([monitorA.stop(), monitorB.stop()]);
  });

  it("releases partially acquired roots when any root acquisition fails", async () => {
    const db = openDatabase();
    const root = makeContentTree();
    // Another owner already holds the second root with a live lease.
    db.prepare(
      `INSERT INTO content_source_monitor_leases
         (root_key, owner_id, acquired_at, renewed_at, expires_at)
       VALUES ('pests-diseases', 'other', ?, ?, ?)`,
    ).run(
      new Date().toISOString(),
      new Date().toISOString(),
      new Date(Date.now() + 60_000).toISOString(),
    );

    const monitorB = createContentSourceMonitor({
      db,
      config: { ...fastConfig(root), instanceId: "api-b" },
    });
    await monitorB.start();

    expect(monitorB.getStatus().watching).toBe(false);
    expect(getMonitorLease(db, "pests-diseases")?.owner_id).toBe("other");
    // The first root must NOT remain half-held by api-b.
    expect(getMonitorLease(db, "plants")).toBeNull();

    await monitorB.stop();
  });

  it("does not resolve stop() until the watcher adapter handle has closed", async () => {
    const db = openDatabase();
    const root = makeContentTree();
    let releaseStop: (() => void) | null = null;
    let stopCalls = 0;
    const monitor = createContentSourceMonitor({
      db,
      config: { ...fastConfig(root), instanceId: "api-a" },
      watchAdapterFactory: () => ({
        kind: "test" as const,
        stop: () =>
          new Promise<void>((resolve) => {
            stopCalls += 1;
            releaseStop = resolve;
          }),
      }),
    });
    await monitor.start();
    expect(stopCalls).toBe(0);

    let settled = false;
    const stopping = monitor.stop().then(() => {
      settled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(stopCalls).toBe(1);
    expect(settled).toBe(false);
    // Ownership is only released after the handle closed.
    expect(getMonitorLease(db, "plants")?.owner_id).toBe("api-a");

    const release = releaseStop as (() => void) | null;
    release?.();
    await stopping;
    expect(settled).toBe(true);
    expect(getMonitorLease(db, "plants")).toBeNull();
    expect(getMonitorLease(db, "pests-diseases")).toBeNull();
  });
});

describe("MCD-4 review fix: lease-loss handoff race", () => {
  it("detaches intake immediately and releases leases only after the handle closes", async () => {
    const db = openDatabase();
    const root = makeContentTree();
    let releaseA: (() => void) | null = null;
    let aStopStarted = false;
    const handlesA: FakeAdapterHandle[] = [];
    const handlesB: FakeAdapterHandle[] = [];

    const factoryA: WatchAdapterFactory = (_watchRoots, handlers) => {
      const handle: FakeAdapterHandle = {
        stopCalls: 0,
        emit(absolutePath: string) {
          handlers.onCandidate(absolutePath, "change");
        },
        fail(error: Error) {
          handlers.onError(error);
        },
      };
      handlesA.push(handle);
      return {
        kind: "test" as const,
        stop: () =>
          new Promise<void>((resolve) => {
            handle.stopCalls += 1;
            aStopStarted = true;
            releaseA = resolve;
          }),
      };
    };

    const monitorA = createContentSourceMonitor({
      db,
      config: { ...fastConfig(root), instanceId: "api-a" },
      watchAdapterFactory: factoryA,
    });
    await monitorA.start();
    expect(monitorA.getStatus().watching).toBe(true);

    const monitorB = createContentSourceMonitor({
      db,
      config: { ...fastConfig(root), instanceId: "api-b" },
      watchAdapterFactory: fakeAdapterFactory(handlesB),
    });
    await monitorB.start();
    // Before expiry, B must stay passive.
    monitorB.pollLeaseNow();
    expect(monitorB.getStatus().watching).toBe(false);

    // A loses ownership by expiry; its next poll starts the demotion.
    db.prepare(`UPDATE content_source_monitor_leases SET expires_at = ?`).run(
      new Date(Date.now() - 1_000).toISOString(),
    );
    monitorA.pollLeaseNow();

    // Intake detached synchronously; close started but still pending.
    expect(monitorA.getStatus().watching).toBe(false);
    expect(aStopStarted).toBe(true);

    // A late callback from the still-closing old watcher must be inert.
    fs.writeFileSync(
      path.join(root, "content", "plants", "tomato", "vi.md"),
      "# late write from dying watcher",
      "utf8",
    );
    handlesA[0]?.emit(path.join(root, "content", "plants", "tomato", "vi.md"));
    expect(listChangeEvents(db).total).toBe(0);

    // Ownership is NOT released while the handle is still closing.
    expect(getMonitorLease(db, "plants")?.owner_id).toBe("api-a");
    expect(getMonitorLease(db, "pests-diseases")?.owner_id).toBe("api-a");

    const release = releaseA as (() => void) | null;
    release?.();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    // Only after the close resolved does ownership change hands.
    expect(getMonitorLease(db, "plants")).toBeNull();
    expect(getMonitorLease(db, "pests-diseases")).toBeNull();

    monitorB.pollLeaseNow();
    expect(monitorB.getStatus().watching).toBe(true);
    expect(handlesB.length).toBeGreaterThan(0);

    // Another late callback from A's dead adapter stays inert even though
    // B is now the active writer.
    fs.writeFileSync(
      path.join(root, "content", "plants", "tomato", "vi.md"),
      "# post-takeover late write",
      "utf8",
    );
    handlesA[0]?.emit(path.join(root, "content", "plants", "tomato", "vi.md"));
    expect(listChangeEvents(db, { detectorSources: ["watcher"] }).total).toBe(0);

    await Promise.all([monitorA.stop(), monitorB.stop()]);
  });
});

describe("MCD-4 review round 4: repeated relinquish cycles", () => {
  it("closes the second adapter and releases leases on the next cycle too", async () => {
    const db = openDatabase();
    const root = makeContentTree();
    const stopResolvers: Array<() => void> = [];
    let stopCalls = 0;
    const handles: FakeAdapterHandle[] = [];

    const factory: WatchAdapterFactory = (_watchRoots, handlers) => {
      const handle: FakeAdapterHandle = {
        stopCalls: 0,
        emit(absolutePath: string) {
          handlers.onCandidate(absolutePath, "change");
        },
        fail(error: Error) {
          handlers.onError(error);
        },
      };
      handles.push(handle);
      return {
        kind: "test" as const,
        stop: () =>
          new Promise<void>((resolve) => {
            stopCalls += 1;
            handle.stopCalls += 1;
            stopResolvers.push(resolve);
          }),
      };
    };

    const monitor = createContentSourceMonitor({
      db,
      config: { ...fastConfig(root), instanceId: "api-a" },
      watchAdapterFactory: factory,
    });
    await monitor.start();
    expect(handles.length).toBe(1);

    // Cycle 1: lose ownership by expiry; relinquish with a deferred close.
    db.prepare(`UPDATE content_source_monitor_leases SET expires_at = ?`).run(
      new Date(Date.now() - 1_000).toISOString(),
    );
    monitor.pollLeaseNow();
    expect(monitor.getStatus().watching).toBe(false);
    expect(stopCalls).toBe(1);
    expect(getMonitorLease(db, "plants")?.owner_id).toBe("api-a");

    const firstResolve = stopResolvers.shift() as (() => void) | null;
    firstResolve?.();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    expect(getMonitorLease(db, "plants")).toBeNull();

    // Re-takeover opens a brand-new adapter through the SAME monitor.
    monitor.pollLeaseNow();
    expect(monitor.getStatus().watching).toBe(true);
    expect(handles.length).toBe(2);
    expect(stopCalls).toBe(1);

    // Cycle 2 via stop(): a stale cached relinquish promise would skip
    // closing the second adapter entirely.
    const stopping = monitor.stop();
    expect(stopCalls).toBe(2);

    // Second adapter's intake must already be detached.
    fs.writeFileSync(
      path.join(root, "content", "plants", "tomato", "vi.md"),
      "# cycle-2 late write",
      "utf8",
    );
    handles[1]?.emit(path.join(root, "content", "plants", "tomato", "vi.md"));
    expect(listChangeEvents(db, { detectorSources: ["watcher"] }).total).toBe(0);

    // Leases survive until the second close resolves.
    expect(getMonitorLease(db, "plants")?.owner_id).toBe("api-a");

    const secondResolve = stopResolvers.shift() as (() => void) | null;
    secondResolve?.();
    await stopping;
    expect(getMonitorLease(db, "plants")).toBeNull();
    expect(getMonitorLease(db, "pests-diseases")).toBeNull();
    expect(handles.every((handle) => handle.stopCalls === 1)).toBe(true);
  });
});

describe("MCD-4 review fix: queue overflow keeps the last candidate scheduled", () => {
  it("flushes the final pushed path via the debounce timer without flushNow", () => {
    let armed: (() => void) | null = null;
    const schedule: DebounceSchedule = (fn) => {
      armed = fn;
      return () => {
        if (armed === fn) armed = null;
      };
    };
    const flushed: string[][] = [];
    const queue = createCandidateQueue({
      debounceMs: 10,
      maxQueueSize: 2,
      flush: (paths) => flushed.push([...paths]),
      schedule,
    });

    queue.push("/a.md");
    queue.push("/b.md");
    expect(flushed).toEqual([]);
    expect(armed).not.toBeNull();

    // Overflow: flush [a,b] synchronously, then queue c.
    const result = queue.push("/c.md");
    expect(result.overflowFlush).toBe(true);
    expect(flushed).toEqual([["/a.md", "/b.md"]]);
    expect(queue.size()).toBe(1);

    // Regression: the timer must be re-armed even after an overflow push.
    expect(armed).not.toBeNull();
    const fire = armed as (() => void) | null;
    fire?.();
    expect(flushed).toEqual([
      ["/a.md", "/b.md"],
      ["/c.md"],
    ]);
    expect(queue.size()).toBe(0);
    expect(queue.overflowCount()).toBe(1);
  });
});
