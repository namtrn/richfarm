export type FavoriteWriteState = {
  pending: boolean;
  desired?: boolean;
  error?: unknown;
};

export type FavoriteWriteResult = 'succeeded' | 'failed' | 'stale';

export class StaleFavoriteScopeError extends Error {
  constructor() {
    super('favorite_scope_changed');
  }
}

const states = new Map<string, FavoriteWriteState>();
const chains = new Map<string, Promise<unknown>>();
const sequences = new Map<string, number>();
const listeners = new Set<() => void>();
let revision = 0;

const keyFor = (scope: string, plantId: string) => `${scope}:${plantId}`;
const publish = () => { revision += 1; for (const listener of listeners) listener(); };

export const getFavoriteWritesRevision = () => revision;

export function subscribeFavoriteWrites(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFavoriteWriteState(scope: string, plantId: string): FavoriteWriteState {
  return states.get(keyFor(scope, plantId)) ?? { pending: false };
}

export function getFavoriteWriteStates(scope: string): Record<string, FavoriteWriteState> {
  const prefix = `${scope}:`;
  const scoped: Record<string, FavoriteWriteState> = {};
  for (const [key, state] of states) {
    if (key.startsWith(prefix)) scoped[key.slice(prefix.length)] = state;
  }
  return scoped;
}

export function applyFavoriteWrites<T extends { plantMasterId: unknown }>(
  favorites: readonly T[] | undefined,
  writes: Record<string, FavoriteWriteState>,
): T[] {
  const byPlantId = new Map<string, T>();
  for (const favorite of favorites ?? []) {
    byPlantId.set(String(favorite.plantMasterId), favorite);
  }
  for (const [plantId, state] of Object.entries(writes)) {
    if (state.error || state.desired === undefined) continue;
    if (state.desired) {
      byPlantId.set(plantId, byPlantId.get(plantId) ?? { plantMasterId: plantId } as T);
    } else {
      byPlantId.delete(plantId);
    }
  }
  return Array.from(byPlantId.values());
}

export function reconcileFavoriteWrites(scope: string, serverFavoriteIds: ReadonlySet<string>) {
  const prefix = `${scope}:`;
  let changed = false;
  for (const [key, state] of states) {
    if (!key.startsWith(prefix) || state.pending || state.error || state.desired === undefined) continue;
    const plantId = key.slice(prefix.length);
    if (serverFavoriteIds.has(plantId) === state.desired) {
      states.delete(key);
      changed = true;
    }
  }
  if (changed) publish();
}

export function getNextFavoriteDesired(scope: string, plantId: string, serverValue: boolean) {
  const state = getFavoriteWriteState(scope, plantId);
  const latestIntent = state.error ? undefined : state.desired;
  return !(latestIntent ?? serverValue);
}

export async function submitFavoriteDesired(input: {
  scope: string;
  plantId: string;
  desired: boolean;
  write: (desired: boolean) => Promise<unknown>;
  isActive?: () => boolean;
}): Promise<FavoriteWriteResult> {
  const key = keyFor(input.scope, input.plantId);
  const sequence = (sequences.get(key) ?? 0) + 1;
  sequences.set(key, sequence);
  states.set(key, { pending: true, desired: input.desired });
  publish();
  const previous = chains.get(key);
  const execute = () => {
    if (input.isActive && !input.isActive()) throw new StaleFavoriteScopeError();
    return input.write(input.desired);
  };
  const operation = previous
    ? previous.catch(() => undefined).then(execute)
    : Promise.resolve().then(execute);
  chains.set(key, operation);
  try {
    await operation;
    if (input.isActive && !input.isActive()) {
      if (sequences.get(key) === sequence) states.delete(key);
      publish();
      return 'stale';
    }
    if (sequences.get(key) === sequence) {
      states.set(key, { pending: false, desired: input.desired });
      chains.delete(key);
      publish();
    }
    return 'succeeded';
  } catch (error) {
    if (error instanceof StaleFavoriteScopeError || (input.isActive && !input.isActive())) {
      if (sequences.get(key) === sequence) {
        states.delete(key);
        chains.delete(key);
        publish();
      }
      return 'stale';
    }
    if (sequences.get(key) === sequence) {
      states.set(key, { pending: false, desired: input.desired, error });
      chains.delete(key);
      publish();
    }
    return 'failed';
  }
}

export function clearFavoriteWriteError(scope: string, plantId: string) {
  const key = keyFor(scope, plantId);
  const current = states.get(key);
  if (!current) return;
  states.set(key, { pending: current.pending, desired: current.desired });
  publish();
}

export function resetFavoriteWritesForTests() {
  states.clear();
  chains.clear();
  sequences.clear();
  publish();
}
