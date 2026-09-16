import type { ProjectionEnvelope } from './reconciliation';

type ScopedLoader<T> = (scope: string) => Promise<T>;

export type ScopedProjectionSnapshot = {
  scope: string | undefined;
  projection: ProjectionEnvelope | null;
  loaded: boolean;
};

export function selectProjectionSnapshotForScope(
  snapshot: ScopedProjectionSnapshot,
  scope: string | undefined
): ScopedProjectionSnapshot {
  return snapshot.scope === scope
    ? snapshot
    : { scope, projection: null, loaded: false };
}

/**
 * Owns the lifecycle of async rendered-projection reads for one captured scope.
 * A disposed scope and every superseded read are forbidden from publishing.
 */
export function createScopedProjectionLoader<T = ProjectionEnvelope | null>(
  scope: string,
  load: ScopedLoader<T>,
  commit: (value: T) => void,
  options: {
    accepts?: (value: T, scope: string) => boolean;
    onError?: (error: unknown) => void;
  } = {},
) {
  let active = true;
  let latestRequest = 0;

  const reload = async () => {
    const request = ++latestRequest;
    try {
      const value = await load(scope);
      if (!active || request !== latestRequest) return false;
      if (options.accepts && !options.accepts(value, scope)) return false;
      commit(value);
      return true;
    } catch (error) {
      if (!active || request !== latestRequest) return false;
      options.onError?.(error);
      return false;
    }
  };

  const dispose = () => {
    active = false;
    latestRequest++;
  };

  return { reload, dispose };
}
