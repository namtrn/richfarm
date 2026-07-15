import AsyncStorage from '@react-native-async-storage/async-storage';

export type PreferencePatchOperation = {
  operationId: string;
  baseRevision: number;
  generation?: string;
  patch: {
    appMode?: string;
    unitSystem?: string;
    theme?: string;
    defaultView?: string;
    showWeatherCard?: boolean;
    emailNotifications?: boolean;
    pushNotifications?: boolean;
    shareAnonymousData?: boolean;
  };
  createdAt: number;
  attempts: number;
};

let chain: Promise<void> = Promise.resolve();

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
  };
  chain = chain.then(run, run);
  await chain;
}

export async function enqueuePreferencePatch(scope: string, operation: PreferencePatchOperation) {
  await update(scope, (queue) => [...queue, operation]);
}

export async function removePreferencePatch(scope: string, operationId: string) {
  await update(scope, (queue) => queue.filter((item) => item.operationId !== operationId));
}

export async function rebasePreferencePatch(scope: string, operationId: string, baseRevision: number, generation: string) {
  await update(scope, (queue) => queue.map((item) =>
    item.operationId === operationId
      ? { ...item, baseRevision, generation, attempts: item.attempts + 1 }
      : item
  ));
}
