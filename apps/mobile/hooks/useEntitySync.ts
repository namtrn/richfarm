import { useCallback } from 'react';
import { authClient } from '../lib/auth-client';
import { useDeviceId } from '../lib/deviceId';
import { enqueueSyncAction } from '../lib/sync/queue';
import type { EntityOperationPayload } from '../lib/sync/types';
import { useSyncExecutor } from '../lib/sync/useSyncExecutor';

function uuid(prefix: string) {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
}

export function useEntitySync() {
  const { deviceId } = useDeviceId();
  const { data: session } = authClient.useSession();
  const { execute } = useSyncExecutor();
  const scope = deviceId ? `${deviceId}:${session?.user?.id ?? 'guest'}` : undefined;

  const queueOperation = useCallback(async (
    operation: Omit<EntityOperationPayload, 'operationId' | 'entityUuid'> & {
      operationId?: string;
      entityUuid?: string;
    }
  ) => {
    if (!scope) throw new Error('sync_scope_unavailable');
    const operationId = operation.operationId ?? uuid('operation');
    const entityUuid = operation.entityUuid ?? uuid(operation.entityType);
    const payload: EntityOperationPayload = { ...operation, operationId, entityUuid };
    await enqueueSyncAction({
      id: operationId,
      type: 'entity',
      payload,
      createdAt: Date.now(),
      attempts: 0,
    }, scope);
    void execute({ types: ['entity'] });
    return { operationId, entityUuid };
  }, [execute, scope]);

  return { queueOperation };
}
