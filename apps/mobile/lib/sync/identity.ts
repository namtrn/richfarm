import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMobileRuntime } from '../state/mobileRuntimeStore';

const GUEST_DATASET_KEY = 'rf_guest_dataset_id_v1';
const identityListeners = new Set<() => void>();
let guestDatasetPromise: Promise<string> | null = null;

export type LocalSyncIdentity =
  | {
      kind: 'guest';
      installationId: string;
      guestDatasetId: string;
      scopeKey: `guest:v1:${string}:${string}`;
    }
  | {
      kind: 'account';
      installationId: string;
      accountUserId: string;
      scopeKey: `account:v1:${string}:${string}`;
    };

function localUuid(prefix: string) {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 14)}`;
}

export function guestScopeKey(installationId: string, guestDatasetId: string) {
  return `guest:v1:${installationId}:${guestDatasetId}` as const;
}

export function accountScopeKey(installationId: string, accountUserId: string) {
  return `account:v1:${installationId}:${accountUserId}` as const;
}

export async function loadOrCreateGuestDatasetId(): Promise<string> {
  if (!guestDatasetPromise) {
    guestDatasetPromise = (async () => {
      const existing = await AsyncStorage.getItem(GUEST_DATASET_KEY);
      if (existing?.trim()) return existing;
      const created = localUuid('guest');
      await AsyncStorage.setItem(GUEST_DATASET_KEY, created);
      return created;
    })().finally(() => {
      guestDatasetPromise = null;
    });
  }
  return guestDatasetPromise;
}

export async function resolveLocalSyncIdentity(
  installationId: string,
  accountUserId?: string | null
): Promise<LocalSyncIdentity> {
  const normalizedUserId = accountUserId?.trim();
  if (normalizedUserId) {
    return {
      kind: 'account',
      installationId,
      accountUserId: normalizedUserId,
      scopeKey: accountScopeKey(installationId, normalizedUserId),
    };
  }
  const guestDatasetId = await loadOrCreateGuestDatasetId();
  return {
    kind: 'guest',
    installationId,
    guestDatasetId,
    scopeKey: guestScopeKey(installationId, guestDatasetId),
  };
}

export async function rotateGuestDatasetId(expectedCurrentId: string): Promise<string> {
  const current = await AsyncStorage.getItem(GUEST_DATASET_KEY);
  if (current && current !== expectedCurrentId) return current;
  const next = localUuid('guest');
  await AsyncStorage.setItem(GUEST_DATASET_KEY, next);
  for (const listener of identityListeners) listener();
  return next;
}

export function subscribeLocalSyncIdentityInvalidation(listener: () => void) {
  identityListeners.add(listener);
  return () => {
    identityListeners.delete(listener);
  };
}

export function useLocalSyncIdentity() {
  const identity = useMobileRuntime((state) => state.identity);
  return { identity, isLoading: !identity };
}
