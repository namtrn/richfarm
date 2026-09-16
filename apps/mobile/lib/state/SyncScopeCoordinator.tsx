import { useEffect, useRef, type ReactNode } from 'react';
import { useMobileRuntime } from './mobileRuntimeStore';
import { beginSyncScope } from './syncScopeStore';
import { createSyncScopeLifecycle } from './syncScopeController';
import { publishSyncScopeError, publishSyncScopeSnapshot } from './syncScopeStore';
import { loadOutbox, subscribeSyncQueue } from '../sync/queue';
import { loadAuthoritativeProjection, subscribeAuthoritativeProjection } from '../sync/reconciliation';
import { cleanupManagedPlantPhotoOrphans } from '../photo/managedPlantPhotos';

export function SyncScopeCoordinator({ children }: { children: ReactNode }) {
  const scope = useMobileRuntime((state) => state.activeScope);
  const scopeToken = useMobileRuntime((state) => state.scopeToken);
  const appState = useMobileRuntime((state) => state.appState);
  const lifecycle = useRef<ReturnType<typeof createSyncScopeLifecycle> | null>(null);
  if (!lifecycle.current) {
    lifecycle.current = createSyncScopeLifecycle({
      loadProjection: loadAuthoritativeProjection,
      loadQueue: loadOutbox,
      subscribeProjection: subscribeAuthoritativeProjection,
      subscribeQueue: subscribeSyncQueue,
      publishSnapshot: publishSyncScopeSnapshot,
      publishError: publishSyncScopeError,
      cleanupPhotos: cleanupManagedPlantPhotoOrphans,
    }, appState);
  }

  useEffect(() => {
    beginSyncScope(scope, scopeToken);
    lifecycle.current?.activate(scope, scopeToken);
  }, [scope, scopeToken]);

  useEffect(() => {
    lifecycle.current?.handleAppState(appState);
  }, [appState]);

  useEffect(() => () => lifecycle.current?.dispose(), []);

  return children;
}
