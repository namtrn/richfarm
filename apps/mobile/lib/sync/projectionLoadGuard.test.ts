import { describe, expect, it } from 'vitest';
import type { ProjectionEnvelope } from './reconciliation';
import {
  createScopedProjectionLoader,
  selectProjectionSnapshotForScope,
} from './projectionLoadGuard';

function projection(scope: string): ProjectionEnvelope {
  return {
    version: 1,
    scope,
    generation: 'g1',
    hydratedAt: 1,
    complete: true,
    entities: {
      garden: {}, bed: {}, plant: {}, activity: {}, harvest: {}, photo: {},
      carePlan: {}, reminder: {}, reminderOutcome: {},
    },
    tombstones: {},
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe('scoped projection loader', () => {
  it('masks Account A synchronously on the first render for Account B', () => {
    const visible = selectProjectionSnapshotForScope({
      scope: 'account-a',
      projection: projection('account-a'),
      loaded: true,
    }, 'account-b');

    expect(visible).toEqual({ scope: 'account-b', projection: null, loaded: false });
  });

  it('rejects a late Account A result after its scope is disposed', async () => {
    const accountA = deferred<ProjectionEnvelope | null>();
    const accountB = deferred<ProjectionEnvelope | null>();
    const committed: string[] = [];
    const load = (scope: string) => scope === 'account-a' ? accountA.promise : accountB.promise;

    const loaderA = createScopedProjectionLoader('account-a', load, (value) => {
      if (value) committed.push(value.scope);
    });
    const pendingA = loaderA.reload();
    loaderA.dispose();

    const loaderB = createScopedProjectionLoader('account-b', load, (value) => {
      if (value) committed.push(value.scope);
    });
    const pendingB = loaderB.reload();

    accountB.resolve(projection('account-b'));
    expect(await pendingB).toBe(true);
    accountA.resolve(projection('account-a'));
    expect(await pendingA).toBe(false);
    expect(committed).toEqual(['account-b']);
  });

  it('allows only the latest overlapping read for the same scope to publish', async () => {
    const first = deferred<ProjectionEnvelope | null>();
    const second = deferred<ProjectionEnvelope | null>();
    const reads = [first, second];
    const committed: ProjectionEnvelope[] = [];
    const loader = createScopedProjectionLoader(
      'account-a',
      async () => (await reads.shift()!.promise),
      (value) => { if (value) committed.push(value); }
    );

    const pendingFirst = loader.reload();
    const pendingSecond = loader.reload();
    second.resolve({ ...projection('account-a'), generation: 'new' });
    expect(await pendingSecond).toBe(true);
    first.resolve({ ...projection('account-a'), generation: 'old' });
    expect(await pendingFirst).toBe(false);
    expect(committed.map((value) => value.generation)).toEqual(['new']);
  });
});
