import { useCallback } from 'react';
import { useLocalSyncIdentity } from '../lib/sync/identity';
import { enqueueForIdentity } from '../lib/sync/guestClaim';
import type { EntityOperationPayload } from '../lib/sync/types';
import { useSyncExecutor } from '../lib/sync/useSyncExecutor';

function uuid(prefix: string) {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
}

export function useEntitySync() {
  const { identity } = useLocalSyncIdentity();
  const { execute } = useSyncExecutor();
  const scope = identity?.scopeKey;

  const queueOperation = useCallback(async (
    operation: Omit<EntityOperationPayload, 'operationId' | 'entityUuid'> & {
      operationId?: string;
      entityUuid?: string;
    }
  ) => {
    if (!scope || !identity) throw new Error('sync_scope_unavailable');
    const operationId = operation.operationId ?? uuid('operation');
    const entityUuid = operation.entityUuid ?? uuid(operation.entityType);
    const payload: EntityOperationPayload = { ...operation, operationId, entityUuid };
    await enqueueForIdentity(identity, {
      id: operationId,
      type: 'entity',
      payload,
      createdAt: Date.now(),
      attempts: 0,
    });
    if (identity?.kind === 'account') void execute({ types: ['entity'] });
    return { operationId, entityUuid };
  }, [execute, identity?.kind, scope]);

  return { queueOperation };
}
