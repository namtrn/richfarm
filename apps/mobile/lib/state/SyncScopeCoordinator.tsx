import { useEffect, useRef, type ReactNode } from 'react';
import { useMobileRuntime } from './mobileRuntimeStore';
import {
  beginSyncScope,
  publishSyncScopeError,
  publishSyncScopeSnapshot,
} from './syncScopeStore';
import { loadOutbox, subscribeSyncQueue } from '../sync/queue';
import {
  composeRenderedProjection,
  loadAuthoritativeProjection,
  subscribeAuthoritativeProjection,
} from '../sync/reconciliation';
import { cleanupManagedPlantPhotoOrphans } from '../photo/managedPlantPhotos';

export function SyncScopeCoordinator({ children }: { children: ReactNode }) {
  const scope = useMobileRuntime((state) => state.activeScope);
  const scopeToken = useMobileRuntime((state) => state.scopeToken);
  const appState = useMobileRuntime((state) => state.appState);
  const previousAppState = useRef(appState);

  useEffect(() => {
    beginSyncScope(scope, scopeToken);
    if (!scope) return;

    let active = true;
    let latestRequest = 0;
    const refresh = async () => {
      const request = ++latestRequest;
      try {
        const [authoritative, outbox] = await Promise.all([
          loadAuthoritativeProjection(scope),
          loadOutbox(scope),
        ]);
        if (!active || request !== latestRequest) return;
        publishSyncScopeSnapshot({
          scope,
          scopeToken,
          projection: composeRenderedProjection(scope, authoritative, outbox),
          outbox,
        });
        try {
          cleanupManagedPlantPhotoOrphans(scope, outbox);
        } catch {
          // Cleanup is recoverable and must never block durable state hydration.
        }
      } catch (error) {
        if (active && request === latestRequest) {
          publishSyncScopeError(scope, scopeToken, error);
        }
      }
    };

    void refresh();
    const unsubscribeProjection = subscribeAuthoritativeProjection(scope, () => void refresh());
    const unsubscribeQueue = subscribeSyncQueue(scope, () => void refresh());
    return () => {
      active = false;
      latestRequest += 1;
      unsubscribeProjection();
      unsubscribeQueue();
    };
  }, [scope, scopeToken]);

  useEffect(() => {
    const previous = previousAppState.current;
    previousAppState.current = appState;
    if (previous === 'active' || appState !== 'active') return;
    const currentScope = scope;
    const currentToken = scopeToken;
    if (!currentScope) return;
    void Promise.all([
      loadAuthoritativeProjection(currentScope),
      loadOutbox(currentScope),
    ]).then(([authoritative, outbox]) => {
      publishSyncScopeSnapshot({
        scope: currentScope,
        scopeToken: currentToken,
        projection: composeRenderedProjection(currentScope, authoritative, outbox),
        outbox,
      });
    }).catch((error) => {
      publishSyncScopeError(currentScope, currentToken, error);
    });
  }, [appState, scope, scopeToken]);

  return children;
}
