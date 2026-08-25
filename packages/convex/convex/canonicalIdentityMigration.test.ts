import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const migration = (internal as any).canonicalIdentityMigration;
const canonicalUpsert = (internal as any).lib.canonicalPlantUpsert.upsertCanonicalPlantInternal;

function setup() {
  return convexTest(schema, modules);
}

async function insertLegacy(
  t: ReturnType<typeof setup>,
  scientificName: string,
  fields: Record<string, unknown> = {},
) {
  return await t.run(async (ctx) => ctx.db.insert("plantsMaster", {
    scientificName,
    group: "test",
    purposes: ["food"],
    ...fields,
  } as any));
}

async function drainForward(t: ReturnType<typeof setup>, runId: string) {
  const pages: any[] = [];
  let page = await t.mutation(migration.backfillCanonicalIdentityPage, { runId });
  pages.push(page);
  while (!page.isDone) {
    page = await t.mutation(migration.backfillCanonicalIdentityPage, { runId });
    pages.push(page);
  }
  return pages;
}

describe("bounded canonical identity migration", () => {
  it("walks multiple pages without repeats and leaves dry-run data unchanged", async () => {
    const t = setup();
    const ids = await Promise.all([
      insertLegacy(t, "Ocimum basilicum", { genus: "Ocimum", species: "basilicum" }),
      insertLegacy(t, "Mentha spicata", { genus: "Mentha", species: "spicata" }),
      insertLegacy(t, "Solanum lycopersicum", { genus: "Solanum", species: "lycopersicum" }),
    ]);
    await t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "dry-pages",
      mode: "dry_run",
      limit: 1,
    });

    const pages = await drainForward(t, "dry-pages");
    expect(pages).toHaveLength(3);
    expect(pages.every((page) => page.scanned === 1 && page.changed === 1)).toBe(true);
    expect(pages[pages.length - 1]).toMatchObject({ isDone: true });

    const state = await t.run(async (ctx) => ({
      rows: await Promise.all(ids.map((id) => ctx.db.get(id))),
      journal: await ctx.db.query("canonicalIdentityMigrationJournal").collect(),
      run: await ctx.db.query("canonicalIdentityMigrationRuns").withIndex("by_run_id", (q) => q.eq("runId", "dry-pages")).unique(),
    }));
    expect(state.rows.every((row: any) => !row?.canonicalKey)).toBe(true);
    expect(state.journal).toHaveLength(3);
    expect(new Set(state.journal.map((row: any) => String(row.plantId))).size).toBe(3);
    expect(state.run).toMatchObject({ status: "completed", scanned: 3, changed: 3 });

    const readbacks: any[] = [];
    let readback = await t.query(migration.readbackCanonicalIdentityMigration, { runId: "dry-pages" });
    readbacks.push(readback);
    while (!readback.isDone) {
      readback = await t.query(migration.readbackCanonicalIdentityMigration, {
        runId: "dry-pages",
        cursor: readback.nextCursor,
      });
      readbacks.push(readback);
    }
    expect(readbacks.reduce((total, page) => total + page.checked, 0)).toBe(3);
    expect(readbacks.every((page) => page.healthy)).toBe(true);
    expect(readbacks[readbacks.length - 1].isDone).toBe(true);
  });

  it("supports resumable apply, journals before/after fields, and verifies readback", async () => {
    const t = setup();
    const plantId = await insertLegacy(t, "Ocimum gratissimum", {
      genus: "Ocimum",
      species: "gratissimum",
      family: "Lamiaceae",
      recordVersion: 7,
    });
    await expect(t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "apply-unlinked",
      mode: "apply",
      limit: 1,
      confirmation: "APPLY_CANONICAL_IDENTITY",
    })).rejects.toThrow(/dry-run|proposal/i);
    await t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "proposal-pages",
      mode: "dry_run",
      limit: 1,
    });
    await drainForward(t, "proposal-pages");
    await expect(t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "apply-no-confirm",
      mode: "apply",
      limit: 1,
      parentRunId: "proposal-pages",
    })).rejects.toThrow(/confirmation/i);
    await t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "apply-pages",
      mode: "apply",
      limit: 1,
      parentRunId: "proposal-pages",
      confirmation: "APPLY_CANONICAL_IDENTITY",
    });
    const first = await t.mutation(migration.backfillCanonicalIdentityPage, { runId: "apply-pages" });
    expect(first).toMatchObject({ isDone: true, changed: 1 });
    const row = await t.run(async (ctx) => ctx.db.get(plantId));
    expect(row).toMatchObject({
      canonicalIdentityVersion: "canonical_identity_v1",
      identityScope: "base",
      recordVersion: 7,
      family: "Lamiaceae",
    });

    const journal = await t.run(async (ctx) => ctx.db.query("canonicalIdentityMigrationJournal").collect());
    const applyJournal = journal.find((row: any) => row.runId === "apply-pages");
    expect(applyJournal).toMatchObject({
      runId: "apply-pages",
      action: "apply",
      status: "applied",
      beforeRevision: 7,
      afterRevision: 7,
      beforeFields: expect.objectContaining({ genus: "Ocimum", species: "gratissimum" }),
      afterFields: expect.objectContaining({
        genus: "ocimum",
        species: "gratissimum",
        canonicalKey: expect.any(String),
      }),
    });
    const readback = await t.query(migration.readbackCanonicalIdentityMigration, { runId: "apply-pages" });
    expect(readback).toMatchObject({ healthy: true, checked: 1, isDone: true });
  });

  it("records duplicate, manual-review, and missing-parent skips without mutation", async () => {
    const t = setup();
    const duplicateFields = { genus: "Coriandrum", species: "sativum" };
    const duplicateA = await insertLegacy(t, "Coriandrum sativum", duplicateFields);
    const duplicateB = await insertLegacy(t, "Coriandrum sativum", duplicateFields);
    const manual = await insertLegacy(t, "Tomato");
    const missingParent = await insertLegacy(t, "Capsicum annuum", {
      genus: "Capsicum",
      species: "annuum",
      cultivar: "Jalapeño",
    });
    await t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "skip-reasons",
      mode: "dry_run",
      limit: 20,
    });
    await drainForward(t, "skip-reasons");

    const journal = await t.run(async (ctx) => ctx.db.query("canonicalIdentityMigrationJournal").collect());
    expect(journal.map((row: any) => row.reason)).toEqual(expect.arrayContaining([
      "legacy_duplicate",
      "manual_review_required",
      "missing_parent",
    ]));
    const rows = await t.run(async (ctx) => Promise.all([
      ctx.db.get(duplicateA),
      ctx.db.get(duplicateB),
      ctx.db.get(manual),
      ctx.db.get(missingParent),
    ]));
    expect(rows.every((row: any) => !row?.canonicalKey)).toBe(true);
  });

  it("refuses rollback after a source revision change and restores only owned fields otherwise", async () => {
    const t = setup();
    const plantId = await insertLegacy(t, "Salvia officinalis", {
      genus: "Salvia",
      species: "officinalis",
      family: "Lamiaceae",
      recordVersion: 1,
    });
    await t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "proposal-rollback",
      mode: "dry_run",
      limit: 1,
    });
    await drainForward(t, "proposal-rollback");
    await t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "apply-for-rollback",
      parentRunId: "proposal-rollback",
      mode: "apply",
      limit: 1,
      confirmation: "APPLY_CANONICAL_IDENTITY",
    });
    await drainForward(t, "apply-for-rollback");
    await t.run(async (ctx) => ctx.db.patch(plantId, { family: "Updated family" }));

    await t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "rollback-ok",
      mode: "rollback",
      parentRunId: "apply-for-rollback",
      limit: 1,
      confirmation: "ROLLBACK_CANONICAL_IDENTITY",
    });
    await drainRollback(t, "rollback-ok");
    const restored = await t.run(async (ctx) => ctx.db.get(plantId));
    expect(restored).toMatchObject({ family: "Updated family", recordVersion: 1 });
    expect(restored?.canonicalKey).toBeUndefined();

    const staleId = await insertLegacy(t, "Thymus vulgaris", {
      genus: "Thymus",
      species: "vulgaris",
      recordVersion: 1,
    });
    await t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "proposal-stale",
      mode: "dry_run",
      limit: 1,
    });
    await drainForward(t, "proposal-stale");
    await t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "apply-stale",
      parentRunId: "proposal-stale",
      mode: "apply",
      limit: 1,
      confirmation: "APPLY_CANONICAL_IDENTITY",
    });
    await drainForward(t, "apply-stale");
    await t.run(async (ctx) => ctx.db.patch(staleId, { recordVersion: 2, family: "Concurrent change" }));
    await t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "rollback-stale",
      mode: "rollback",
      parentRunId: "apply-stale",
      limit: 1,
      confirmation: "ROLLBACK_CANONICAL_IDENTITY",
    });
    await drainRollback(t, "rollback-stale");
    const stale = await t.run(async (ctx) => ctx.db.get(staleId));
    expect(stale).toMatchObject({ recordVersion: 2, family: "Concurrent change" });
    expect(stale?.canonicalKey).toEqual(expect.any(String));
    const staleJournal = await t.run(async (ctx) => ctx.db.query("canonicalIdentityMigrationJournal").collect());
    expect(staleJournal.some((row: any) => row.runId === "rollback-stale" && row.reason === "source_revision_changed")).toBe(true);
  });

  it("keeps the migration source free of merge/delete operations", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./canonicalIdentityMigration.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/db\.(delete|replace)\(/);
    expect(source).not.toMatch(/db\.insert\(["']plantsMaster["']/);
    expect(source).toContain("canonicalIdentityFieldPatch");
  });

  it("quiesces canonical writers for planned apply runs", async () => {
    const t = setup();
    await t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "writer-proposal",
      mode: "dry_run",
      limit: 1,
    });
    await drainForward(t, "writer-proposal");
    await t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "writer-guard",
      mode: "apply",
      limit: 1,
      parentRunId: "writer-proposal",
      confirmation: "APPLY_CANONICAL_IDENTITY",
    });
    await expect(t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "writer-conflict",
      mode: "dry_run",
      limit: 1,
    })).rejects.toThrow(/active|singleton|conflict/i);
    await expect(t.mutation(canonicalUpsert, {
      identity: {
        genus: "Ocimum",
        species: "basilicum",
        rank: null,
        infraspecificName: null,
        cultivar: null,
        scope: "base",
        parentCanonicalKey: null,
        parentMasterPlantId: null,
      },
      plant: {
        scientificName: "Ocimum basilicum",
        genus: "Ocimum",
        species: "basilicum",
        group: "herbs",
        purposes: ["food"],
      },
    })).rejects.toThrow(/CANONICAL_MIGRATION_ACTIVE|quiesced/i);
    await t.mutation(migration.backfillCanonicalIdentityPage, { runId: "writer-guard" });
    await expect(t.mutation(canonicalUpsert, {
      identity: {
        genus: "Ocimum",
        species: "basilicum",
        rank: null,
        infraspecificName: null,
        cultivar: null,
        scope: "base",
        parentCanonicalKey: null,
        parentMasterPlantId: null,
      },
      plant: {
        scientificName: "Ocimum basilicum",
        genus: "Ocimum",
        species: "basilicum",
        group: "herbs",
        purposes: ["food"],
      },
    })).resolves.toMatchObject({ action: "created" });
  });

  it("does not let two earlier dry-runs hide an active apply from either guard", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const now = Date.now();
      for (const [runId, mode] of [
        ["dry-run-before-a", "dry_run"],
        ["dry-run-before-b", "dry_run"],
        ["blocking-apply", "apply"],
      ] as const) {
        await ctx.db.insert("canonicalIdentityMigrationRuns", {
          runId,
          mode,
          status: "planned",
          limit: 1,
          scanned: 0,
          changed: 0,
          skipped: 0,
          snapshotCapturedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    const identity = {
      genus: "Ocimum",
      species: "basilicum",
      rank: null,
      infraspecificName: null,
      cultivar: null,
      scope: "base" as const,
      parentCanonicalKey: null,
      parentMasterPlantId: null,
    };
    await expect(t.mutation(canonicalUpsert, {
      identity,
      plant: {
        scientificName: "Ocimum basilicum",
        genus: "Ocimum",
        species: "basilicum",
        group: "herbs",
        purposes: ["food"],
      },
    })).rejects.toThrow(/CANONICAL_MIGRATION_ACTIVE|quiesced/i);
    await expect(t.mutation(migration.startCanonicalIdentityMigration, {
      runId: "after-blocker",
      mode: "dry_run",
      limit: 1,
    })).rejects.toThrow(/active|singleton|conflict/i);
  });
});

async function drainRollback(t: ReturnType<typeof setup>, runId: string) {
  const pages: any[] = [];
  let page = await t.mutation(migration.rollbackCanonicalIdentityPage, { runId });
  pages.push(page);
  while (!page.isDone) {
    page = await t.mutation(migration.rollbackCanonicalIdentityPage, { runId });
    pages.push(page);
  }
  return pages;
}
