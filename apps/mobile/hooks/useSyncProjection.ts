import { useCallback, useEffect, useState } from 'react';
import { useLocalSyncIdentity } from '../lib/sync/identity';
import { subscribeSyncQueue } from '../lib/sync/queue';
import {
  loadRenderedProjection,
  subscribeAuthoritativeProjection,
  type ProjectionEnvelope,
} from '../lib/sync/reconciliation';
import type { EntityType } from '../lib/sync/types';

export function useSyncProjection() {
  const { identity } = useLocalSyncIdentity();
  const scope = identity?.scopeKey;
  const [projection, setProjection] = useState<ProjectionEnvelope | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    if (!scope) {
      setProjection(null);
      setLoaded(true);
      return;
    }
    void loadRenderedProjection(scope).then((next) => {
      setProjection(next);
      setLoaded(true);
    });
  }, [scope]);

  useEffect(() => {
    setLoaded(false);
    reload();
    if (!scope) return;
    const unsubscribeProjection = subscribeAuthoritativeProjection(scope, reload);
    const unsubscribeQueue = subscribeSyncQueue(scope, reload);
    return () => {
      unsubscribeProjection();
      unsubscribeQueue();
    };
  }, [reload, scope]);

  const entities = useCallback((type: EntityType) => (
    projection ? Object.values(projection.entities[type]) : undefined
  ), [projection]);

  return { projection, entities, identity, isLoading: !loaded };
}
