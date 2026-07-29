import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginSyncScope,
  publishSyncScopeSnapshot,
  syncScopeStore,
} from './syncScopeStore';
import type { ProjectionEnvelope } from '../sync/reconciliation';
import type { OutboxEnvelope } from '../sync/queue';

function projection(scope: string, name: string): ProjectionEnvelope {
  return {
    version: 1,
    scope,
    generation: `generation:${scope}`,
    hydratedAt: 1,
    complete: true,
    entities: {
      garden: { garden: { entityUuid: 'garden', name } },
      bed: {},
      plant: {},
      activity: {},
      harvest: {},
      photo: {},
    },
    tombstones: {},
  };
}

function outbox(scope: string): OutboxEnvelope {
  return { version: 2, scope, operations: [], quarantine: [] };
}

describe('active SyncScopeStore', () => {
  beforeEach(() => beginSyncScope(null, 'test-initial'));

  it('publishes one entity snapshot and rejects obsolete scope callbacks', () => {
    beginSyncScope('account-a', 'token-a');
    expect(publishSyncScopeSnapshot({
      scope: 'account-a',
      scopeToken: 'token-a',
      projection: projection('account-a', 'Garden A'),
      outbox: outbox('account-a'),
    })).toBe(true);
    expect(syncScopeStore.getState().entityLists.garden).toMatchObject([{ name: 'Garden A' }]);

    beginSyncScope('account-b', 'token-b');
    expect(syncScopeStore.getState().projection).toBeNull();
    expect(publishSyncScopeSnapshot({
      scope: 'account-a',
      scopeToken: 'token-a',
      projection: projection('account-a', 'Late Garden A'),
      outbox: outbox('account-a'),
    })).toBe(false);
    expect(syncScopeStore.getState()).toMatchObject({
      scope: 'account-b',
      hydration: 'loading',
      projection: null,
    });
  });

  it('preserves an unrelated plant child selector reference', () => {
    beginSyncScope('account-a', 'token-a');
    const initial = projection('account-a', 'Garden A');
    initial.entities.activity = {
      'activity-a': { entityUuid: 'activity-a', plantUuid: 'plant-a', occurredAt: 1 },
      'activity-b': { entityUuid: 'activity-b', plantUuid: 'plant-b', occurredAt: 1 },
    };
    publishSyncScopeSnapshot({
      scope: 'account-a', scopeToken: 'token-a', projection: initial, outbox: outbox('account-a'),
    });
    const plantB = syncScopeStore.getState().plantChildLists.activity['plant-b'];
    const changed = projection('account-a', 'Garden A');
    changed.entities.activity = {
      'activity-a': { entityUuid: 'activity-a', plantUuid: 'plant-a', occurredAt: 2 },
      'activity-b': { entityUuid: 'activity-b', plantUuid: 'plant-b', occurredAt: 1 },
    };
    publishSyncScopeSnapshot({
      scope: 'account-a', scopeToken: 'token-a', projection: changed, outbox: outbox('account-a'),
    });
    expect(syncScopeStore.getState().plantChildLists.activity['plant-b']).toBe(plantB);
  });
});
