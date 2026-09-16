import { createScopedProjectionLoader } from '../sync/projectionLoadGuard';
import type { OutboxEnvelope } from '../sync/queue';
import {
  composeRenderedProjection,
  type ProjectionEnvelope,
} from '../sync/reconciliation';

type SyncScopeSnapshot = { projection: ProjectionEnvelope | null; outbox: OutboxEnvelope };

export type SyncScopeControllerDependencies = {
  loadProjection: (scope: string) => Promise<ProjectionEnvelope | null>;
  loadQueue: (scope: string) => Promise<OutboxEnvelope>;
  subscribeProjection: (scope: string, callback: () => void) => () => void;
  subscribeQueue: (scope: string, callback: () => void) => () => void;
  publishSnapshot: (input: SyncScopeSnapshot & { scope: string; scopeToken: string }) => boolean;
  publishError: (scope: string, scopeToken: string, error: unknown) => boolean;
  cleanupPhotos: (scope: string, outbox: OutboxEnvelope) => void;
};

export function createSyncScopeController(
  scope: string,
  scopeToken: string,
  dependencies: SyncScopeControllerDependencies,
) {
  const loader = createScopedProjectionLoader<SyncScopeSnapshot>(
    scope,
    async (capturedScope) => {
      const [authoritative, outbox] = await Promise.all([
        dependencies.loadProjection(capturedScope),
        dependencies.loadQueue(capturedScope),
      ]);
      return { projection: composeRenderedProjection(capturedScope, authoritative, outbox), outbox };
    },
    (snapshot) => {
      if (!dependencies.publishSnapshot({ scope, scopeToken, ...snapshot })) return;
      try {
        dependencies.cleanupPhotos(scope, snapshot.outbox);
      } catch {
        // Cleanup is recoverable and must never block durable state hydration.
      }
    },
    {
      accepts: (snapshot) => !snapshot.projection || snapshot.projection.scope === scope,
      onError: (error) => { dependencies.publishError(scope, scopeToken, error); },
    },
  );
  const reload = () => loader.reload();
  const unsubscribeProjection = dependencies.subscribeProjection(scope, () => { void reload(); });
  const unsubscribeQueue = dependencies.subscribeQueue(scope, () => { void reload(); });
  void reload();
  return {
    foregroundRefresh: reload,
    dispose: () => {
      loader.dispose();
      unsubscribeProjection();
      unsubscribeQueue();
    },
  };
}

export function createSyncScopeLifecycle(
  dependencies: SyncScopeControllerDependencies,
  initialAppState: string,
) {
  let controller: ReturnType<typeof createSyncScopeController> | null = null;
  let previousAppState = initialAppState;
  return {
    activate(scope: string | null, scopeToken: string) {
      controller?.dispose();
      controller = scope ? createSyncScopeController(scope, scopeToken, dependencies) : null;
    },
    handleAppState(nextAppState: string) {
      const shouldRefresh = previousAppState !== 'active' && nextAppState === 'active';
      previousAppState = nextAppState;
      if (shouldRefresh) void controller?.foregroundRefresh();
    },
    dispose() {
      controller?.dispose();
      controller = null;
    },
  };
}
