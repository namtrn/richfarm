import type { ProjectionEnvelope } from './reconciliation';

type ProjectionLoader = (scope: string) => Promise<ProjectionEnvelope | null>;

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
export function createScopedProjectionLoader(
  scope: string,
  load: ProjectionLoader,
  commit: (projection: ProjectionEnvelope | null) => void
) {
  let active = true;
  let latestRequest = 0;

  const reload = async () => {
    const request = ++latestRequest;
    const projection = await load(scope);
    if (!active || request !== latestRequest) return false;
    if (projection && projection.scope !== scope) return false;
    commit(projection);
    return true;
  };

  const dispose = () => {
    active = false;
    latestRequest++;
  };

  return { reload, dispose };
}
