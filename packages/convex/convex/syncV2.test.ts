/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob('./**/*.ts');
const identity = { subject: 'sync-v2-user', tokenIdentifier: 'test:sync-v2-user' };
function setup() { return convexTest(schema, modules); }

describe('Phase 1.5 sync v2', () => {
  let t: ReturnType<typeof setup>;

  beforeEach(async () => {
    t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert('users', { tokenIdentifier: identity.tokenIdentifier, isActive: true });
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
    const before = await t.query(api.syncMigration.dryRun, { sampleLimit: 50 });
    expect(before.report.garden.missingUuid).toBe(1);
    const first = await t.mutation(api.syncMigration.backfillPage, {
      domain: 'garden', paginationOpts: { numItems: 50, cursor: null },
    });
    expect(first.changed).toBe(1);
    const second = await t.mutation(api.syncMigration.backfillPage, {
      domain: 'garden', paginationOpts: { numItems: 50, cursor: null },
    });
    expect(second.changed).toBe(0);
    const row = await t.run(async (ctx) => await ctx.db.get(legacyId));
    expect(row?.entityUuid).toBe(`legacy:${legacyId}`);
    expect(row?.revision).toBe(1);
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
});
