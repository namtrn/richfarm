import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Request, Response, Router } from "express";
import { afterEach, describe, expect, it } from "vitest";

import {
  auditCanonicalIdentity,
} from "../src/canonical-identity-audit";
import {
  createDatabase,
  getSyncCatalogRevision,
  type SqliteDatabase,
} from "../src/db";
import type { ConvexSyncService } from "../src/convex-sync";
import {
  cleanupResolvedFindingEvidence,
  approveSyncRepairProposal,
  applySyncRepairProposal,
  createSyncRepairProposal,
  createSyncReconciliationRouter,
  dismissSyncFinding,
  persistReconciliationAudit,
  readCompleteConvexSnapshot,
  resolveSyncFinding,
  type ConvexSnapshotAdapter,
} from "../src/sync-reconciliation";
import {
  enqueueSyncOutbox,
  evaluateSyncOutboxGate,
  overrideBlockedSyncOutbox,
  processSyncOutbox,
  requeueResolvedSyncOutbox,
} from "../src/sync-outbox";
import type { AuthUser } from "../src/auth";

const openDatabases: SqliteDatabase[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  while (openDatabases.length > 0) openDatabases.pop()?.close();
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

function openMemory(): SqliteDatabase {
  const db = createDatabase(":memory:");
  openDatabases.push(db);
  return db;
}

function queue(db: SqliteDatabase, sourceId: string, payload: Record<string, unknown>, locale?: string): number {
  return enqueueSyncOutbox(db, {
    entityType: "master_plant",
    sourceSystem: "sqlite",
    sourceId,
    operation: "upsert_i18n",
    locale,
    payload,
  });
}

function service(calls: Array<Record<string, unknown>> = []): ConvexSyncService {
  return {
    isEnabled: () => true,
    syncUpsert: async (payload: Record<string, unknown>) => { calls.push(payload); },
    syncDelete: async () => undefined,
  } as unknown as ConvexSyncService;
}

function addBlockedFinding(
  db: SqliteDatabase,
  sourceId: string,
  sqliteCatalogRevision: string,
  outboxWatermark: number,
  canonicalKey: string | null = null,
): number {
  const result = db.prepare(`
    INSERT INTO sync_findings (
      fingerprint, severity, code, category, canonical_key,
      sqlite_identity_json, evidence_json, sqlite_catalog_revision,
      sqlite_data_revision, outbox_watermark, resolution_status
    ) VALUES (?, 'blocked', 'TEST_BLOCK', 'synchronization', ?, ?, ?, ?, 'test', ?, 'open')
  `).run(
    `test-${sourceId}-${crypto.randomUUID()}`,
    canonicalKey,
    JSON.stringify([{ id: sourceId, plantCode: sourceId, sourceSystem: "sqlite", sourceId }]),
    JSON.stringify({ rowId: sourceId }),
    sqliteCatalogRevision,
    outboxWatermark,
  );
  return Number(result.lastInsertRowid);
}

function insertLegacyOutboxTable(dbPath: string): void {
  const raw = new Database(dbPath);
  raw.exec(`
    DROP INDEX idx_sync_outbox_status_next_attempt;
    DROP INDEX idx_sync_outbox_source;
    ALTER TABLE sync_outbox RENAME TO sync_outbox_cid7_new;
    CREATE TABLE sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupe_key TEXT NOT NULL UNIQUE,
      entity_type TEXT NOT NULL,
      source_system TEXT NOT NULL,
      source_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      locale TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'applied', 'failed')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_attempt_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      applied_at TEXT
    );
    INSERT INTO sync_outbox (
      id, dedupe_key, entity_type, source_system, source_id, operation,
      locale, payload_json, status, attempt_count, next_attempt_at,
      last_attempt_at, last_error, created_at, updated_at, applied_at
    )
    SELECT id, dedupe_key, entity_type, source_system, source_id, operation,
      locale, payload_json, status, attempt_count, next_attempt_at,
      last_attempt_at, last_error, created_at, updated_at, applied_at
    FROM sync_outbox_cid7_new;
    DROP TABLE sync_outbox_cid7_new;
    CREATE INDEX idx_sync_outbox_status_next_attempt ON sync_outbox(status, next_attempt_at);
    CREATE INDEX idx_sync_outbox_source ON sync_outbox(source_system, source_id);
  `);
  raw.close();
}

interface RouterProbeResult {
  status: number;
  body: Record<string, unknown>;
}

function invokeRouter(
  router: Router,
  method: string,
  url: string,
  authUser?: AuthUser,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Promise<RouterProbeResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (status: number, payload: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      resolve({ status, body: payload });
    };
    const req = {
      method,
      url,
      originalUrl: url,
      baseUrl: "",
      path: url,
      body,
      query: {},
      params: {},
      headers,
      authUser,
      get(name: string) {
        return headers[name.toLowerCase()];
      },
    } as unknown as Request;
    const res = {
      statusCode: 200,
      headersSent: false,
      locals: {},
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: Record<string, unknown>) {
        this.headersSent = true;
        finish(this.statusCode, payload);
        return this;
      },
      send(payload: Record<string, unknown>) {
        this.headersSent = true;
        finish(this.statusCode, payload);
        return this;
      },
      setHeader() { return this; },
      getHeader() { return undefined; },
    } as unknown as Response;
    router.handle(req, res, (error?: unknown) => {
      if (error) {
        finish(500, { error: error instanceof Error ? error.message : String(error) });
      } else {
        finish(404, { error: "not found" });
      }
    });
  });
}

