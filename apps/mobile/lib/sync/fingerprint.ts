import type { EntityOperationPayload, SyncAction } from './types';

/**
 * Stable JSON used for local duplicate detection and guest-claim conflict checks.
 * Retry metadata is intentionally excluded: it does not change the operation.
 */
export function stable(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
}

export function operationFingerprint(action: SyncAction): string {
  if (action.type === 'entity') {
    const payload = action.payload as EntityOperationPayload;
    return stable({
      entityType: payload.entityType,
      entityUuid: payload.entityUuid,
      operationType: payload.operationType,
      baseRevision: payload.baseRevision,
      parentRefs: payload.parentRefs,
      payload: payload.payload,
    });
  }
  return stable({ type: action.type, plantId: action.plantId, payload: action.payload });
}
