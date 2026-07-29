import AsyncStorage from '@react-native-async-storage/async-storage';

export type PreferencePatchOperation = {
  operationId: string;
  baseRevision: number;
  generation?: string;
  patch: {
    appMode?: string;
    unitSystem?: string;
    temperatureUnit?: 'C' | 'F';
    theme?: string;
    defaultView?: string;
    showWeatherCard?: boolean;
    emailNotifications?: boolean;
    pushNotifications?: boolean;
    shareAnonymousData?: boolean;
  };
  createdAt: number;
  attempts: number;
  acknowledgedRevision?: number;
};

let chain: Promise<void> = Promise.resolve();
const listeners = new Set<(scope: string, queue: PreferencePatchOperation[]) => void>();

function key(scope: string) {
  return `rf_preferences_outbox_v1_${encodeURIComponent(scope)}`;
}

export async function loadPreferenceQueue(scope: string): Promise<PreferencePatchOperation[]> {
  const raw = await AsyncStorage.getItem(key(scope));
  if (!raw) return [];
  try { return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : []; } catch { return []; }
}

async function update(scope: string, mutate: (queue: PreferencePatchOperation[]) => PreferencePatchOperation[]) {
  const run = async () => {
    const next = mutate(await loadPreferenceQueue(scope));
    await AsyncStorage.setItem(key(scope), JSON.stringify(next));
    for (const listener of listeners) listener(scope, next);
  };
  chain = chain.then(run, run);
  await chain;
}

export function subscribePreferenceQueue(
  scope: string,
  listener: (queue: PreferencePatchOperation[]) => void
) {
  const wrapped = (changedScope: string, queue: PreferencePatchOperation[]) => {
    if (changedScope === scope) listener(queue);
  };
  listeners.add(wrapped);
  return () => listeners.delete(wrapped);
}

export function applyPendingPreferencePatches<T extends Record<string, unknown>>(
  settings: T | null | undefined,
  queue: PreferencePatchOperation[]
): T | undefined {
  if (!settings && queue.length === 0) return settings ?? undefined;
  return queue.reduce(
    (current, operation) => ({ ...current, ...operation.patch }),
    { ...(settings ?? {}) } as T
  );
}

export async function enqueuePreferencePatch(scope: string, operation: PreferencePatchOperation) {
  await update(scope, (queue) => [...queue, operation]);
}

export async function removePreferencePatch(scope: string, operationId: string) {
  await update(scope, (queue) => queue.filter((item) => item.operationId !== operationId));
}

export async function acknowledgePreferencePatch(
  scope: string,
  operationId: string,
  acknowledgedRevision: number
) {
  await update(scope, (queue) => queue.map((item) =>
    item.operationId === operationId
      ? { ...item, acknowledgedRevision }
      : item
  ));
}

export function pruneAcknowledgedPreferencePatchesFromQueue(
  queue: PreferencePatchOperation[],
  remoteRevision: number
) {
  return queue.filter(
    (item) => item.acknowledgedRevision === undefined || item.acknowledgedRevision > remoteRevision
  );
}

export async function pruneAcknowledgedPreferencePatches(scope: string, remoteRevision: number) {
  await update(scope, (queue) => pruneAcknowledgedPreferencePatchesFromQueue(queue, remoteRevision));
}

export async function rebasePreferencePatch(scope: string, operationId: string, baseRevision: number, generation: string) {
  await update(scope, (queue) => queue.map((item) =>
    item.operationId === operationId
      ? { ...item, baseRevision, generation, attempts: item.attempts + 1 }
      : item
  ));
}

export async function setPreferencePatchGeneration(
  scope: string,
  operationId: string,
  generation: string
) {
  await update(scope, (queue) => queue.map((item) =>
    item.operationId === operationId ? { ...item, generation } : item
  ));
}
