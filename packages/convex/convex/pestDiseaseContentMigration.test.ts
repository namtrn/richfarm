import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const migration = (internal as any).pestDiseaseContentMigration;
const FINGERPRINT = "a".repeat(64);

function setup() {
  return convexTest(schema, modules);
}

function issue(key: string, type: "pest" | "disease" = "pest") {
  return {
    key,
    type,
    name: key,
    commonNameVi: `VI ${key}`,
    scientificNames: [`${key} agent`],
    plantKeys: [],
    identification: [],
    damage: [],
    prevention: [],
    control: { physical: [], organic: [], chemical: [] },
    plantsAffected: [],
    sortOrder: 1,
  };
}

function manifest(
  key: string,
  detailContent: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    key,
    type: "pest" as const,
    locale: "en",
    name: key,
    detailContent,
    contentVersion: 1,
    contentStatus: "needs_review" as const,
    reviewStatus: "unreviewed" as const,
    contentOrigin: "authored" as const,
    bytes: Buffer.byteLength(detailContent, "utf8"),
    sha256: createHash("sha256").update(detailContent, "utf8").digest("hex"),
    sourceRefs: [],
    ...overrides,
  };
}

function localizedRow(entry: ReturnType<typeof manifest>, overrides: Record<string, unknown> = {}) {
  return {
    pestDiseaseKey: entry.key,
    locale: entry.locale,
    name: entry.name,
    detailContent: entry.detailContent,
    contentVersion: entry.contentVersion,
    contentStatus: entry.contentStatus,
    reviewStatus: entry.reviewStatus,
    contentOrigin: entry.contentOrigin,
    contentHash: entry.sha256,
    contentByteLength: entry.bytes,
    sourceRefs: entry.sourceRefs,
    ...overrides,
  };
}

async function seedCatalog(t: ReturnType<typeof setup>, revision = 1) {
  await t.run(async (ctx) => {
    await ctx.db.insert("syncCatalogMetadata", {
      key: "master",
      revision,
      initialized: true,
      expectedCounts: {
        plants: 0,
        i18n: 0,
        pestDiseaseI18n: 0,
        care: 0,
        geography: 0,
        adaptation: 0,
        propagation: 0,
        externalIdentities: 0,
        relationships: 0,
      },
      updatedAt: 1,
    });
  });
}

