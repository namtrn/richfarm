import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlantContentCommands } from './plantContentCommands';
import { enqueueForIdentity } from '../sync/guestClaim';
import { enqueueSyncAction } from '../sync/queue';
import { removeManagedPlantPhoto, stageManagedPlantPhoto } from '../photo/managedPlantPhotos';

vi.mock('../sync/guestClaim', () => ({
  enqueueForIdentity: vi.fn(),
  runForIdentityDestination: vi.fn(async (identity, run) => run(identity.scopeKey)),
}));
vi.mock('../sync/queue', () => ({ updateOutbox: vi.fn(), enqueueSyncAction: vi.fn() }));
vi.mock('../photo/managedPlantPhotos', () => ({
  stageManagedPlantPhoto: vi.fn(async () => 'file:///private/richfarm/photo.jpg'),
  removeManagedPlantPhoto: vi.fn(),
}));

const account = {
  kind: 'account' as const,
  installationId: 'install', accountUserId: 'user',
  scopeKey: 'account:v1:install:user' as const,
};

function runtime(overrides: Record<string, unknown> = {}) {
  let id = 0;
  return {
    identity: account, scopeToken: 'token-a', isCurrentScope: () => true,
    createId: () => `id-${++id}`, now: () => 100, scheduleSync: vi.fn(), ...overrides,
  };
}

describe('plant content commands', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists an activity before scheduling sync and reuses supplied IDs', async () => {
    const order: string[] = [];
    vi.mocked(enqueueForIdentity).mockImplementation(async (identity) => {
      order.push('persist');
      return identity.scopeKey;
    });
    const adapter = runtime({ scheduleSync: () => { order.push('schedule'); } });
    const result = await createPlantContentCommands(adapter).appendActivity({
      plantUuid: 'plant-a', operationId: 'op-a', entityUuid: 'activity-a',
      type: 'watering', note: ' note ', date: 10,
    });
    expect(order).toEqual(['persist', 'schedule']);
    expect(result).toEqual({ operationId: 'op-a', entityUuid: 'activity-a', status: 'queued' });
    expect(vi.mocked(enqueueForIdentity).mock.calls[0][1]).toMatchObject({
      id: 'op-a', type: 'entity',
      payload: { operationId: 'op-a', entityUuid: 'activity-a', entityType: 'activity',
        parentRefs: { plantUuid: 'plant-a' }, payload: { note: 'note' } },
    });
  });

  it('does not schedule sync when durability fails', async () => {
    vi.mocked(enqueueForIdentity).mockRejectedValueOnce(new Error('storage failed'));
    const adapter = runtime();
    await expect(createPlantContentCommands(adapter).appendHarvest({ plantUuid: 'plant-a', date: 10 }))
      .rejects.toThrow('storage failed');
    expect(adapter.scheduleSync).not.toHaveBeenCalled();
  });

  it('keeps guest commands local and makes no network request', async () => {
    const adapter = runtime({ identity: { kind: 'guest' as const, installationId: 'install',
      guestDatasetId: 'guest', scopeKey: 'guest:v1:install:guest' as const } });
    const result = await createPlantContentCommands(adapter).appendHarvest({ plantUuid: 'plant-a', date: 10 });
    expect(result.status).toBe('local_only');
    expect(adapter.scheduleSync).not.toHaveBeenCalled();
  });

  it('does not schedule an old-scope completion', async () => {
    const adapter = runtime({ isCurrentScope: () => false });
    await createPlantContentCommands(adapter).appendActivity({ plantUuid: 'plant-a', type: 'watering', date: 10 });
    expect(adapter.scheduleSync).not.toHaveBeenCalled();
  });

  it('rejects invalid harvest quantities before writing', async () => {
    await expect(createPlantContentCommands(runtime()).appendHarvest({ plantUuid: 'plant-a', quantity: 'many', date: 10 }))
      .rejects.toThrow('harvest_quantity_invalid');
    expect(enqueueForIdentity).not.toHaveBeenCalled();
  });

  it('stages a private photo before durably publishing it', async () => {
    const adapter = runtime();
    const result = await createPlantContentCommands(adapter).stageAndAddPhoto({
      plantUuid: 'plant-a', sourceUri: 'content://camera/photo', source: 'camera', takenAt: 10,
    });
    expect(stageManagedPlantPhoto).toHaveBeenCalledWith(expect.objectContaining({
      sourceUri: 'content://camera/photo', scope: account.scopeKey, plantUuid: 'plant-a',
    }));
    expect(enqueueSyncAction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'photo', payload: expect.objectContaining({
        managedUri: 'file:///private/richfarm/photo.jpg', phase: 'staged',
      }),
    }), account.scopeKey);
    expect(result.status).toBe('queued');
  });

  it('removes the staged private copy when the outbox write fails', async () => {
    vi.mocked(enqueueSyncAction).mockRejectedValueOnce(new Error('storage failed'));
    await expect(createPlantContentCommands(runtime()).stageAndAddPhoto({
      plantUuid: 'plant-a', sourceUri: 'content://camera/photo', source: 'camera', takenAt: 10,
    })).rejects.toThrow('storage failed');
    expect(removeManagedPlantPhoto).toHaveBeenCalledWith('file:///private/richfarm/photo.jpg');
  });
});
