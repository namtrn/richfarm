import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));

import { enqueueSyncAction } from './queue';
import { loadAuthoritativeProjection, loadRenderedProjection, reconcileAuthoritativeSnapshot, type ProjectionEnvelope } from './reconciliation';

function saveProjection(scope: string, entities?: Partial<ProjectionEnvelope['entities']>) {
  const projection: ProjectionEnvelope = {
    version: 1, scope, generation: 'g1', hydratedAt: 1, complete: true,
    entities: {
      garden: {}, bed: {}, plant: {}, activity: {}, harvest: {}, photo: {},
      ...entities,
    },
    tombstones: {},
  };
  storage.set(`rf_sync_projection_v1_${encodeURIComponent(scope)}`, JSON.stringify(projection));
}

describe('rendered authoritative projection', () => {
  beforeEach(() => storage.clear());

  it('overlays dependent pending creates using stable logical ids', async () => {
    const scope = 'device:user-a';
    saveProjection(scope);
    await enqueueSyncAction({
      id: 'g-op', type: 'entity', createdAt: 1, attempts: 0,
      payload: { operationId: 'g-op', entityType: 'garden', entityUuid: 'g-local', operationType: 'create', payload: { name: 'Offline', locationType: 'outdoor' } },
    }, scope);
    await enqueueSyncAction({
      id: 'b-op', type: 'entity', createdAt: 2, attempts: 0,
      payload: { operationId: 'b-op', entityType: 'bed', entityUuid: 'b-local', operationType: 'create', parentRefs: { gardenUuid: 'g-local' }, payload: { name: 'Bed', locationType: 'outdoor' } },
    }, scope);
    const rendered = await loadRenderedProjection(scope);
    expect(rendered?.entities.garden['g-local']).toMatchObject({ _id: 'g-local', _pending: true });
    expect(rendered?.entities.bed['b-local']).toMatchObject({ gardenId: 'g-local', _pending: true });
  });

  it('renders a durable offline create before the first server hydration', async () => {
    const scope = 'offline:user';
    await enqueueSyncAction({
      id: 'offline-create', type: 'entity', createdAt: 1, attempts: 0,
      payload: { operationId: 'offline-create', entityType: 'garden', entityUuid: 'offline-garden', operationType: 'create', payload: { name: 'No network', locationType: 'outdoor' } },
    }, scope);
    const rendered = await loadRenderedProjection(scope);
    expect(rendered?.complete).toBe(false);
    expect(rendered?.entities.garden['offline-garden']).toMatchObject({ name: 'No network', _pending: true });
  });

  it('renders a staged private photo directly from the outbox', async () => {
    const scope = 'offline:photo';
    saveProjection(scope, { plant: { 'plant-a': { _id: 'server-plant', entityUuid: 'plant-a' } } });
    await enqueueSyncAction({
      id: 'photo-op', type: 'photo', plantId: 'plant-a', createdAt: 1, attempts: 0,
      payload: {
        localId: 'photo-a', managedUri: 'file:///private/richfarm/photo-a.jpg',
        phase: 'staged', date: 10, source: 'camera',
      },
    }, scope);
    expect((await loadRenderedProjection(scope))?.entities.photo['photo-a']).toMatchObject({
      photoUrl: 'file:///private/richfarm/photo-a.jpg',
      userPlantId: 'server-plant',
      _operationId: 'photo-op',
      _pending: true,
    });
  });

  it('applies pending update/delete without leaking across account scopes', async () => {
    const scopeA = 'device:user-a';
    const scopeB = 'device:user-b';
    const row = { _id: 'server-garden', entityUuid: 'garden-1', revision: 3, name: 'Before' };
    saveProjection(scopeA, { garden: { 'garden-1': row } });
    saveProjection(scopeB, { garden: { 'garden-1': row } });
    await enqueueSyncAction({
      id: 'update', type: 'entity', createdAt: 1, attempts: 0,
      payload: { operationId: 'update', entityType: 'garden', entityUuid: 'garden-1', operationType: 'update', baseRevision: 3, payload: { name: 'After' } },
    }, scopeA);
    expect((await loadRenderedProjection(scopeA))?.entities.garden['garden-1']).toMatchObject({ name: 'After', _pending: true });
    expect((await loadRenderedProjection(scopeB))?.entities.garden['garden-1']).toMatchObject({ name: 'Before' });
    await enqueueSyncAction({
      id: 'delete', type: 'entity', createdAt: 2, attempts: 0,
      payload: { operationId: 'delete', entityType: 'garden', entityUuid: 'garden-1', operationType: 'delete', baseRevision: 3 },
    }, scopeA);
    expect((await loadRenderedProjection(scopeA))?.entities.garden['garden-1']).toBeUndefined();
  });

  it('hydrates every pagination page and commits only while the captured scope is current', async () => {
    const rows = Array.from({ length: 205 }, (_, index) => ({
      _id: `garden-${index}`, entityUuid: `garden-${index}`, revision: 1, name: `Garden ${index}`,
    }));
    const client = {
      query: vi.fn(async (_ref: unknown, args: any) => {
        if (args.domain !== 'garden') return { status: 'ok', page: [], isDone: true, continueCursor: '' };
        const start = Number(args.paginationOpts.cursor ?? 0);
        const page = rows.slice(start, start + 100);
        const next = start + page.length;
        return { status: 'ok', page, isDone: next >= rows.length, continueCursor: String(next) };
      }),
    };
    const result = await reconcileAuthoritativeSnapshot({
      client: client as any, scope: 'device:current', generation: 'g1', isCurrent: () => true,
    });
    expect(result.status).toBe('ok');
    expect(Object.keys((await loadAuthoritativeProjection('device:current'))!.entities.garden)).toHaveLength(205);

    let checks = 0;
    const stale = await reconcileAuthoritativeSnapshot({
      client: client as any, scope: 'device:stale', generation: 'g1', isCurrent: () => ++checks < 2,
    });
    expect(stale.status).toBe('scope_changed');
    expect(await loadAuthoritativeProjection('device:stale')).toBeNull();
  });
});