describe("bounded pest/disease content migration", () => {
  it("keeps dry-run pages resumable and immutable while verifying UTF-8 hash/bytes", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("pestsDiseases", issue("dry-one"));
      await ctx.db.insert("pestsDiseases", issue("dry-two"));
    });
    await seedCatalog(t);
    const before = await t.run(async (ctx) => ({
      issues: await ctx.db.query("pestsDiseases").collect(),
      metadata: await ctx.db.query("syncCatalogMetadata").collect(),
    }));

    await t.mutation(migration.startPestDiseaseContentMigration, {
      runId: "dry-pages",
      mode: "dry_run",
      limit: 1,
      proposalFingerprint: FINGERPRINT,
    });
    const firstEntry = manifest("dry-one", "## Chi tiết 🌱\n");
    const secondEntry = manifest("dry-two", "## Second\n");
    const first = await t.mutation(migration.importPestDiseaseContentPage, {
      runId: "dry-pages",
      entries: [firstEntry],
      isLastPage: false,
    });
    expect(first).toMatchObject({ status: "running", changed: 1, skipped: 0, nextCursor: "1", isDone: false });

    const second = await t.mutation(migration.importPestDiseaseContentPage, {
      runId: "dry-pages",
      cursor: first.nextCursor,
      entries: [secondEntry],
      isLastPage: true,
    });
    expect(second).toMatchObject({ status: "completed", changed: 1, skipped: 0, nextCursor: null, isDone: true });

    const state = await t.run(async (ctx) => ({
      issues: await ctx.db.query("pestsDiseases").collect(),
      localized: await ctx.db.query("pestDiseaseI18n").collect(),
      journal: await ctx.db.query("pestDiseaseContentMigrationJournal").collect(),
      run: await ctx.db.query("pestDiseaseContentMigrationRuns").withIndex("by_run_id", (q) => q.eq("runId", "dry-pages")).unique(),
      metadata: await ctx.db.query("syncCatalogMetadata").collect(),
    }));
    expect(state.issues).toEqual(before.issues);
    expect(state.localized).toHaveLength(0);
    expect(state.metadata).toEqual(before.metadata);
    expect(state.run).toMatchObject({ status: "completed", scanned: 2, changed: 2, skipped: 0, catalogRevision: 1 });
    const firstJournal = state.journal.find((row: any) => row.pestDiseaseKey === "dry-one");
    expect(firstJournal).toMatchObject({
      action: "proposal",
      status: "proposed",
      afterFields: {
        detailContent: firstEntry.detailContent,
        contentHash: firstEntry.sha256,
        contentByteLength: firstEntry.bytes,
      },
    });

    const readbacks: any[] = [];
    let readback = await t.query(migration.readbackPestDiseaseContentMigration, { runId: "dry-pages", limit: 1 });
    readbacks.push(readback);
    while (!readback.isDone) {
      readback = await t.query(migration.readbackPestDiseaseContentMigration, {
        runId: "dry-pages",
        cursor: readback.nextCursor,
        limit: 1,
      });
      readbacks.push(readback);
    }
    expect(readbacks.reduce((total, page) => total + page.checked, 0)).toBe(2);
    expect(readbacks.every((page) => page.healthy)).toBe(true);
  });

  it("records catalog, type, status, duplicate, and hash gate skips", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("pestsDiseases", issue("gate-status"));
      await ctx.db.insert("pestsDiseases", issue("gate-type"));
      await ctx.db.insert("pestsDiseases", issue("gate-duplicate"));
      await ctx.db.insert("pestsDiseases", issue("gate-duplicate"));
      await ctx.db.insert("pestsDiseases", issue("gate-reviewed"));
      await ctx.db.insert("pestsDiseases", issue("gate-hash"));
    });
    await seedCatalog(t);
    const entries = [
      manifest("missing-catalog", "missing"),
      manifest("gate-type", "wrong type", { type: "disease" }),
      manifest("gate-duplicate", "duplicate"),
      manifest("gate-status", "published without review", { contentStatus: "published" }),
      manifest("gate-reviewed", "reviewed without provenance", { reviewStatus: "reviewed" }),
      manifest("gate-hash", "bad hash", { sha256: "b".repeat(64) }),
    ];
    await t.mutation(migration.startPestDiseaseContentMigration, {
      runId: "gate-skips",
      mode: "dry_run",
      limit: entries.length,
      proposalFingerprint: FINGERPRINT,
    });
    const result = await t.mutation(migration.importPestDiseaseContentPage, {
      runId: "gate-skips",
      entries,
      isLastPage: true,
    });
    expect(result).toMatchObject({ status: "completed", changed: 0, skipped: entries.length });
    const journal = await t.run(async (ctx) => ctx.db.query("pestDiseaseContentMigrationJournal").collect());
    expect(new Set(journal.map((row: any) => row.reason))).toEqual(new Set([
      "catalog_key_unknown",
      "catalog_type_mismatch",
      "catalog_key_duplicate",
      "published_unreviewed",
      "reviewed_without_provenance",
      "content_hash_mismatch",
    ]));
    expect(journal.every((row: any) => row.status === "skipped")).toBe(true);
  });

  it("requires the exact linked proposal and applies pages resumably with readback", async () => {
    const t = setup();
    await t.run(async (ctx) => ctx.db.insert("pestsDiseases", issue("apply-me")));
    await seedCatalog(t);
    const entry = manifest("apply-me", "# Apply me\n");
    await t.mutation(migration.startPestDiseaseContentMigration, {
      runId: "apply-proposal",
      mode: "dry_run",
      limit: 1,
      proposalFingerprint: FINGERPRINT,
    });
    await t.mutation(migration.importPestDiseaseContentPage, {
      runId: "apply-proposal",
      entries: [entry],
      isLastPage: true,
    });
    await expect(t.mutation(migration.startPestDiseaseContentMigration, {
      runId: "apply-no-confirmation",
      mode: "apply",
      parentRunId: "apply-proposal",
      proposalFingerprint: FINGERPRINT,
    })).rejects.toThrow(/confirmation/i);
    await expect(t.mutation(migration.startPestDiseaseContentMigration, {
      runId: "apply-wrong-proposal",
      mode: "apply",
      parentRunId: "apply-proposal",
      proposalFingerprint: "b".repeat(64),
      confirmation: "APPLY_PEST_DISEASE_CONTENT",
    })).rejects.toThrow(/proposal|fingerprint/i);

    const apply = await t.mutation(migration.startPestDiseaseContentMigration, {
      runId: "apply-linked",
      mode: "apply",
      limit: 1,
      parentRunId: "apply-proposal",
      proposalFingerprint: FINGERPRINT,
      confirmation: "APPLY_PEST_DISEASE_CONTENT",
    });
    expect(apply).toMatchObject({ mode: "apply", parentRunId: "apply-proposal", catalogRevision: 1 });
    const applied = await t.mutation(migration.importPestDiseaseContentPage, { runId: "apply-linked" });
    expect(applied).toMatchObject({ status: "completed", scanned: 1, changed: 1, isDone: true });
    const state = await t.run(async (ctx) => ({
      row: await ctx.db.query("pestDiseaseI18n").withIndex("by_key_locale", (q) => q.eq("pestDiseaseKey", "apply-me").eq("locale", "en")).unique(),
      run: await ctx.db.query("pestDiseaseContentMigrationRuns").withIndex("by_run_id", (q) => q.eq("runId", "apply-linked")).unique(),
      metadata: await ctx.db.query("syncCatalogMetadata").withIndex("by_key", (q) => q.eq("key", "master")).unique(),
    }));
    expect(state.row).toMatchObject({
      pestDiseaseKey: "apply-me",
      locale: "en",
      detailContent: entry.detailContent,
      contentHash: entry.sha256,
      contentByteLength: entry.bytes,
    });
    expect(state.run).toMatchObject({ status: "completed", catalogRevision: 2 });
    expect(state.metadata).toMatchObject({ revision: 2, expectedCounts: { i18n: 0, pestDiseaseI18n: 1 } });
    const readback = await t.query(migration.readbackPestDiseaseContentMigration, { runId: "apply-linked" });
    expect(readback).toMatchObject({ checked: 1, healthy: true, isDone: true });
  });

  it("restores only owned fields and archives new rows without deleting them", async () => {
    const t = setup();
    const oldContent = "# Old content\n";
    const newContent = "# Reviewed replacement\n";
    await t.run(async (ctx) => {
      await ctx.db.insert("pestsDiseases", issue("replace-me"));
      await ctx.db.insert("pestsDiseases", issue("archive-me"));
      await ctx.db.insert("pestDiseaseI18n", localizedRow(manifest("replace-me", oldContent), {
        reviewedAt: 42,
        reviewedBy: "unrelated-owner",
      }));
    });
    await seedCatalog(t);
    const replacement = manifest("replace-me", newContent, {
      contentVersion: 2,
      contentStatus: "published",
      reviewStatus: "reviewed",
      sourceRefs: [{ sourceSystem: "git", sourceName: "manifest", sourceLocator: "replace-me/en" }],
      conflictResolution: {
        resolution: "replace_database",
        reviewedBy: "admin",
        reviewedAt: "2026-08-25T00:00:00.000Z",
        reason: "Reviewed Git-authoritative correction",
      },
    });
    const created = manifest("archive-me", "# New row\n");
    await t.mutation(migration.startPestDiseaseContentMigration, {
      runId: "rollback-proposal",
      mode: "dry_run",
      limit: 2,
      proposalFingerprint: FINGERPRINT,
    });
    await t.mutation(migration.importPestDiseaseContentPage, {
      runId: "rollback-proposal",
      entries: [replacement, created],
      isLastPage: true,
    });
    await t.mutation(migration.startPestDiseaseContentMigration, {
      runId: "rollback-apply",
      mode: "apply",
      limit: 2,
      parentRunId: "rollback-proposal",
      proposalFingerprint: FINGERPRINT,
      confirmation: "APPLY_PEST_DISEASE_CONTENT",
    });
    await t.mutation(migration.importPestDiseaseContentPage, { runId: "rollback-apply" });
    await t.mutation(migration.startPestDiseaseContentMigration, {
      runId: "rollback-run",
      mode: "rollback",
      limit: 2,
      parentRunId: "rollback-apply",
      proposalFingerprint: FINGERPRINT,
      confirmation: "ROLLBACK_PEST_DISEASE_CONTENT",
    });
    const rollback = await t.mutation(migration.rollbackPestDiseaseContentPage, { runId: "rollback-run" });
    expect(rollback).toMatchObject({ status: "completed", changed: 2, isDone: true });

    const state = await t.run(async (ctx) => ({
      rows: await ctx.db.query("pestDiseaseI18n").collect(),
      journal: await ctx.db.query("pestDiseaseContentMigrationJournal").collect(),
    }));
    expect(state.rows).toHaveLength(2);
    expect(state.rows.find((row: any) => row.pestDiseaseKey === "replace-me")).toMatchObject({
      detailContent: oldContent,
      contentVersion: 1,
      reviewedAt: 42,
      reviewedBy: "unrelated-owner",
    });
    expect(state.rows.find((row: any) => row.pestDiseaseKey === "archive-me")).toMatchObject({
      detailContent: created.detailContent,
      contentHash: created.sha256,
      contentByteLength: created.bytes,
      contentStatus: "archived",
      reviewStatus: "unreviewed",
    });
    expect(state.journal.filter((row: any) => row.runId === "rollback-run").every((row: any) => row.status === "rolled_back")).toBe(true);
    const readback = await t.query(migration.readbackPestDiseaseContentMigration, { runId: "rollback-run" });
    expect(readback).toMatchObject({ checked: 2, healthy: true, isDone: true });
  });

  it("refuses an apply when the catalog revision changed after dry-run", async () => {
    const t = setup();
    await t.run(async (ctx) => ctx.db.insert("pestsDiseases", issue("stale-proposal")));
    await seedCatalog(t);
    await t.mutation(migration.startPestDiseaseContentMigration, {
      runId: "stale-proposal",
      mode: "dry_run",
      proposalFingerprint: FINGERPRINT,
    });
    await t.mutation(migration.importPestDiseaseContentPage, {
      runId: "stale-proposal",
      entries: [manifest("stale-proposal", "# Stale\n")],
      isLastPage: true,
    });
    await t.run(async (ctx) => {
      const metadata = await ctx.db.query("syncCatalogMetadata").withIndex("by_key", (q) => q.eq("key", "master")).unique();
      if (!metadata) throw new Error("test catalog metadata missing");
      await ctx.db.patch(metadata._id, { revision: metadata.revision + 1, updatedAt: metadata.updatedAt + 1 });
    });
    await expect(t.mutation(migration.startPestDiseaseContentMigration, {
      runId: "stale-apply",
      mode: "apply",
      parentRunId: "stale-proposal",
      proposalFingerprint: FINGERPRINT,
      confirmation: "APPLY_PEST_DISEASE_CONTENT",
    })).rejects.toThrow(/catalog|revision|changed/i);
    const localized = await t.run(async (ctx) => ctx.db.query("pestDiseaseI18n").collect());
    expect(localized).toHaveLength(0);
  });

  it("keeps the migration source free of delete operations", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./pestDiseaseContentMigration.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/db\.(delete|replace)\(/);
    expect(source).toContain('contentStatus: "archived"');
  });
});
