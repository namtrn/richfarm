import { useCallback } from 'react';
import type { EntityType } from '../lib/sync/types';
import { useMobileRuntime } from '../lib/state/mobileRuntimeStore';
import { useSyncScope, useSyncScopeEntities } from '../lib/state/syncScopeStore';

export function useSyncProjection() {
  const identity = useMobileRuntime((state) => state.identity);
  const activeScope = useMobileRuntime((state) => state.activeScope);
  const storeScope = useSyncScope((state) => state.scope);
  const storedProjection = useSyncScope((state) => state.projection);
  const hydration = useSyncScope((state) => state.hydration);
  const projection = activeScope === storeScope ? storedProjection : null;

  const entities = useCallback((type: EntityType) => (
    projection ? Object.values(projection.entities[type]) : undefined
  ), [projection]);

  return {
    projection,
    entities,
    identity,
    isLoading: activeScope !== storeScope || hydration === 'loading',
  };
}

export function useSyncProjectionEntities(type: EntityType) {
  const activeScope = useMobileRuntime((state) => state.activeScope);
  const storeScope = useSyncScope((state) => state.scope);
  const entities = useSyncScopeEntities(type);
  return activeScope === storeScope ? entities : [];
}

export function useSyncProjectionMeta() {
  const identity = useMobileRuntime((state) => state.identity);
  const activeScope = useMobileRuntime((state) => state.activeScope);
  const storeScope = useSyncScope((state) => state.scope);
  const hasProjection = useSyncScope((state) => state.projection !== null);
  const isComplete = useSyncScope((state) => state.projection?.complete === true);
  const hydration = useSyncScope((state) => state.hydration);
  const visible = activeScope === storeScope;
  return {
    identity,
    hasProjection: visible && hasProjection,
    isComplete: visible && isComplete,
    isLoading: !visible || hydration === 'loading',
  };
}
