import { describe, expect, it, vi } from 'vitest';
import type { ProjectionEnvelope } from '../sync/reconciliation';
import type { OutboxEnvelope } from '../sync/queue';
import { beginSyncScope, publishSyncScopeError, publishSyncScopeSnapshot, syncScopeStore } from './syncScopeStore';
import { createSyncScopeController, createSyncScopeLifecycle } from './syncScopeController';

function projection(scope: string, generation: string): ProjectionEnvelope {
  return {
    version: 1, scope, generation, hydratedAt: 1, complete: true,
    entities: {
      garden: {}, bed: {}, plant: {}, activity: {}, harvest: {}, photo: {},
      carePlan: {}, reminder: {}, reminderOutcome: {},
    },
    tombstones: {},
  };
}

function outbox(scope: string, needsAttention = false): OutboxEnvelope {
  return { version: 2, scope, operations: [], quarantine: [], needsAttention };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('SyncScopeCoordinator controller', () => {
  it('routes subscription and foreground callbacks through one latest-request guard', async () => {
    const scope = 'account-a';
    const token = 'token-a';
    beginSyncScope(scope, token);
    const initialProjection = deferred<ProjectionEnvelope | null>();
    const subscriptionProjection = deferred<ProjectionEnvelope | null>();
    const foregroundProjection = deferred<ProjectionEnvelope | null>();
    const initialQueue = deferred<OutboxEnvelope>();
    const subscriptionQueue = deferred<OutboxEnvelope>();
    const foregroundQueue = deferred<OutboxEnvelope>();
    const projections = [initialProjection, subscriptionProjection, foregroundProjection];
    const queues = [initialQueue, subscriptionQueue, foregroundQueue];
    let projectionCallback!: () => void;
    let queueCallback!: () => void;
    const unsubscribeProjection = vi.fn();
    const unsubscribeQueue = vi.fn();
    const cleanup = vi.fn();
    const controller = createSyncScopeController(scope, token, {
      loadProjection: vi.fn(() => projections.shift()!.promise),
      loadQueue: vi.fn(() => queues.shift()!.promise),
      subscribeProjection: vi.fn((_scope, callback) => { projectionCallback = callback; return unsubscribeProjection; }),
      subscribeQueue: vi.fn((_scope, callback) => { queueCallback = callback; return unsubscribeQueue; }),
      publishSnapshot: publishSyncScopeSnapshot,
      publishError: publishSyncScopeError,
      cleanupPhotos: cleanup,
    });

    queueCallback();
    const foreground = controller.foregroundRefresh();
    foregroundProjection.resolve(projection(scope, 'foreground'));
    foregroundQueue.resolve(outbox(scope, true));
    expect(await foreground).toBe(true);
    expect(syncScopeStore.getState()).toMatchObject({
      hydration: 'needs_attention',
      projection: { generation: 'foreground' },
      outbox: { needsAttention: true },
    });
    subscriptionProjection.resolve(projection(scope, 'subscription'));
    subscriptionQueue.resolve(outbox(scope));
    initialProjection.resolve(projection(scope, 'initial'));
    initialQueue.resolve(outbox(scope));
    await Promise.resolve();
    await Promise.resolve();
    expect(syncScopeStore.getState().projection?.generation).toBe('foreground');
    expect(cleanup).toHaveBeenCalledTimes(1);

    expect(projectionCallback).toBeTypeOf('function');
    controller.dispose();
    expect(unsubscribeProjection).toHaveBeenCalledOnce();
    expect(unsubscribeQueue).toHaveBeenCalledOnce();
  });

  it('does not publish or clean up a pending read after disposal', async () => {
    const pendingProjection = deferred<ProjectionEnvelope | null>();
    const pendingQueue = deferred<OutboxEnvelope>();
    const cleanup = vi.fn();
    beginSyncScope('account-a', 'token-a');
    const controller = createSyncScopeController('account-a', 'token-a', {
      loadProjection: () => pendingProjection.promise,
      loadQueue: () => pendingQueue.promise,
      subscribeProjection: () => () => undefined,
      subscribeQueue: () => () => undefined,
      publishSnapshot: publishSyncScopeSnapshot,
      publishError: publishSyncScopeError,
      cleanupPhotos: cleanup,
    });
    controller.dispose();
    pendingProjection.resolve(projection('account-a', 'late'));
    pendingQueue.resolve(outbox('account-a'));
    await Promise.resolve();
    await Promise.resolve();
    expect(syncScopeStore.getState().projection).toBeNull();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('ignores a stale rejection after a newer foreground snapshot wins', async () => {
    const initialProjection = deferred<ProjectionEnvelope | null>();
    const initialQueue = deferred<OutboxEnvelope>();
    const foregroundProjection = deferred<ProjectionEnvelope | null>();
    const foregroundQueue = deferred<OutboxEnvelope>();
    const errors: unknown[] = [];
    let read = 0;
    beginSyncScope('account-a', 'token-a');
    const controller = createSyncScopeController('account-a', 'token-a', {
      loadProjection: () => [initialProjection, foregroundProjection][read]!.promise,
      loadQueue: () => [initialQueue, foregroundQueue][read++]!.promise,
      subscribeProjection: () => () => undefined,
      subscribeQueue: () => () => undefined,
      publishSnapshot: publishSyncScopeSnapshot,
      publishError: (_scope, _token, error) => { errors.push(error); return true; },
      cleanupPhotos: () => undefined,
    });
    const foreground = controller.foregroundRefresh();
    foregroundProjection.resolve(projection('account-a', 'new'));
    foregroundQueue.resolve(outbox('account-a'));
    expect(await foreground).toBe(true);
    initialProjection.reject(new Error('stale foreground failure'));
    initialQueue.resolve(outbox('account-a'));
    await Promise.resolve();
    expect(errors).toEqual([]);
    expect(syncScopeStore.getState().projection?.generation).toBe('new');
    controller.dispose();
  });

  it('keeps Account A pending work out after guest to Account B transition', async () => {
    const accountAProjection = deferred<ProjectionEnvelope | null>();
    const accountAQueue = deferred<OutboxEnvelope>();
    beginSyncScope('account-a', 'token-a');
    const accountA = createSyncScopeController('account-a', 'token-a', {
      loadProjection: () => accountAProjection.promise,
      loadQueue: () => accountAQueue.promise,
      subscribeProjection: () => () => undefined,
      subscribeQueue: () => () => undefined,
      publishSnapshot: publishSyncScopeSnapshot,
      publishError: publishSyncScopeError,
      cleanupPhotos: () => undefined,
    });
    accountA.dispose();
    beginSyncScope(null, 'guest-token');
    beginSyncScope('account-b', 'token-b');
    const accountB = createSyncScopeController('account-b', 'token-b', {
      loadProjection: async () => projection('account-b', 'b'),
      loadQueue: async () => outbox('account-b'),
      subscribeProjection: () => () => undefined,
      subscribeQueue: () => () => undefined,
      publishSnapshot: publishSyncScopeSnapshot,
      publishError: publishSyncScopeError,
      cleanupPhotos: () => undefined,
    });
    await Promise.resolve();
    await Promise.resolve();
    accountAProjection.resolve(projection('account-a', 'late-a'));
    accountAQueue.resolve(outbox('account-a'));
    await Promise.resolve();
    expect(syncScopeStore.getState()).toMatchObject({ scope: 'account-b', projection: { generation: 'b' } });
    accountB.dispose();
  });
});

describe('SyncScopeCoordinator production lifecycle', () => {
  it('routes subscription and foreground effects without accumulating listeners', async () => {
    const callbacks: Array<() => void> = [];
    const unsubscribes = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    const loadProjection = vi.fn(async (scope: string) => projection(scope, `load-${loadProjection.mock.calls.length}`));
    const loadQueue = vi.fn(async (scope: string) => outbox(scope));
    let subscription = 0;
    const lifecycle = createSyncScopeLifecycle({
      loadProjection,
      loadQueue,
      subscribeProjection: (_scope, callback) => { callbacks.push(callback); return unsubscribes[subscription++]!; },
      subscribeQueue: (_scope, callback) => { callbacks.push(callback); return unsubscribes[subscription++]!; },
      publishSnapshot: publishSyncScopeSnapshot,
      publishError: publishSyncScopeError,
      cleanupPhotos: () => undefined,
    }, 'background');

    beginSyncScope('account-a', 'token-a');
    lifecycle.activate('account-a', 'token-a');
    callbacks[0]!();
    lifecycle.handleAppState('active');
    await Promise.resolve();
    await Promise.resolve();
    expect(loadProjection).toHaveBeenCalledTimes(3);
    expect(loadQueue).toHaveBeenCalledTimes(3);

    beginSyncScope('account-b', 'token-b');
    lifecycle.activate('account-b', 'token-b');
    expect(unsubscribes[0]).toHaveBeenCalledOnce();
    expect(unsubscribes[1]).toHaveBeenCalledOnce();
    lifecycle.handleAppState('background');
    lifecycle.handleAppState('active');
    lifecycle.handleAppState('active');
    await Promise.resolve();
    await Promise.resolve();
    expect(loadProjection).toHaveBeenCalledTimes(5);
    expect(loadQueue).toHaveBeenCalledTimes(5);
    expect(syncScopeStore.getState().scope).toBe('account-b');

    lifecycle.dispose();
    expect(unsubscribes[2]).toHaveBeenCalledOnce();
    expect(unsubscribes[3]).toHaveBeenCalledOnce();
  });
});
