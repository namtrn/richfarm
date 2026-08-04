import AsyncStorage from '@react-native-async-storage/async-storage';
import { operationFingerprint } from './fingerprint';
import { SyncAction } from './types';

const LEGACY_STORAGE_KEY = 'rf_sync_queue_v1';
const STORAGE_PREFIX = 'rf_sync_outbox_v2_';
const RECOVERY_STORAGE_PREFIX = 'rf_sync_outbox_recovery_v2_';
const queueListeners = new Set<(scope: string, queue: SyncAction[]) => void>();
let writeChain: Promise<void> = Promise.resolve();

export type OutboxRecoveryReason =
  | 'malformed_json'
  | 'unsupported_version'
  | 'scope_mismatch'
  | 'malformed_envelope'
  | 'malformed_legacy_queue';

export type OutboxRecovery = {
  reason: OutboxRecoveryReason;
  rawStorageKey: string;
  detectedAt: number;
};

export type OutboxEnvelope = {
  version: 2;
  scope: string;
  syncGeneration?: string;
  operations: SyncAction[];
  quarantine: SyncAction[];
  needsAttention?: boolean;
  recovery?: OutboxRecovery;
};

function safeScope(scope?: string) {
  return scope?.trim() || 'legacy-quarantine';
}

function storageKey(scope?: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(safeScope(scope))}`;
}

export function getSyncRecoveryStorageKey(scope?: string) {
  return `${RECOVERY_STORAGE_PREFIX}${encodeURIComponent(safeScope(scope))}`;
}

function emptyEnvelope(scope?: string): OutboxEnvelope {
  return { version: 2, scope: safeScope(scope), operations: [], quarantine: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSyncAction(value: unknown): value is SyncAction {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.type === 'string'
    && isRecord(value.payload)
    && typeof value.createdAt === 'number'
    && Number.isFinite(value.createdAt)
    && typeof value.attempts === 'number'
    && Number.isInteger(value.attempts)
    && value.attempts >= 0;
}

function parseQueue(value: unknown): SyncAction[] | null {
  if (!Array.isArray(value) || !value.every(isSyncAction)) return null;
  return value;
}

function parseRecovery(value: unknown): OutboxRecovery | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.reason !== 'string'
    || typeof value.rawStorageKey !== 'string'
    || typeof value.detectedAt !== 'number'
  ) return undefined;
  return {
    reason: value.reason as OutboxRecoveryReason,
    rawStorageKey: value.rawStorageKey,
    detectedAt: value.detectedAt,
  };
}

type ParsedEnvelope = {
  envelope: OutboxEnvelope;
  corrupt?: { raw: string; reason: OutboxRecoveryReason };
};

function recoveryEnvelope(scope: string, reason: OutboxRecoveryReason): OutboxEnvelope {
  return {
    ...emptyEnvelope(scope),
    needsAttention: true,
    recovery: {
      reason,
      rawStorageKey: getSyncRecoveryStorageKey(scope),
      detectedAt: Date.now(),
    },
  };
}

function parseEnvelope(raw: string | null, scope?: string): ParsedEnvelope {
  const normalizedScope = safeScope(scope);
  if (!raw) return { envelope: emptyEnvelope(normalizedScope) };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return { envelope: recoveryEnvelope(normalizedScope, 'malformed_envelope'), corrupt: { raw, reason: 'malformed_envelope' } };
    }
    if (parsed.version !== 2) {
      return { envelope: recoveryEnvelope(normalizedScope, 'unsupported_version'), corrupt: { raw, reason: 'unsupported_version' } };
    }
    if (parsed.scope !== normalizedScope) {
      return { envelope: recoveryEnvelope(normalizedScope, 'scope_mismatch'), corrupt: { raw, reason: 'scope_mismatch' } };
    }
    const operations = parseQueue(parsed.operations);
    const quarantine = parseQueue(parsed.quarantine);
    if (!operations || !quarantine) {
      return { envelope: recoveryEnvelope(normalizedScope, 'malformed_envelope'), corrupt: { raw, reason: 'malformed_envelope' } };
    }
    const recovery = parseRecovery(parsed.recovery);
    return {
      envelope: {
        version: 2,
        scope: normalizedScope,
        syncGeneration: typeof parsed.syncGeneration === 'string' ? parsed.syncGeneration : undefined,
        operations,
        quarantine,
        needsAttention: parsed.needsAttention === true || Boolean(recovery),
        recovery,
      },
    };
  } catch {
    return { envelope: recoveryEnvelope(normalizedScope, 'malformed_json'), corrupt: { raw, reason: 'malformed_json' } };
  }
}

async function persistCorruptPayload(
  scope: string,
  raw: string,
  reason: OutboxRecoveryReason,
): Promise<OutboxEnvelope> {
  const envelope = recoveryEnvelope(scope, reason);
  await AsyncStorage.setItem(envelope.recovery!.rawStorageKey, raw);
  await AsyncStorage.setItem(storageKey(scope), JSON.stringify(envelope));
  // Hydration may already be subscribed when a later read discovers corruption.
  // Notify it without exposing the corrupt data as executable operations.
  notifyQueueListeners(scope, []);
  return envelope;
}

async function readEnvelope(scope?: string) {
  const normalizedScope = safeScope(scope);
  const parsed = parseEnvelope(await AsyncStorage.getItem(storageKey(normalizedScope)), normalizedScope);
  if (!parsed.corrupt) return parsed.envelope;
  return persistCorruptPayload(normalizedScope, parsed.corrupt.raw, parsed.corrupt.reason);
}

function notifyQueueListeners(scope: string, queue: SyncAction[]) {
  for (const listener of queueListeners) listener(scope, queue);
}

async function serializedUpdate(
  scope: string | undefined,
  update: (envelope: OutboxEnvelope) => OutboxEnvelope
) {
  let result: OutboxEnvelope | null = null;
  const run = async () => {
    const current = await readEnvelope(scope);
    const updated = update(current);
    // A caller must not be able to clear a durable recovery marker merely by
    // appending or rewriting the queue. Recovery is cleared only by an explicit
    // namespace deletion or a future recovery workflow.
    const next = current.needsAttention
      ? {
          ...updated,
          version: 2 as const,
          scope: current.scope,
          needsAttention: true,
          recovery: current.recovery,
        }
      : {
          ...updated,
          version: 2 as const,
          scope: current.scope,
        };
    await AsyncStorage.setItem(storageKey(scope), JSON.stringify(next));
    result = next;
    notifyQueueListeners(next.scope, next.operations);
  };
  writeChain = writeChain.then(run, run);
  await writeChain;
  return result!;
}

export async function updateOutbox(
  scope: string,
  update: (envelope: OutboxEnvelope) => OutboxEnvelope
): Promise<OutboxEnvelope> {
  return await serializedUpdate(scope, update);
}

export function subscribeSyncQueue(
  scope: string | undefined,
  listener: (queue: SyncAction[]) => void
) {
  const normalizedScope = safeScope(scope);
  const wrapped = (changedScope: string, queue: SyncAction[]) => {
    if (changedScope === normalizedScope) listener(queue);
  };
  queueListeners.add(wrapped);
  return () => queueListeners.delete(wrapped);
}

export async function loadSyncQueue(scope?: string): Promise<SyncAction[]> {
  return (await readEnvelope(scope)).operations;
}

export async function loadOutbox(scope?: string): Promise<OutboxEnvelope> {
  return await readEnvelope(scope);
}

export async function setSyncGeneration(generation: string, scope?: string): Promise<void> {
  await serializedUpdate(scope, (envelope) => ({ ...envelope, syncGeneration: generation }));
}

export async function quarantineSyncAction(id: string, reason: string, scope?: string): Promise<void> {
  await serializedUpdate(scope, (envelope) => {
    const target = envelope.operations.find((item) => item.id === id);
    if (!target) return envelope;
    return {
      ...envelope,
      operations: envelope.operations.filter((item) => item.id !== id),
      quarantine: [...envelope.quarantine, { ...target, lastError: reason }],
    };
  });
}

export async function updateSyncActionPayload(
  id: string,
  payload: SyncAction['payload'],
  scope?: string
): Promise<void> {
  await serializedUpdate(scope, (envelope) => ({
    ...envelope,
    operations: envelope.operations.map((item) => item.id === id ? { ...item, payload } : item),
  }));
}

export async function saveSyncQueue(queue: SyncAction[], scope?: string): Promise<void> {
  await serializedUpdate(scope, (envelope) => ({ ...envelope, operations: queue }));
}

export async function enqueueSyncAction(action: SyncAction, scope?: string): Promise<void> {
  await enqueueSyncActions([action], scope);
}

export async function enqueueSyncActions(actions: SyncAction[], scope?: string): Promise<void> {
  if (actions.length === 0) return;
  await serializedUpdate(scope, (envelope) => {
    const operations = [...envelope.operations];
    const quarantine = [...envelope.quarantine];
    const quarantineKeys = new Set(
      quarantine.map((item) => `${item.id}:${operationFingerprint(item)}`),
    );

    const quarantineConflict = (action: SyncAction) => {
      const key = `${action.id}:${operationFingerprint(action)}`;
      if (quarantineKeys.has(key)) return;
      quarantine.push({ ...action, lastError: 'batch_operation_conflict' });
      quarantineKeys.add(key);
    };

    for (const action of actions) {
      const existingIndex = operations.findIndex((item) => item.id === action.id);
      if (existingIndex >= 0) {
        const existing = operations[existingIndex]!;
        if (operationFingerprint(existing) === operationFingerprint(action)) {
          // Retry metadata may legitimately change while the logical operation
          // remains identical, so retain the latest identical copy.
          operations[existingIndex] = action;
        } else {
          // Never replace the durable active operation with an ambiguous copy.
          quarantineConflict(action);
        }
        continue;
      }

      const quarantined = quarantine.find((item) => item.id === action.id);
      if (quarantined) {
        if (operationFingerprint(quarantined) !== operationFingerprint(action)) {
          quarantineConflict(action);
        }
        continue;
      }
      operations.push(action);
    }

    return { ...envelope, operations, quarantine };
  });
}

export async function removeSyncActions(ids: string[], scope?: string): Promise<void> {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  await serializedUpdate(scope, (envelope) => ({
    ...envelope,
    operations: envelope.operations.filter((item) => !idSet.has(item.id)),
  }));
}

export async function removePendingPlantEntry(
  type: 'activity' | 'harvest' | 'photo',
  plantId: string,
  localId: string,
  scope?: string
): Promise<void> {
  await serializedUpdate(scope, (envelope) => ({
    ...envelope,
    operations: envelope.operations.filter((item) => {
      if (item.type !== type || item.plantId !== plantId) return true;
      return (item.payload as { localId?: string }).localId !== localId;
    }),
  }));
}

export async function markSyncAttempt(id: string, error?: string, scope?: string): Promise<void> {
  await serializedUpdate(scope, (envelope) => ({
    ...envelope,
    operations: envelope.operations.map((item) =>
      item.id === id
        ? {
            ...item,
            attempts: item.attempts + 1,
            lastError: error,
            nextAttemptAt: Date.now() + Math.min(5 * 60_000, 1_000 * 2 ** Math.min(item.attempts, 8))
              + Math.floor(Math.random() * 500),
          }
        : item
    ),
  }));
}

export async function quarantineLegacyQueue(): Promise<number> {
  const raw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return 0;
  let legacy: SyncAction[] | null;
  try {
    legacy = parseQueue(JSON.parse(raw));
  } catch {
    legacy = null;
  }
  if (!legacy) {
    await persistCorruptPayload(safeScope(), raw, 'malformed_legacy_queue');
    // Keep the legacy key until a recovery workflow has preserved/inspected it.
    return 0;
  }
  if (legacy.length > 0) {
    await serializedUpdate(undefined, (envelope) => ({
      ...envelope,
      quarantine: [...envelope.quarantine, ...legacy],
    }));
  }
  await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
  return legacy.length;
}

export async function clearSyncNamespace(scope: string): Promise<void> {
  const encoded = encodeURIComponent(safeScope(scope));
  // Scope deletion participates in the same serialized chain as enqueue and
  // retry writes. Without this, an in-flight write can recreate an account's
  // outbox immediately after logout/account deletion.
  const run = async () => {
    await Promise.all([
      AsyncStorage.removeItem(`${STORAGE_PREFIX}${encoded}`),
      AsyncStorage.removeItem(`${RECOVERY_STORAGE_PREFIX}${encoded}`),
      AsyncStorage.removeItem(`rf_sync_projection_v1_${encoded}`),
      AsyncStorage.removeItem(`rf_preferences_outbox_v1_${encoded}`),
    ]);
    notifyQueueListeners(safeScope(scope), []);
  };
  writeChain = writeChain.then(run, run);
  await writeChain;
}
