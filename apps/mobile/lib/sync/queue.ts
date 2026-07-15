import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncAction } from './types';

const LEGACY_STORAGE_KEY = 'rf_sync_queue_v1';
const STORAGE_PREFIX = 'rf_sync_outbox_v2_';
const queueListeners = new Set<(scope: string, queue: SyncAction[]) => void>();
let writeChain: Promise<void> = Promise.resolve();

export type OutboxEnvelope = {
  version: 2;
  scope: string;
  syncGeneration?: string;
  operations: SyncAction[];
  quarantine: SyncAction[];
};

function safeScope(scope?: string) {
  return scope?.trim() || 'legacy-quarantine';
}

function storageKey(scope?: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(safeScope(scope))}`;
}

function normalizeQueue(value: unknown): SyncAction[] {
  return Array.isArray(value) ? (value as SyncAction[]) : [];
}

function parseEnvelope(raw: string | null, scope?: string): OutboxEnvelope {
  const normalizedScope = safeScope(scope);
  if (!raw) return { version: 2, scope: normalizedScope, operations: [], quarantine: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<OutboxEnvelope>;
    if (parsed.version !== 2 || parsed.scope !== normalizedScope) {
      return { version: 2, scope: normalizedScope, operations: [], quarantine: [] };
    }
    return {
      version: 2,
      scope: normalizedScope,
      syncGeneration: parsed.syncGeneration,
      operations: normalizeQueue(parsed.operations),
      quarantine: normalizeQueue(parsed.quarantine),
    };
  } catch {
    return { version: 2, scope: normalizedScope, operations: [], quarantine: [] };
  }
}

async function readEnvelope(scope?: string) {
  return parseEnvelope(await AsyncStorage.getItem(storageKey(scope)), scope);
}

function notifyQueueListeners(scope: string, queue: SyncAction[]) {
  for (const listener of queueListeners) listener(scope, queue);
}

async function serializedUpdate(
  scope: string | undefined,
  update: (envelope: OutboxEnvelope) => OutboxEnvelope
) {
  let result: SyncAction[] = [];
  const run = async () => {
    const next = update(await readEnvelope(scope));
    await AsyncStorage.setItem(storageKey(scope), JSON.stringify(next));
    result = next.operations;
    notifyQueueListeners(next.scope, next.operations);
  };
  writeChain = writeChain.then(run, run);
  await writeChain;
  return result;
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
  await serializedUpdate(scope, (envelope) => ({
    ...envelope,
    operations: [...envelope.operations, action],
  }));
}

export async function enqueueSyncActions(actions: SyncAction[], scope?: string): Promise<void> {
  await serializedUpdate(scope, (envelope) => ({
    ...envelope,
    operations: [...envelope.operations, ...actions],
  }));
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
  const legacy = (() => {
    try { return normalizeQueue(JSON.parse(raw)); } catch { return []; }
  })();
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
  await Promise.all([
    AsyncStorage.removeItem(`${STORAGE_PREFIX}${encoded}`),
    AsyncStorage.removeItem(`rf_sync_projection_v1_${encoded}`),
    AsyncStorage.removeItem(`rf_preferences_outbox_v1_${encoded}`),
  ]);
  notifyQueueListeners(safeScope(scope), []);
}
