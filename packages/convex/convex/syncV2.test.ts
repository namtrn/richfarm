/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { deleteAppUserData } from './lib/deleteUserData';

const modules = import.meta.glob('./**/*.ts');
const identity = { subject: 'sync-v2-user', tokenIdentifier: 'test:sync-v2-user' };
function setup() { return convexTest(schema, modules); }

describe('Phase 1.5 sync v2', () => {
  let t: ReturnType<typeof setup>;

  beforeEach(async () => {
    t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert('users', {
        tokenIdentifier: identity.tokenIdentifier,
        isActive: true,
        subscription: { tier: 'premium', source: 'revenuecat' },
      });
    });
  });

  async function session() {
    const user = t.withIdentity(identity);
    const current = await user.mutation(api.syncV2.ensureSession, {});
    if (!current) throw new Error('missing sync session');
    return { user, ...current };
  }

  it('applies hierarchy operations in logical-id order and returns the same receipt', async () => {
    const { user, generation } = await session();
    const garden = {
      operationId: 'op-garden-create', syncGeneration: generation,
      entityType: 'garden' as const, entityUuid: 'garden-1', type: 'create' as const,
      payload: { name: 'Home', locationType: 'outdoor' },
    };
    expect((await user.mutation(api.syncV2.applyOperation, garden)).status).toBe('applied');
    expect((await user.mutation(api.syncV2.applyOperation, garden)).status).toBe('already_applied');
    expect((await user.mutation(api.syncV2.applyOperation, {
      ...garden, payload: { name: 'Changed', locationType: 'outdoor' },
    })).status).toBe('operation_conflict');

    expect((await user.mutation(api.syncV2.applyOperation, {
      operationId: 'op-bed-create', syncGeneration: generation,
      entityType: 'bed', entityUuid: 'bed-1', type: 'create',
      parentRefs: { gardenUuid: 'garden-1' },
      payload: { name: 'Bed', locationType: 'outdoor' },
    })).status).toBe('applied');
    expect((await user.mutation(api.syncV2.applyOperation, {
      operationId: 'op-plant-create', syncGeneration: generation,
      entityType: 'plant', entityUuid: 'plant-1', type: 'create',
      parentRefs: { gardenUuid: 'garden-1', bedUuid: 'bed-1' }, payload: { status: 'growing' },
    })).status).toBe('applied');
  });

  it('never turns a missing update into an insert and enforces revision', async () => {
    const { user, generation } = await session();
    expect((await user.mutation(api.syncV2.applyOperation, {
      operationId: 'missing-update', syncGeneration: generation,
      entityType: 'garden', entityUuid: 'missing', type: 'update', baseRevision: 1,
      payload: { name: 'Nope' },
    })).status).toBe('missing_target');
    await user.mutation(api.syncV2.applyOperation, {
      operationId: 'create-garden', syncGeneration: generation,
      entityType: 'garden', entityUuid: 'garden', type: 'create',
      payload: { name: 'Garden', locationType: 'outdoor' },
    });
    expect((await user.mutation(api.syncV2.applyOperation, {
      operationId: 'stale-update', syncGeneration: generation,
      entityType: 'garden', entityUuid: 'garden', type: 'update', baseRevision: 9,
      payload: { name: 'Nope' },
    })).status).toBe('revision_conflict');
  });

  it('garden deletion tombstones beds, unassigns plants, and defeats stale writes', async () => {
    const { user, generation, userId } = await session();
    const ownerId = userId as Id<'users'>;
    const apply = (args: any) => user.mutation(api.syncV2.applyOperation, { syncGeneration: generation, ...args });
    await apply({ operationId: 'g1', entityType: 'garden', entityUuid: 'g', type: 'create', payload: { name: 'G', locationType: 'outdoor' } });
    await apply({ operationId: 'b1', entityType: 'bed', entityUuid: 'b', type: 'create', parentRefs: { gardenUuid: 'g' }, payload: { name: 'B', locationType: 'outdoor' } });
    await apply({ operationId: 'p1', entityType: 'plant', entityUuid: 'p', type: 'create', parentRefs: { gardenUuid: 'g', bedUuid: 'b' }, payload: { status: 'growing' } });
    expect((await apply({ operationId: 'gd', entityType: 'garden', entityUuid: 'g', type: 'delete', baseRevision: 1 })).status).toBe('applied');
    expect((await apply({ operationId: 'stale-bed', entityType: 'bed', entityUuid: 'b', type: 'update', baseRevision: 1, payload: { name: 'Restored' } })).status).toBe('discarded_deleted');
    const state = await t.run(async (ctx) => ({
      plant: await ctx.db.query('userPlants').withIndex('by_user_entity_uuid', (q) => q.eq('userId', ownerId).eq('entityUuid', 'p')).unique(),
      bedTombstone: await ctx.db.query('entityTombstones').withIndex('by_user_entity', (q) => q.eq('userId', ownerId).eq('entityType', 'bed').eq('entityUuid', 'b')).unique(),
    }));
    expect(state.plant?.gardenId).toBeUndefined();
    expect(state.plant?.bedId).toBeUndefined();
    expect(state.bedTombstone).not.toBeNull();
  });

  it('rejects the wrong generation', async () => {
    const { user } = await session();
    const result = await user.mutation(api.syncV2.applyOperation, {
      operationId: 'wrong-generation', syncGeneration: 'wrong',
      entityType: 'garden', entityUuid: 'g', type: 'create',
      payload: { name: 'G', locationType: 'outdoor' },
    });
    expect(result.status).toBe('wrong_generation');
  });

  it('backfills legacy identity and revision idempotently', async () => {
    const legacyId = await t.run(async (ctx) => {
      const owner = (await ctx.db.query('users').first())!;
      return await ctx.db.insert('gardens', {
        userId: owner._id, name: 'Legacy', locationType: 'outdoor',
      });
    });
    const before = await t.query(internal.syncMigration.dryRun, { sampleLimit: 50 });
    expect(before.report.garden.missingUuid).toBe(1);
    const first = await t.mutation(internal.syncMigration.backfillPage, {
      domain: 'garden', paginationOpts: { numItems: 50, cursor: null },
    });
    expect(first.changed).toBe(1);
    const second = await t.mutation(internal.syncMigration.backfillPage, {
      domain: 'garden', paginationOpts: { numItems: 50, cursor: null },
    });
    expect(second.changed).toBe(0);
    const row = await t.run(async (ctx) => await ctx.db.get(legacyId));
    expect(row?.entityUuid).toBe(`legacy:${legacyId}`);
    expect(row?.revision).toBe(1);
  });

  it('reports ownership and parent inconsistencies page by page before migration', async () => {
    await t.run(async (ctx) => {
      const owner = (await ctx.db.query('users').first())!;
      const otherUserId = await ctx.db.insert('users', { tokenIdentifier: 'other:migration', isActive: true });
      const foreignGardenId = await ctx.db.insert('gardens', {
        userId: otherUserId, entityUuid: 'foreign-garden', revision: 1, name: 'Foreign', locationType: 'outdoor',
      });
      await ctx.db.insert('beds', {
        userId: owner._id, entityUuid: 'bad-bed', revision: 1,
        gardenId: foreignGardenId, name: 'Broken ownership', locationType: 'outdoor',
      });
    });
    const audit = await t.query(internal.syncMigration.auditPage, {
      domain: 'bed', paginationOpts: { numItems: 50, cursor: null },
    });
    expect(audit.issueRows).toContainEqual(expect.objectContaining({
      issues: expect.arrayContaining(['garden_ownership_mismatch']),
      backfillable: false,
    }));
  });

  it('does not backfill a row whose parent requires manual review', async () => {
    let bedId!: Id<'beds'>;
    await t.run(async (ctx) => {
      const owner = (await ctx.db.query('users').first())!;
      const gardenId = await ctx.db.insert('gardens', {
        userId: owner._id, name: 'Deleted parent', locationType: 'outdoor',
      });
      bedId = await ctx.db.insert('beds', {
        userId: owner._id, gardenId, name: 'Orphan', locationType: 'outdoor',
      });
      await ctx.db.delete(gardenId);
    });
    const audit = await t.query(internal.syncMigration.auditPage, {
      domain: 'bed', paginationOpts: { numItems: 50, cursor: null },
    });
    expect(audit.issueRows).toContainEqual(expect.objectContaining({
      backfillable: false,
      issues: expect.arrayContaining(['garden_missing']),
    }));
    const backfill = await t.mutation(internal.syncMigration.backfillPage, {
      domain: 'bed', paginationOpts: { numItems: 50, cursor: null },
    });
    expect(backfill.changed).toBe(0);
    expect(backfill.skipped).toBeGreaterThanOrEqual(1);
    expect(backfill.manualReviewRows).toContainEqual(expect.objectContaining({
      id: String(bedId), issues: ['garden_missing'],
    }));
    const row = await t.run(async (ctx) => await ctx.db.get(bedId!));
    expect(row?.entityUuid).toBeUndefined();
    expect(row?.revision).toBeUndefined();
  });

  it('applies preference patches with revision, generation, and receipts', async () => {
    const { user, userId } = await session();
    const request = {
      operationId: 'pref-op-1', baseRevision: 0,
      generation: `preferences:${userId}`,
      patch: { theme: 'dark', showWeatherCard: false },
    };
    expect(await user.mutation(api.userSettings.applyPreferencesPatch, request))
      .toEqual({ status: 'applied', revision: 1 });
    expect(await user.mutation(api.userSettings.applyPreferencesPatch, request))
      .toEqual({ status: 'already_applied', revision: 1 });
    expect((await user.mutation(api.userSettings.applyPreferencesPatch, {
      ...request, patch: { theme: 'light' },
    })).status).toBe('operation_conflict');
    expect((await user.mutation(api.userSettings.applyPreferencesPatch, {
      operationId: 'pref-stale', baseRevision: 0,
      generation: `preferences:${userId}`, patch: { unitSystem: 'imperial' },
    })).status).toBe('revision_conflict');
  });

  it('commits a photo once and a photo tombstone defeats stale recreation', async () => {
    const { user, generation } = await session();
    await user.mutation(api.syncV2.applyOperation, {
      operationId: 'photo-plant', syncGeneration: generation,
      entityType: 'plant', entityUuid: 'photo-plant', type: 'create',
      payload: { status: 'growing' },
    });
    const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(['image'])));
    const create = {
      operationId: 'photo-create', syncGeneration: generation,
      entityType: 'photo' as const, entityUuid: 'photo-1', type: 'create' as const,
      parentRefs: { plantUuid: 'photo-plant' },
      payload: { storageId: String(storageId), takenAt: 1, source: 'camera' },
    };
    expect((await user.mutation(api.syncV2.applyOperation, create)).status).toBe('applied');
    expect((await user.mutation(api.syncV2.applyOperation, create)).status).toBe('already_applied');
    expect((await user.mutation(api.syncV2.applyOperation, {
      operationId: 'photo-delete', syncGeneration: generation,
      entityType: 'photo', entityUuid: 'photo-1', type: 'delete', baseRevision: 1,
    })).status).toBe('applied');
    expect((await user.mutation(api.syncV2.applyOperation, {
      ...create, operationId: 'photo-stale-create',
    })).status).toBe('discarded_deleted');
  });

  it('tracks uploaded blobs and cleans only uncommitted orphan Photos', async () => {
    const { user, generation } = await session();
    const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(['orphan'])));
    await user.mutation(api.storage.registerSyncUpload, {
      operationId: 'orphan-operation', entityUuid: 'orphan-photo', storageId,
    });
    await t.run(async (ctx) => {
      const reservation = await ctx.db.query('syncUploadReservations').first();
      if (reservation) await ctx.db.patch(reservation._id, { createdAt: 1 });
    });
    const cleanup = await t.mutation(internal.storage.cleanupOrphanSyncUploads, {
      maxAgeMs: 0, limit: 10,
    });
    expect(cleanup).toMatchObject({ inspected: 1, deleted: 1, retained: 0 });
    expect(await t.run(async (ctx) => await ctx.storage.getUrl(storageId))).toBeNull();

    await user.mutation(api.syncV2.applyOperation, {
      operationId: 'reserved-plant', syncGeneration: generation,
      entityType: 'plant', entityUuid: 'reserved-plant', type: 'create', payload: { status: 'growing' },
    });
    const committedStorageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(['committed'])));
    await user.mutation(api.storage.registerSyncUpload, {
      operationId: 'committed-photo-op', entityUuid: 'committed-photo', storageId: committedStorageId,
    });
    await user.mutation(api.syncV2.applyOperation, {
      operationId: 'committed-photo-op', syncGeneration: generation,
      entityType: 'photo', entityUuid: 'committed-photo', type: 'create',
      parentRefs: { plantUuid: 'reserved-plant' }, payload: { storageId: String(committedStorageId) },
    });
    await t.run(async (ctx) => {
      const reservation = await ctx.db.query('syncUploadReservations').first();
      if (reservation) await ctx.db.patch(reservation._id, { createdAt: 1 });
    });
    const committedCleanup = await t.mutation(internal.storage.cleanupOrphanSyncUploads, {
      maxAgeMs: 0, limit: 10,
    });
    expect(committedCleanup).toMatchObject({ inspected: 1, deleted: 0, retained: 1 });
    expect(await t.run(async (ctx) => await ctx.storage.getUrl(committedStorageId))).toBeTruthy();
  });

  it('makes Activity and Harvest tombstones defeat stale create and update delivery', async () => {
    const { user, generation } = await session();
    const apply = (args: any) => user.mutation(api.syncV2.applyOperation, { syncGeneration: generation, ...args });
    await apply({ operationId: 'child-plant', entityType: 'plant', entityUuid: 'child-plant', type: 'create', payload: { status: 'growing' } });
    for (const entityType of ['activity', 'harvest'] as const) {
      const entityUuid = `${entityType}-tombstone`;
      const payload = entityType === 'activity' ? { type: 'note', note: 'original' } : { quantity: 1, unit: 'kg' };
      expect((await apply({
        operationId: `${entityType}-create`, entityType, entityUuid, type: 'create',
        parentRefs: { plantUuid: 'child-plant' }, payload,
      })).status).toBe('applied');
      expect((await apply({
        operationId: `${entityType}-delete`, entityType, entityUuid, type: 'delete', baseRevision: 1,
      })).status).toBe('applied');
      expect((await apply({
        operationId: `${entityType}-stale-create`, entityType, entityUuid, type: 'create',
        parentRefs: { plantUuid: 'child-plant' }, payload,
      })).status).toBe('discarded_deleted');
      expect((await apply({
        operationId: `${entityType}-stale-update`, entityType, entityUuid, type: 'update', baseRevision: 1,
        payload,
      })).status).toBe('discarded_deleted');
    }
  });

  it('keeps the final Plant Garden and Bed relationship valid', async () => {
    const { user, generation, userId } = await session();
    const apply = (args: any) => user.mutation(api.syncV2.applyOperation, { syncGeneration: generation, ...args });
    await apply({ operationId: 'ga', entityType: 'garden', entityUuid: 'ga', type: 'create', payload: { name: 'A', locationType: 'outdoor' } });
    await apply({ operationId: 'gb', entityType: 'garden', entityUuid: 'gb', type: 'create', payload: { name: 'B', locationType: 'outdoor' } });
    await apply({ operationId: 'ba', entityType: 'bed', entityUuid: 'ba', type: 'create', parentRefs: { gardenUuid: 'ga' }, payload: { name: 'Bed A', locationType: 'outdoor' } });
    await apply({ operationId: 'pb', entityType: 'plant', entityUuid: 'plant', type: 'create', parentRefs: { gardenUuid: 'ga', bedUuid: 'ba' }, payload: { status: 'growing' } });

    expect((await apply({
      operationId: 'garden-only', entityType: 'plant', entityUuid: 'plant', type: 'update', baseRevision: 1,
      parentRefs: { gardenUuid: 'gb' }, payload: {},
    })).status).toBe('applied');
    const ownerId = userId as Id<'users'>;
    let plant = await t.run(async (ctx) => await ctx.db.query('userPlants')
      .withIndex('by_user_entity_uuid', (q) => q.eq('userId', ownerId).eq('entityUuid', 'plant')).unique());
    expect(plant?.gardenId).toBeDefined();
    expect(plant?.bedId).toBeUndefined();

    expect((await apply({
      operationId: 'invalid-pair', entityType: 'plant', entityUuid: 'plant', type: 'update', baseRevision: 2,
      parentRefs: { gardenUuid: 'gb', bedUuid: 'ba' }, payload: {},
    }))).toMatchObject({ status: 'invalid_parent', reason: 'garden_bed_mismatch' });

    expect((await apply({
      operationId: 'unassign', entityType: 'plant', entityUuid: 'plant', type: 'update', baseRevision: 2,
      parentRefs: { gardenUuid: null, bedUuid: null }, payload: {},
    })).status).toBe('applied');
    plant = await t.run(async (ctx) => await ctx.db.query('userPlants')
      .withIndex('by_user_entity_uuid', (q) => q.eq('userId', ownerId).eq('entityUuid', 'plant')).unique());
    expect(plant?.gardenId).toBeUndefined();
    expect(plant?.bedId).toBeUndefined();
  });

  it('rejects moving a non-empty Bed and reserves lifecycle Activity types', async () => {
    const { user, generation } = await session();
    const apply = (args: any) => user.mutation(api.syncV2.applyOperation, { syncGeneration: generation, ...args });
    await apply({ operationId: 'g1', entityType: 'garden', entityUuid: 'g1', type: 'create', payload: { name: 'A', locationType: 'outdoor' } });
    await apply({ operationId: 'g2', entityType: 'garden', entityUuid: 'g2', type: 'create', payload: { name: 'B', locationType: 'outdoor' } });
    await apply({ operationId: 'bed', entityType: 'bed', entityUuid: 'bed', type: 'create', parentRefs: { gardenUuid: 'g1' }, payload: { name: 'Bed', locationType: 'outdoor' } });
    await apply({ operationId: 'plant', entityType: 'plant', entityUuid: 'plant', type: 'create', parentRefs: { gardenUuid: 'g1', bedUuid: 'bed' }, payload: { status: 'growing' } });
    expect((await apply({
      operationId: 'move-bed', entityType: 'bed', entityUuid: 'bed', type: 'update', baseRevision: 1,
      parentRefs: { gardenUuid: 'g2' }, payload: {},
    }))).toMatchObject({ status: 'invalid_parent', reason: 'bed_not_empty' });
    expect((await apply({
      operationId: 'fake-lifecycle', entityType: 'activity', entityUuid: 'fake', type: 'create',
      parentRefs: { plantUuid: 'plant' }, payload: { type: 'status_changed' },
    }))).toMatchObject({ status: 'invalid_parent', reason: 'invalid_activity_type' });
  });

  it('invalidates the realtime signal for compatibility writes', async () => {
    const { user } = await session();
    const before = await user.query(api.syncV2.syncSignal, {});
    await user.mutation(api.gardens.createGarden, {
      name: 'Legacy entry', locationType: 'outdoor',
    });
    const afterGarden = await user.query(api.syncV2.syncSignal, {});
    expect(afterGarden?.sequence).toBe((before?.sequence ?? 0) + 1);
  });

  it('enforces the observable legacy cutoff without blocking a safe client', async () => {
    const { user } = await session();
    await t.mutation(internal.syncRuntime.configure, {
      minimumSafeClientVersion: '2.0.0', legacyEnforcementAt: 1, rolloutPaused: false,
    });
    await expect(user.mutation(api.gardens.createGarden, {
      name: 'Old', locationType: 'outdoor', clientVersion: '1.9.9',
    })).rejects.toThrow('SYNC_CLIENT_UPGRADE_REQUIRED');
    await expect(user.mutation(api.gardens.createGarden, {
      name: 'Safe', locationType: 'outdoor', clientVersion: '2.0.0',
    })).resolves.toBeDefined();
  });

  it('treats a zero timestamp as an enabled legacy cutoff', async () => {
    const { user } = await session();
    await t.mutation(internal.syncRuntime.configure, {
      minimumSafeClientVersion: '2.0.0', legacyEnforcementAt: 0, rolloutPaused: false,
    });
    await expect(user.mutation(api.gardens.createGarden, {
      name: 'Old timestamp', locationType: 'outdoor', clientVersion: '1.9.9',
    })).rejects.toThrow('SYNC_CLIENT_UPGRADE_REQUIRED');
  });

  it('preserves server-side free Garden limits through the v2 path', async () => {
    const { user, generation, userId } = await session();
    await t.run(async (ctx) => await ctx.db.patch(userId as Id<'users'>, { subscription: undefined }));
    expect((await user.mutation(api.syncV2.applyOperation, {
      operationId: 'free-garden-1', syncGeneration: generation,
      entityType: 'garden', entityUuid: 'free-garden-1', type: 'create',
      payload: { name: 'One', locationType: 'outdoor' },
    })).status).toBe('applied');
    expect(await user.mutation(api.syncV2.applyOperation, {
      operationId: 'free-garden-2', syncGeneration: generation,
      entityType: 'garden', entityUuid: 'free-garden-2', type: 'create',
      payload: { name: 'Two', locationType: 'outdoor' },
    })).toMatchObject({ status: 'invalid_parent', reason: 'garden_limit_free' });
  });

  it('records payload-free outcome counters and evaluates rollout thresholds', async () => {
    const { user, generation } = await session();
    await user.mutation(api.syncV2.applyOperation, {
      operationId: 'metric-op', syncGeneration: generation, appVersion: '2.0.0',
      entityType: 'garden', entityUuid: 'metric-garden', type: 'create',
      payload: { name: 'SECRET_USER_PAYLOAD', locationType: 'outdoor' },
    });
    const scheduled = await t.run(async (ctx) => await ctx.db.system.query('_scheduled_functions').collect());
    expect(scheduled).toContainEqual(expect.objectContaining({ state: { kind: 'pending' } }));
    await t.mutation(internal.syncRuntime.recordOutcome, {
      appVersion: '2.0.0', entityType: 'garden', status: 'applied',
    });
    const rows = await t.run(async (ctx) => await ctx.db.query('syncOutcomeMetrics').collect());
    expect(rows).toContainEqual(expect.objectContaining({ appVersion: '2.0.0', entityType: 'garden', status: 'applied', count: 1 }));
    expect(JSON.stringify(rows)).not.toContain('SECRET_USER_PAYLOAD');
    const health = await t.query(api.syncRuntime.rolloutHealth, {});
    expect(health.total).toBeGreaterThanOrEqual(1);
  });

  it('pauses when a configured rate reaches its threshold at the minimum sample', async () => {
    const { user } = await session();
    await t.mutation(internal.syncRuntime.configure, {
      minimumSafeClientVersion: '1.0.0', rolloutPaused: false,
      thresholds: {
        conflictRate: 0.02, wrongGenerationRate: 0.01,
        retryableRate: 0.05, quarantineRate: 0.02, minimumSampleSize: 100,
      },
    });
    for (let index = 0; index < 98; index += 1) {
      await t.mutation(internal.syncRuntime.recordOutcome, {
        appVersion: '2.0.0', entityType: 'garden', status: 'applied',
      });
    }
    await t.mutation(internal.syncRuntime.recordOutcome, {
      appVersion: '2.0.0', entityType: 'garden', status: 'revision_conflict',
    });
    await t.mutation(internal.syncRuntime.recordOutcome, {
      appVersion: '2.0.0', entityType: 'garden', status: 'revision_conflict',
    });
    const health = await user.query(api.syncRuntime.rolloutHealth, {});
    expect(health.total).toBe(100);
    expect(health.rates.conflictRate).toBe(0.02);
    expect(health.breached).toContain('conflictRate');
    expect(health.shouldPause).toBe(true);
  });

  it('aggregates rollout health across an explicitly recorded observation window', async () => {
    const { user } = await session();
    await t.mutation(internal.syncRuntime.configure, {
      minimumSafeClientVersion: '1.0.0', rolloutPaused: false,
      thresholds: {
        conflictRate: 0.02, wrongGenerationRate: 0.01,
        retryableRate: 0.05, quarantineRate: 0.02, minimumSampleSize: 100,
      },
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('syncOutcomeMetrics', {
        bucket: '2026-08-03T09', appVersion: '2.0.0', entityType: 'garden',
        status: 'applied', count: 60, updatedAt: 1,
      });
      await ctx.db.insert('syncOutcomeMetrics', {
        bucket: '2026-08-03T10', appVersion: '2.0.0', entityType: 'garden',
        status: 'applied', count: 38, updatedAt: 1,
      });
      await ctx.db.insert('syncOutcomeMetrics', {
        bucket: '2026-08-03T10', appVersion: '2.0.0', entityType: 'garden',
        status: 'revision_conflict', count: 2, updatedAt: 1,
      });
    });
    const health = await user.query(api.syncRuntime.rolloutHealth, {
      startBucket: '2026-08-03T09',
      endBucket: '2026-08-03T10',
    });
    expect(health.observationWindow).toEqual({
      startBucket: '2026-08-03T09',
      endBucket: '2026-08-03T10',
    });
    expect(health.total).toBe(100);
    expect(health.rates.conflictRate).toBe(0.02);
    expect(health.breached).toContain('conflictRate');
    expect(health.shouldPause).toBe(true);
  });

  it('syncs care plans and explicit reminder outcomes idempotently without false care activities', async () => {
    const { user, generation, userId } = await session();
    const apply = (args: any) => user.mutation(api.syncV2.applyOperation, { syncGeneration: generation, ...args });
    await apply({
      operationId: 'care-plant', entityType: 'plant', entityUuid: 'care-plant',
      type: 'create', payload: { status: 'growing' },
    });
    expect((await apply({
      operationId: 'care-plan-create', entityType: 'carePlan', entityUuid: 'care-plan',
      type: 'create', parentRefs: { plantUuid: 'care-plant' },
      payload: {
        sourceContentVersion: 4,
        sourceValues: { wateringFrequencyDays: 3 },
        tasks: [{ type: 'watering', enabled: true, intervalDays: 3 }],
      },
    })).status).toBe('applied');
    expect((await apply({
      operationId: 'care-reminder-create', entityType: 'reminder', entityUuid: 'water-reminder',
      type: 'create', parentRefs: { plantUuid: 'care-plant', carePlanUuid: 'care-plan' },
      payload: { taskType: 'watering', nextRunAt: 10, timezone: 'UTC', rrule: 'FREQ=DAILY;INTERVAL=3' },
    })).status).toBe('applied');
    const checked = {
      operationId: 'checked-outcome', entityType: 'reminderOutcome' as const,
      entityUuid: 'checked-outcome', type: 'create' as const,
      parentRefs: { reminderUuid: 'water-reminder' },
      payload: { outcome: 'checked_not_needed', occurredAt: 20, occurrenceKey: 'water-reminder:10' },
    };
    expect((await apply(checked)).status).toBe('applied');
    expect((await apply(checked)).status).toBe('already_applied');
    const currentReminder = await t.run(async (ctx) =>
      (await ctx.db.query('reminders').withIndex('by_user_entity_uuid', (q) =>
        q.eq('userId', userId as Id<'users'>).eq('entityUuid', 'water-reminder')
      ).unique())
    );
    expect(currentReminder).not.toBeNull();
    expect((await apply({
      operationId: 'performed-outcome', entityType: 'reminderOutcome',
      entityUuid: 'performed-outcome', type: 'create',
      parentRefs: { reminderUuid: 'water-reminder' },
      payload: {
        outcome: 'performed', occurredAt: 30,
        occurrenceKey: `water-reminder:${currentReminder!.nextRunAt}`,
      },
    })).status).toBe('applied');
    const ownerId = userId as Id<'users'>;
    const state = await t.run(async (ctx) => {
      const plant = await ctx.db.query('userPlants')
        .withIndex('by_user_entity_uuid', (q) => q.eq('userId', ownerId).eq('entityUuid', 'care-plant')).unique();
      const activities = plant
        ? await ctx.db.query('logs').withIndex('by_user_plant', (q) => q.eq('userPlantId', plant._id)).collect()
        : [];
      const outcomes = await ctx.db.query('reminderOutcomes')
        .withIndex('by_user_entity_uuid', (q) => q.eq('userId', ownerId)).collect();
      return { plant, activities, outcomes };
    });
    expect(state.outcomes).toHaveLength(2);
    expect(state.activities.filter((row) => row.type === 'watering')).toHaveLength(1);
    expect(state.activities.filter((row) => row.type === 'watering_check')).toHaveLength(1);
    expect(state.plant?.lastWateredAt).toBe(30);
  });

  it('rejects stale or disabled reminder outcomes before creating activities', async () => {
    const { user, generation, userId } = await session();
    const apply = (args: any) => user.mutation(api.syncV2.applyOperation, { syncGeneration: generation, ...args });
    await apply({
      operationId: 'guard-plant', entityType: 'plant', entityUuid: 'guard-plant',
      type: 'create', payload: { status: 'growing' },
    });
    await apply({
      operationId: 'guard-plan', entityType: 'carePlan', entityUuid: 'guard-plan',
      type: 'create', parentRefs: { plantUuid: 'guard-plant' },
      payload: {
        sourceValues: { wateringFrequencyDays: 3 },
        tasks: [{ type: 'watering', enabled: true, intervalDays: 3 }],
      },
    });
    await apply({
      operationId: 'guard-reminder', entityType: 'reminder', entityUuid: 'guard-reminder',
      type: 'create', parentRefs: { plantUuid: 'guard-plant', carePlanUuid: 'guard-plan' },
      payload: { taskType: 'watering', nextRunAt: 10, timezone: 'UTC', rrule: 'FREQ=DAILY;INTERVAL=3' },
    });

    const missingOccurrence: any = await apply({
      operationId: 'missing-occurrence', entityType: 'reminderOutcome', entityUuid: 'missing-occurrence',
      type: 'create', parentRefs: { reminderUuid: 'guard-reminder' },
      payload: { outcome: 'performed', occurredAt: 11 },
    });
    expect(missingOccurrence.reason).toBe('occurrence_key_required');

    const staleOutcome: any = await apply({
      operationId: 'stale-outcome', entityType: 'reminderOutcome', entityUuid: 'stale-outcome',
      type: 'create', parentRefs: { reminderUuid: 'guard-reminder' },
      payload: { outcome: 'performed', occurredAt: 11, occurrenceKey: 'guard-reminder:9' },
    });
    expect(staleOutcome.reason).toBe('stale_reminder_occurrence');

    expect((await apply({
      operationId: 'disable-guard-reminder', entityType: 'reminder', entityUuid: 'guard-reminder',
      type: 'update', baseRevision: 1, payload: { enabled: false },
    })).status).toBe('applied');
    const disabledOutcome: any = await apply({
      operationId: 'disabled-outcome', entityType: 'reminderOutcome', entityUuid: 'disabled-outcome',
      type: 'create', parentRefs: { reminderUuid: 'guard-reminder' },
      payload: { outcome: 'performed', occurredAt: 12, occurrenceKey: 'guard-reminder:10' },
    });
    expect(disabledOutcome.reason).toBe('reminder_disabled');

    await t.run(async (ctx) => {
      await ctx.db.insert('reminders', {
        userId: userId as Id<'users'>,
        entityUuid: 'legacy-sync-reminder',
        type: 'custom',
        title: 'Legacy reminder',
        nextRunAt: 50,
        enabled: true,
      });
    });
    const implicitLegacy: any = await apply({
      operationId: 'legacy-implicit-outcome', entityType: 'reminderOutcome', entityUuid: 'legacy-implicit-outcome',
      type: 'create', parentRefs: { reminderUuid: 'legacy-sync-reminder' },
      payload: { outcome: 'disabled', occurredAt: 51 },
    });
    expect(implicitLegacy.reason).toBe('legacy_occurrence_exemption_required');
    expect((await apply({
      operationId: 'legacy-explicit-outcome', entityType: 'reminderOutcome', entityUuid: 'legacy-explicit-outcome',
      type: 'create', parentRefs: { reminderUuid: 'legacy-sync-reminder' },
      payload: { outcome: 'disabled', occurredAt: 51, legacyCompatibility: true },
    })).status).toBe('applied');
  });

  it('removes sync namespaces and uncommitted uploads during account deletion', async () => {
    const { user, userId } = await session();
    const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(['account-orphan'])));
    await user.mutation(api.storage.registerSyncUpload, {
      operationId: 'account-upload', entityUuid: 'account-photo', storageId,
    });
    await t.run(async (ctx) => {
      const owner = (await ctx.db.get(userId as Id<'users'>))!;
      await deleteAppUserData(ctx, owner);
    });
    const remaining = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId as Id<'users'>),
      states: await ctx.db.query('syncAccountState').collect(),
      reservations: await ctx.db.query('syncUploadReservations').collect(),
      receipts: await ctx.db.query('syncOperationReceipts').collect(),
    }));
    expect(remaining).toEqual({ user: null, states: [], reservations: [], receipts: [] });
    expect(await t.run(async (ctx) => await ctx.storage.getUrl(storageId))).toBeNull();
  });
});