describe("CID-7 SQLite reconciliation control plane", () => {
  it("rebuilds a legacy outbox without changing ids, payloads, or statuses", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "richfarm-cid7-legacy-"));
    temporaryDirectories.push(directory);
    const dbPath = path.join(directory, "legacy.db");
    let db = createDatabase(dbPath);
    openDatabases.push(db);
    const first = queue(db, "legacy-pending", { value: "pending" }, "en");
    const second = queue(db, "legacy-applied", { value: "applied" }, "vi");
    db.prepare(`UPDATE sync_outbox SET status = 'applied', applied_at = datetime('now') WHERE id = ?`).run(second);
    const before = db.prepare(`SELECT id, payload_json, status FROM sync_outbox ORDER BY id`).all();
    db.close();
    openDatabases.splice(openDatabases.indexOf(db), 1);

    insertLegacyOutboxTable(dbPath);
    db = createDatabase(dbPath);
    openDatabases.push(db);
    expect(db.prepare(`SELECT id, payload_json, status FROM sync_outbox ORDER BY id`).all()).toEqual(before);
    expect(first).toBe(1);
    expect(db.prepare(`SELECT sql FROM sqlite_master WHERE name = 'sync_outbox'`).get<{ sql: string }>().sql).toContain("'blocked'");
    expect(db.prepare(`SELECT sql FROM sqlite_master WHERE name = 'sync_outbox'`).get<{ sql: string }>().sql).toContain("'superseded'");
  });

  it("increments catalog revision atomically with enqueue and rolls it back with the writer", () => {
    const db = openMemory();
    expect(getSyncCatalogRevision(db)).toBe(0);
    const id = queue(db, "revision-1", { value: 1 });
    expect(id).toBe(1);
    expect(getSyncCatalogRevision(db)).toBe(1);
    expect(() => db.transaction(() => {
      queue(db, "revision-rollback", { value: 2 });
      throw new Error("rollback");
    })()).toThrow("rollback");
    expect(getSyncCatalogRevision(db)).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM sync_outbox WHERE source_id = 'revision-rollback'`).get<{ n: number }>().n).toBe(0);
  });

  it("accepts complete pages and fails closed for repeated cursor, count, and revision drift", async () => {
    const completePages: ConvexSnapshotAdapter = {
      readPage: async ({ cursor }) => cursor === null
        ? { rows: [{ id: 1 }], nextCursor: "next", snapshotRevision: "r1", expectedCount: 2, sourceDataChanged: false }
        : { rows: [{ id: 2 }], nextCursor: null, snapshotRevision: "r1", expectedCount: 2, sourceDataChanged: false },
    };
    const complete = await readCompleteConvexSnapshot(completePages, { pageSize: 1 });
    expect(complete).toMatchObject({ complete: true, receivedCount: 2, pageCount: 2, reason: null });

    const exactBoundary = await readCompleteConvexSnapshot(completePages, { pageSize: 1, maxPages: 2 });
    expect(exactBoundary).toMatchObject({ complete: true, receivedCount: 2, pageCount: 2, reason: null });

    const nonterminalLimit = await readCompleteConvexSnapshot({
      readPage: async ({ cursor }) => cursor === null
        ? { rows: [{ id: 1 }], nextCursor: "next", snapshotRevision: "r1", expectedCount: 3, sourceDataChanged: false }
        : { rows: [{ id: 2 }], nextCursor: "last", snapshotRevision: "r1", expectedCount: 3, sourceDataChanged: false },
    }, { pageSize: 1, maxPages: 2 });
    expect(nonterminalLimit).toMatchObject({ complete: false, reason: "page_limit_exceeded", pageCount: 2 });

    const repeated = await readCompleteConvexSnapshot({
      readPage: async () => ({ rows: [{ id: 1 }], nextCursor: "same", snapshotRevision: "r1", expectedCount: 2, sourceDataChanged: false }),
    }, { pageSize: 1, maxPages: 5 });
    expect(repeated).toMatchObject({ complete: false, reason: "repeated_cursor", receivedCount: 2 });

    const countDrift = await readCompleteConvexSnapshot({
      readPage: async ({ cursor }) => cursor === null
        ? { rows: [{ id: 1 }], nextCursor: "next", snapshotRevision: "r1", expectedCount: 2, sourceDataChanged: false }
        : { rows: [{ id: 2 }], nextCursor: null, snapshotRevision: "r1", expectedCount: 3, sourceDataChanged: false },
    }, { pageSize: 1 });
    expect(countDrift).toMatchObject({ complete: false, reason: "expected_count_changed" });

    const revisionDrift = await readCompleteConvexSnapshot({
      readPage: async ({ cursor }) => cursor === null
        ? { rows: [{ id: 1 }], nextCursor: "next", snapshotRevision: "r1", expectedCount: 2, sourceDataChanged: false }
        : { rows: [{ id: 2 }], nextCursor: null, snapshotRevision: "r2", expectedCount: 2, sourceDataChanged: false },
    }, { pageSize: 1 });
    expect(revisionDrift).toMatchObject({ complete: false, reason: "snapshot_revision_changed" });

    const endRevisionDrift = await readCompleteConvexSnapshot({
      readPage: async ({ cursor }) => cursor === null
        ? { rows: [{ id: 1 }], nextCursor: "next", snapshotRevision: "r1", expectedCount: 2, sourceDataChanged: false }
        : { rows: [{ id: 2 }], nextCursor: null, snapshotRevision: "r1", expectedCount: 2, sourceDataChanged: false },
      readMetadata: async () => ({ snapshotRevision: "r2", expectedCount: 2 }),
    }, { pageSize: 1 });
    expect(endRevisionDrift).toMatchObject({ complete: false, reason: "snapshot_revision_changed_at_end" });

    const endCountDrift = await readCompleteConvexSnapshot({
      readPage: async ({ cursor }) => cursor === null
        ? { rows: [{ id: 1 }], nextCursor: "next", snapshotRevision: "r1", expectedCount: 2, sourceDataChanged: false }
        : { rows: [{ id: 2 }], nextCursor: null, snapshotRevision: "r1", expectedCount: 2, sourceDataChanged: false },
      readMetadata: async () => ({ snapshotRevision: "r1", expectedCount: 3 }),
    }, { pageSize: 1 });
    expect(endCountDrift).toMatchObject({ complete: false, reason: "expected_count_changed_at_end" });
  });

  it("coalesces findings, records freshness, and retains open evidence while redacting expired resolved evidence", () => {
    const db = openMemory();
    const canonicalKey = '["v1","test","plant","","",""]';
    const insertPlant = db.prepare(`
      INSERT INTO master_plants (
        id, plant_code, common_name, scientific_name, canonical_status,
        canonical_key, canonical_identity_version
      ) VALUES (?, ?, ?, ?, 'active', ?, 'canonical_identity_v1')
    `);
    insertPlant.run(1, "TEST_DUP_A", "Test", "Testus plantus", canonicalKey);
    insertPlant.run(2, "TEST_DUP_B", "Test", "Testus plantus", canonicalKey);
    const report = auditCanonicalIdentity(db);
    expect(report.status).toBe("blocked");
    const first = persistReconciliationAudit(db, report, { runId: "cid7-audit-1" });
    const second = persistReconciliationAudit(db, report, { runId: "cid7-audit-2" });
    expect(first.findingCount).toBeGreaterThan(0);
    expect(second.runId).toBe("cid7-audit-2");
    const finding = db.prepare(`SELECT * FROM sync_findings ORDER BY id LIMIT 1`).get() as {
      id: number;
      occurrence_count: number;
      resolution_status: string;
      evidence_json: string;
      sqlite_catalog_revision: string;
      outbox_watermark: number;
    };
    expect(finding.occurrence_count).toBe(2);
    expect(finding.resolution_status).toBe("open");
    expect(finding.sqlite_catalog_revision).toBe("0");
    expect(finding.outbox_watermark).toBe(0);
    resolveSyncFinding(db, finding.id, "admin@example.com", "verified for retention test");
    db.prepare(`UPDATE sync_findings SET last_seen_at = datetime('now', '-365 days') WHERE id = ?`).run(finding.id);
    const redacted = cleanupResolvedFindingEvidence(db, { retentionDays: 180, limit: 10 });
    expect(redacted).toBe(1);
    expect(db.prepare(`SELECT evidence_json, resolution_status FROM sync_findings WHERE id = ?`).get(finding.id)).toEqual({ evidence_json: "{}", resolution_status: "resolved" });
  });

  it("blocks fresh findings, ignores stale findings, requeues resolved work, and audits overrides", async () => {
    const db = openMemory();
    const sourceId = "gate-fresh";
    const id = queue(db, sourceId, { id: 42, plant_code: sourceId, value: "blocked" });
    const findingId = addBlockedFinding(db, sourceId, String(getSyncCatalogRevision(db)), id);
    const calls: Array<Record<string, unknown>> = [];
    const blocked = await processSyncOutbox(db, service(calls), 10);
    expect(blocked).toMatchObject({ processed: 1, blocked: 1, applied: 0 });
    expect(calls).toHaveLength(0);
    expect(db.prepare(`SELECT status, blocked_finding_id FROM sync_outbox WHERE id = ?`).get(id)).toEqual({ status: "blocked", blocked_finding_id: findingId });

    resolveSyncFinding(db, findingId, "admin@example.com", "resolved gate finding");
    requeueResolvedSyncOutbox(db, id, "admin@example.com", "requeue after resolution");
    const replayed = await processSyncOutbox(db, service(calls), 10);
    expect(replayed.applied).toBe(1);
    expect(calls).toHaveLength(1);
    expect(db.prepare(`SELECT action, operator_id FROM sync_outbox_audit WHERE outbox_id = ?`).get(id)).toMatchObject({ action: "requeue", operator_id: "admin@example.com" });

    const staleId = queue(db, "gate-stale", { id: 43, plant_code: "gate-stale" });
    addBlockedFinding(db, "gate-stale", "old-revision", 0);
    expect(evaluateSyncOutboxGate(db, db.prepare(`SELECT * FROM sync_outbox WHERE id = ?`).get(staleId) as never).allowed).toBe(true);
    const staleSent = await processSyncOutbox(db, service(calls), 10);
    expect(staleSent.applied).toBe(1);

    const overrideId = queue(db, "gate-override", { id: 44, plant_code: "gate-override" });
    const overrideFinding = addBlockedFinding(db, "gate-override", String(getSyncCatalogRevision(db)), overrideId);
    await processSyncOutbox(db, service(calls), 10);
    const override = overrideBlockedSyncOutbox(
      db,
      overrideId,
      "admin@example.com",
      "approved emergency publish",
      new Date(Date.now() + 60_000).toISOString(),
    );
    expect(override).toContain("outbox-override-");
    expect(db.prepare(`SELECT status, override_id FROM sync_outbox WHERE id = ?`).get(overrideId)).toMatchObject({ status: "pending", override_id: override });
    const overrideSent = await processSyncOutbox(db, service(calls), 10);
    expect(overrideSent.applied).toBe(1);
    expect(db.prepare(`SELECT action, finding_id FROM sync_outbox_audit WHERE outbox_id = ? ORDER BY id DESC LIMIT 1`).get(overrideId)).toEqual({ action: "override", finding_id: overrideFinding });

    const expiredId = queue(db, "gate-expired-override", { id: 45, plant_code: "gate-expired-override" });
    addBlockedFinding(db, "gate-expired-override", String(getSyncCatalogRevision(db)), expiredId);
    const initiallyBlocked = await processSyncOutbox(db, service(calls), 10);
    expect(initiallyBlocked.blocked).toBe(1);
    overrideBlockedSyncOutbox(
      db,
      expiredId,
      "admin@example.com",
      "temporary override",
      new Date(Date.now() + 60_000).toISOString(),
    );
    db.prepare(`UPDATE sync_outbox SET override_expires_at = datetime('now', '-1 second') WHERE id = ?`).run(expiredId);
    const callsBeforeExpired = calls.length;
    const expired = await processSyncOutbox(db, service(calls), 10);
    expect(expired).toMatchObject({ blocked: 1, applied: 0 });
    expect(calls).toHaveLength(callsBeforeExpired);
    expect(db.prepare(`SELECT status FROM sync_outbox WHERE id = ?`).get(expiredId)).toEqual({ status: "blocked" });
  });

  it("reclaims an expired processing lease and never publishes a stale superseded snapshot", async () => {
    const db = openMemory();
    const calls: Array<Record<string, unknown>> = [];
    const leasedId = queue(db, "lease-1", { id: 50, value: "lease" });
    db.prepare(`UPDATE sync_outbox SET status = 'processing', lease_expires_at = datetime('now', '-1 second') WHERE id = ?`).run(leasedId);
    const reclaimed = await processSyncOutbox(db, service(calls), 10);
    expect(reclaimed.applied).toBe(1);
    expect(calls[0]).toMatchObject({ id: 50 });

    const oldId = queue(db, "snapshot-1", { id: 51, value: "old" }, "en");
    const newId = queue(db, "snapshot-1", { id: 51, value: "new" }, "vi");
    expect(db.prepare(`SELECT status FROM sync_outbox WHERE id = ?`).get(oldId)).toEqual({ status: "pending" });
    const latest = await processSyncOutbox(db, service(calls), 10);
    expect(latest.applied).toBe(1);
    expect(calls.at(-1)).toMatchObject({ id: 51, value: "new" });
    expect(db.prepare(`SELECT status, superseded_by FROM sync_outbox WHERE id = ?`).get(oldId)).toEqual({ status: "superseded", superseded_by: newId });
  });

  it("enforces editor/admin/service/unauthorized roles through pure router probes", async () => {
    const db = openMemory();
    const adapter: ConvexSnapshotAdapter = {
      readPage: async () => ({
        rows: [],
        nextCursor: null,
        snapshotRevision: "r1",
        expectedCount: 0,
        sourceDataChanged: false,
      }),
    };
    const router = createSyncReconciliationRouter(db, undefined, {
      adapter,
      serviceAuditToken: "service-secret",
    });
    const editor: AuthUser = { id: 2, email: "editor@example.com", role: "editor" };
    const admin: AuthUser = { id: 1, email: "admin@example.com", role: "admin" };
    const beforeAudit = {
      plants: (db.prepare(`SELECT COUNT(*) AS n FROM master_plants`).get() as { n: number }).n,
      outbox: (db.prepare(`SELECT COUNT(*) AS n FROM sync_outbox`).get() as { n: number }).n,
    };

    const editorAudit = await invokeRouter(router, "GET", "/audit", editor);
    expect(editorAudit.status).toBe(200);
    expect((editorAudit.body.report as { freshnessBoundary: { snapshotComplete: boolean } }).freshnessBoundary.snapshotComplete).toBe(true);
    const editorProposal = await invokeRouter(router, "POST", "/proposals", editor, {
      run_id: (editorAudit.body.run as { runId: string }).runId,
      action: "republish",
    });
    expect(editorProposal.status).toBe(403);

    const serviceAudit = await invokeRouter(router, "GET", "/audit", undefined, {}, { "x-sync-service-token": "service-secret" });
    expect(serviceAudit.status).toBe(200);
    const serviceProposal = await invokeRouter(router, "POST", "/proposals", undefined, {
      run_id: (editorAudit.body.run as { runId: string }).runId,
      action: "republish",
    }, { "x-sync-service-token": "service-secret" });
    expect(serviceProposal.status).toBe(401);
    const unauthorized = await invokeRouter(router, "GET", "/audit");
    expect(unauthorized.status).toBe(401);
    expect({
      plants: (db.prepare(`SELECT COUNT(*) AS n FROM master_plants`).get() as { n: number }).n,
      outbox: (db.prepare(`SELECT COUNT(*) AS n FROM sync_outbox`).get() as { n: number }).n,
    }).toEqual(beforeAudit);

    const sourceId = "role-gated-plant";
    const outboxId = queue(db, sourceId, { id: 100, plant_code: sourceId });
    const findingId = addBlockedFinding(db, sourceId, String(getSyncCatalogRevision(db)), outboxId);
    db.prepare(`UPDATE sync_outbox SET status = 'blocked', blocked_finding_id = ?, blocked_at = datetime('now') WHERE id = ?`).run(findingId, outboxId);
    const resolved = await invokeRouter(router, "POST", `/findings/${findingId}/resolve`, admin, { reason: "admin verified" });
    expect(resolved.status).toBe(200);
    const requeued = await invokeRouter(router, "POST", `/outbox/${outboxId}/requeue`, admin, { reason: "admin requeue" });
    expect(requeued.status).toBe(200);

    const overrideOutboxId = queue(db, "role-override-plant", { id: 101, plant_code: "role-override-plant" });
    const overrideFindingId = addBlockedFinding(db, "role-override-plant", String(getSyncCatalogRevision(db)), overrideOutboxId);
    db.prepare(`UPDATE sync_outbox SET status = 'blocked', blocked_finding_id = ?, blocked_at = datetime('now') WHERE id = ?`).run(overrideFindingId, overrideOutboxId);
    const override = await invokeRouter(router, "POST", `/outbox/${overrideOutboxId}/override`, admin, {
      reason: "admin emergency override",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(override.status).toBe(200);

    const adminProposal = await invokeRouter(router, "POST", "/proposals", admin, {
      run_id: (editorAudit.body.run as { runId: string }).runId,
      action: "republish",
    });
    expect(adminProposal.status).toBe(201);
    const apply = await invokeRouter(router, "POST", "/proposals/not-configured/apply", admin, { reason: "test" });
    expect(apply.status).toBe(501);
    expect(apply.body.code).toBe("PROPOSAL_APPLY_HANDLER_UNAVAILABLE");
  });

  it("requires prior distinct approval and fresh local boundaries before applying a repair proposal", async () => {
    const db = openMemory();
    const report = auditCanonicalIdentity(db, {
      convexSnapshot: {
        rows: [],
        revision: "apply-revision",
        expectedCount: 0,
        pageCount: 1,
        complete: true,
      },
    });
    const run = persistReconciliationAudit(db, report, { runId: "cid7-proposal-run" });
    const applyAdapter: ConvexSnapshotAdapter = {
      readPage: async () => ({ rows: [], nextCursor: null, snapshotRevision: "apply-revision", expectedCount: 0, sourceDataChanged: false }),
      readMetadata: async () => ({ snapshotRevision: "apply-revision", expectedCount: 0, initialized: true }),
    };
    const proposalId = createSyncRepairProposal(db, {
      proposalId: "cid7-proposal-proposed",
      runId: run.runId,
      action: "republish",
      payload: { sourceId: "proposal-1" },
      evidence: { test: true },
      createdBy: "creator@example.com",
    });
    let applyCalls = 0;
    await expect(applySyncRepairProposal(
      db,
      proposalId,
      "operator@example.com",
      "apply proposed should fail",
      () => { applyCalls += 1; },
      applyAdapter,
    )).rejects.toThrow(/approved/i);
    expect(applyCalls).toBe(0);
    expect(db.prepare(`SELECT status, approved_by, approved_at FROM sync_repair_proposals WHERE proposal_id = ?`).get(proposalId)).toEqual({
      status: "proposed",
      approved_by: null,
      approved_at: null,
    });

    db.prepare(`
      UPDATE sync_repair_proposals
      SET status = 'approved', approved_by = ?, approved_at = datetime('now')
      WHERE proposal_id = ?
    `).run("operator@example.com", proposalId);
    await expect(applySyncRepairProposal(
      db,
      proposalId,
      "operator@example.com",
      "self-approved repair should fail",
      () => { applyCalls += 1; },
      applyAdapter,
    )).rejects.toThrow(/distinct/i);
    expect(applyCalls).toBe(0);

    db.prepare(`
      UPDATE sync_repair_proposals
      SET approved_by = ?
      WHERE proposal_id = ?
    `).run("approver@example.com", proposalId);
    await applySyncRepairProposal(
      db,
      proposalId,
      "operator@example.com",
      "approved repair",
      () => { applyCalls += 1; },
      applyAdapter,
    );
    expect(applyCalls).toBe(1);
    expect(db.prepare(`SELECT status, approved_by, applied_by FROM sync_repair_proposals WHERE proposal_id = ?`).get(proposalId)).toEqual({
      status: "applied",
      approved_by: "approver@example.com",
      applied_by: "operator@example.com",
    });

    const staleProposalId = createSyncRepairProposal(db, {
      proposalId: "cid7-proposal-stale",
      runId: run.runId,
      action: "republish",
      payload: { sourceId: "proposal-stale" },
      evidence: { test: true },
      createdBy: "creator@example.com",
    });
    db.prepare(`
      UPDATE sync_repair_proposals
      SET status = 'approved', approved_by = ?, approved_at = datetime('now')
      WHERE proposal_id = ?
    `).run("approver@example.com", staleProposalId);
    queue(db, "proposal-stale", { value: "changed-after-audit" });
    await expect(applySyncRepairProposal(
      db,
      staleProposalId,
      "operator@example.com",
      "stale repair should fail",
      () => { applyCalls += 1; },
      applyAdapter,
    )).rejects.toThrow(/stale/i);
    expect(applyCalls).toBe(1);
    expect(db.prepare(`SELECT status FROM sync_repair_proposals WHERE proposal_id = ?`).get(staleProposalId)).toEqual({ status: "stale" });
  });

  it("revalidates proposal freshness at approval and stores the complete boundary", async () => {
    const db = openMemory();
    const admin: AuthUser = { id: 1, email: "approver@example.com", role: "admin" };
    const adapter: ConvexSnapshotAdapter = {
      readPage: async () => ({
        rows: [],
        nextCursor: null,
        snapshotRevision: "convex-approval-1",
        expectedCount: 0,
        sourceDataChanged: false,
      }),
      readMetadata: async () => ({ snapshotRevision: "convex-approval-1", expectedCount: 0, initialized: true }),
    };
    const router = createSyncReconciliationRouter(db, undefined, { adapter });
    const audit = await invokeRouter(router, "GET", "/audit", admin);
    expect(audit.status).toBe(200);
    const runId = (audit.body.run as { runId: string }).runId;
    const proposed = await invokeRouter(router, "POST", "/proposals", admin, {
      run_id: runId,
      action: "republish",
      payload: { sourceId: "approval-fresh" },
    });
    expect(proposed.status).toBe(201);
    const proposalId = String(proposed.body.proposal_id);
    const approved = await invokeRouter(router, "POST", `/proposals/${proposalId}/approve`, admin, { reason: "fresh evidence reviewed" });
    expect(approved.status).toBe(200);
    expect((approved.body.freshness as { snapshotComplete: boolean }).snapshotComplete).toBe(true);
    const approvedRow = db.prepare(`
      SELECT status, approved_by, approval_reason, sqlite_catalog_revision,
        sqlite_data_revision, outbox_watermark, convex_snapshot_revision,
        convex_expected_count, convex_received_count, convex_page_count,
        snapshot_complete, source_data_changed
      FROM sync_repair_proposals WHERE proposal_id = ?
    `).get(proposalId) as Record<string, unknown>;
    expect(approvedRow).toMatchObject({
      status: "approved",
      approved_by: "approver@example.com",
      approval_reason: "fresh evidence reviewed",
      convex_snapshot_revision: "convex-approval-1",
      convex_expected_count: 0,
      convex_received_count: 0,
      convex_page_count: 1,
      snapshot_complete: 1,
      source_data_changed: 0,
    });

    const staleProposal = await invokeRouter(router, "POST", "/proposals", admin, {
      run_id: runId,
      action: "republish",
      payload: { sourceId: "approval-stale" },
    });
    const staleId = String(staleProposal.body.proposal_id);
    queue(db, "approval-stale", { value: "changed after audit" });
    const staleApproval = await invokeRouter(router, "POST", `/proposals/${staleId}/approve`, admin, { reason: "should reject stale" });
    expect(staleApproval.status).toBe(409);
    expect(staleApproval.body.code).toBe("PROPOSAL_STALE");
    expect(db.prepare(`SELECT status FROM sync_repair_proposals WHERE proposal_id = ?`).get(staleId)).toEqual({ status: "proposed" });

    const incompleteProposal = await invokeRouter(router, "POST", "/proposals", admin, {
      run_id: runId,
      action: "republish",
      payload: { sourceId: "approval-incomplete" },
    });
    const incompleteId = String(incompleteProposal.body.proposal_id);
    db.prepare(`UPDATE sync_reconciliation_runs SET status = 'incomplete', snapshot_complete = 0 WHERE run_id = ?`).run(runId);
    const incompleteApproval = await invokeRouter(router, "POST", `/proposals/${incompleteId}/approve`, admin, { reason: "should reject incomplete" });
    expect(incompleteApproval.status).toBe(409);
    expect(incompleteApproval.body.code).toBe("PROPOSAL_INCOMPLETE");
  });

  it("fails closed on remote catalog drift, unavailability, or uninitialized metadata", async () => {
    const db = openMemory();
    const admin: AuthUser = { id: 1, email: "remote-admin@example.com", role: "admin" };
    let liveMetadata = { snapshotRevision: "remote-r1", expectedCount: 0, initialized: true };
    const adapter: ConvexSnapshotAdapter = {
      readPage: async () => ({ rows: [], nextCursor: null, snapshotRevision: "remote-r1", expectedCount: 0, sourceDataChanged: false }),
      readMetadata: async () => liveMetadata,
    };
    const router = createSyncReconciliationRouter(db, undefined, { adapter });
    const audit = await invokeRouter(router, "GET", "/audit", admin);
    const proposed = await invokeRouter(router, "POST", "/proposals", admin, {
      run_id: (audit.body.run as { runId: string }).runId,
      action: "republish",
    });
    const proposalId = String(proposed.body.proposal_id);
    liveMetadata = { snapshotRevision: "remote-r2", expectedCount: 0, initialized: true };
    const drifted = await invokeRouter(router, "POST", `/proposals/${proposalId}/approve`, admin, { reason: "remote drift probe" });
    expect(drifted.status).toBe(409);
    expect(drifted.body.code).toBe("PROPOSAL_REMOTE_STALE");

    const incompleteProposal = await invokeRouter(router, "POST", "/proposals", admin, {
      run_id: (audit.body.run as { runId: string }).runId,
      action: "republish",
    });
    const incompleteId = String(incompleteProposal.body.proposal_id);
    liveMetadata = { snapshotRevision: "remote-r1", expectedCount: 0, initialized: false };
    const uninitialized = await invokeRouter(router, "POST", `/proposals/${incompleteId}/approve`, admin, { reason: "uninitialized probe" });
    expect(uninitialized.status).toBe(409);
    expect(uninitialized.body.code).toBe("PROPOSAL_REMOTE_INCOMPLETE");

    const unavailableDb = openMemory();
    const unavailableAdapter: ConvexSnapshotAdapter = {
      readPage: async () => ({ rows: [], nextCursor: null, snapshotRevision: "remote-unavailable", expectedCount: 0, sourceDataChanged: false }),
    };
    const unavailableRouter = createSyncReconciliationRouter(unavailableDb, undefined, { adapter: unavailableAdapter });
    const unavailableAudit = await invokeRouter(unavailableRouter, "GET", "/audit", admin);
    const unavailableProposal = await invokeRouter(unavailableRouter, "POST", "/proposals", admin, {
      run_id: (unavailableAudit.body.run as { runId: string }).runId,
      action: "republish",
    });
    const unavailable = await invokeRouter(
      unavailableRouter,
      "POST",
      `/proposals/${String(unavailableProposal.body.proposal_id)}/approve`,
      admin,
      { reason: "unavailable probe" },
    );
    expect(unavailable.status).toBe(409);
    expect(unavailable.body.code).toBe("PROPOSAL_REMOTE_UNAVAILABLE");
  });

  it("revalidates live remote metadata before apply and never invokes a stale repair", async () => {
    const db = openMemory();
    const report = auditCanonicalIdentity(db, {
      convexSnapshot: { rows: [], revision: "apply-remote-r1", expectedCount: 0, pageCount: 1, complete: true },
    });
    const run = persistReconciliationAudit(db, report, { runId: "cid9-apply-remote-run" });
    const proposalId = createSyncRepairProposal(db, {
      proposalId: "cid9-apply-remote-drift",
      runId: run.runId,
      action: "republish",
      payload: { sourceId: "remote-drift" },
      evidence: { test: true },
      createdBy: "creator@example.com",
    });
    db.prepare(`UPDATE sync_repair_proposals SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE proposal_id = ?`).run("approver@example.com", proposalId);
    let applyCalls = 0;
    const drifted: ConvexSnapshotAdapter = {
      readPage: async () => ({ rows: [], nextCursor: null, snapshotRevision: "apply-remote-r1", expectedCount: 0, sourceDataChanged: false }),
      readMetadata: async () => ({ snapshotRevision: "apply-remote-r2", expectedCount: 0, initialized: true }),
    };
    await expect(applySyncRepairProposal(
      db,
      proposalId,
      "operator@example.com",
      "remote drift must block",
      () => { applyCalls += 1; },
      drifted,
    )).rejects.toMatchObject({ code: "PROPOSAL_REMOTE_STALE" });
    expect(applyCalls).toBe(0);
    expect(db.prepare(`SELECT status FROM sync_repair_proposals WHERE proposal_id = ?`).get(proposalId)).toEqual({ status: "stale" });

    const unavailableId = createSyncRepairProposal(db, {
      proposalId: "cid9-apply-remote-unavailable",
      runId: run.runId,
      action: "republish",
      payload: { sourceId: "remote-unavailable" },
      evidence: { test: true },
      createdBy: "creator@example.com",
    });
    db.prepare(`UPDATE sync_repair_proposals SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE proposal_id = ?`).run("approver@example.com", unavailableId);
    const unavailable: ConvexSnapshotAdapter = {
      readPage: async () => ({ rows: [], nextCursor: null, snapshotRevision: "apply-remote-r1", expectedCount: 0, sourceDataChanged: false }),
    };
    await expect(applySyncRepairProposal(
      db,
      unavailableId,
      "operator@example.com",
      "remote unavailable must block",
      () => { applyCalls += 1; },
      unavailable,
    )).rejects.toMatchObject({ code: "PROPOSAL_REMOTE_UNAVAILABLE" });
    expect(applyCalls).toBe(0);
    expect(db.prepare(`SELECT status FROM sync_repair_proposals WHERE proposal_id = ?`).get(unavailableId)).toEqual({ status: "approved" });
  });

  it("fails closed when a conditional approval update changes zero rows", async () => {
    const db = openMemory();
    const admin: AuthUser = { id: 1, email: "race-admin@example.com", role: "admin" };
    const adapter: ConvexSnapshotAdapter = {
      readPage: async () => ({ rows: [], nextCursor: null, snapshotRevision: "race-revision", expectedCount: 0, sourceDataChanged: false }),
      readMetadata: async () => ({ snapshotRevision: "race-revision", expectedCount: 0, initialized: true }),
    };
    const router = createSyncReconciliationRouter(db, undefined, { adapter });
    const audit = await invokeRouter(router, "GET", "/audit", admin);
    const proposal = await invokeRouter(router, "POST", "/proposals", admin, {
      run_id: (audit.body.run as { runId: string }).runId,
      action: "republish",
    });
    const proposalId = String(proposal.body.proposal_id);
    db.exec(`
      CREATE TRIGGER cid9_approval_race
      BEFORE UPDATE OF status ON sync_repair_proposals
      FOR EACH ROW WHEN OLD.proposal_id = '${proposalId}'
      BEGIN SELECT RAISE(IGNORE); END;
    `);
    const result = await invokeRouter(router, "POST", `/proposals/${proposalId}/approve`, admin, { reason: "race probe" });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("PROPOSAL_CONFLICT");
    expect(db.prepare(`SELECT status FROM sync_repair_proposals WHERE proposal_id = ?`).get(proposalId)).toEqual({ status: "proposed" });
  });

  it("requires admin dismissal reasons and records dismissal audit fields", async () => {
    const db = openMemory();
    const editor: AuthUser = { id: 2, email: "editor@example.com", role: "editor" };
    const admin: AuthUser = { id: 1, email: "dismiss-admin@example.com", role: "admin" };
    const router = createSyncReconciliationRouter(db);
    const findingId = addBlockedFinding(db, "dismiss-me", "0", 0, "dismiss-key");
    expect(() => dismissSyncFinding(db, findingId, admin.email, "  ")).toThrow(/reason is required/i);
    const editorDismiss = await invokeRouter(router, "POST", `/findings/${findingId}/dismiss`, editor, { reason: "editor attempt" });
    expect(editorDismiss.status).toBe(403);
    const dismissed = await invokeRouter(router, "POST", `/findings/${findingId}/dismiss`, admin, { reason: "confirmed out of scope" });
    expect(dismissed.status).toBe(200);
    expect(dismissed.body.status).toBe("dismissed");
    expect(db.prepare(`SELECT resolution_status, resolved_by, resolution_reason, resolved_at FROM sync_findings WHERE id = ?`).get(findingId)).toMatchObject({
      resolution_status: "dismissed",
      resolved_by: "dismiss-admin@example.com",
      resolution_reason: "confirmed out of scope",
    });
    expect((db.prepare(`SELECT resolved_at FROM sync_findings WHERE id = ?`).get(findingId) as { resolved_at: string | null }).resolved_at).toBeTruthy();
  });
});
