import { useEffect, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../packages/convex/convex/_generated/api';
import { useDeviceId } from '../lib/deviceId';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';
import { useSessionScopedCacheKey } from '../lib/sessionCache';
import { useLocalSyncIdentity } from '../lib/sync/identity';
import {
  enqueuePreferencePatch,
  acknowledgePreferencePatch,
  applyPendingPreferencePatches,
  loadPreferenceQueue,
  pruneAcknowledgedPreferencePatches,
  rebasePreferencePatch,
  setPreferencePatchGeneration,
  subscribePreferenceQueue,
  type PreferencePatchOperation,
} from '../lib/sync/preferencesQueue';
import type { PreferencePatch } from '../lib/state/scopedPreferencesStore';

/** Root-only Convex/outbox adapter. Components consume the scoped preference store. */
export function useUserSettingsSource() {
  const { deviceId, isLoading: isDeviceLoading } = useDeviceId();
  const { identity } = useLocalSyncIdentity();
  const rawSettings = useQuery(
    api.userSettings.getUserSettings,
    deviceId && identity?.kind === 'account' ? { deviceId } : 'skip'
  );
  const { isKnown, isOffline } = useNetworkStatus();
  const shouldBypassRemote = isKnown && isOffline;
  const scope = identity?.scopeKey;
  const [pendingSnapshot, setPendingSnapshot] = useState<{
    scope: string | undefined;
    queue: PreferencePatchOperation[];
  }>({ scope: undefined, queue: [] });
  const pendingPreferences = pendingSnapshot.scope === scope ? pendingSnapshot.queue : [];

  useEffect(() => {
    if (!scope) {
      setPendingSnapshot({ scope: undefined, queue: [] });
      return;
    }
    let active = true;
    void loadPreferenceQueue(scope).then((queue) => {
      if (active) setPendingSnapshot({ scope, queue });
    });
    const unsubscribe = subscribePreferenceQueue(scope, (queue) => {
      setPendingSnapshot({ scope, queue });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [scope]);

  const cacheKey = useSessionScopedCacheKey('rf_user_settings_v2');
  const { cached, cacheLoaded, remoteResolved } = useQueryCache(cacheKey, rawSettings);
  const baseSettings = remoteResolved
    ? rawSettings
    : cached !== undefined
      ? cached
      : shouldBypassRemote
        ? null
        : undefined;
  const settings = applyPendingPreferencePatches(baseSettings, pendingPreferences);

  useEffect(() => {
    const remoteRevision = rawSettings?.revision;
    if (!scope || remoteRevision === undefined) return;
    if (!pendingPreferences.some((item) =>
      item.acknowledgedRevision !== undefined && item.acknowledgedRevision <= remoteRevision
    )) return;
    void pruneAcknowledgedPreferencePatches(scope, remoteRevision);
  }, [pendingPreferences, rawSettings?.revision, scope]);

  const applyPatch = useMutation(api.userSettings.applyPreferencesPatch);
  const ensureSyncSession = useMutation(api.syncV2.ensureSession);

  const updateSettings = async (args: PreferencePatch) => {
    if (!scope) throw new Error('preference_scope_unavailable');
    const operationId = `preferences:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    let generation = settings?.generation
      ?? (settings?.userId ? `preferences:${settings.userId}` : undefined);
    const operation = {
      operationId,
      baseRevision: settings?.revision ?? 0,
      generation,
      patch: args,
      createdAt: Date.now(),
      attempts: 0,
    };
    await enqueuePreferencePatch(scope, operation);
    if (identity?.kind === 'guest') return operationId;
    if (!generation) {
      try {
        const serverSession = await ensureSyncSession({ deviceId });
        generation = serverSession?.userId ? `preferences:${serverSession.userId}` : undefined;
        if (generation) {
          await setPreferencePatchGeneration(scope, operationId, generation);
        }
      } catch {
        return operationId;
      }
    }
    if (!generation) return operationId;
    try {
      let result = await applyPatch({
        deviceId,
        operationId,
        baseRevision: operation.baseRevision,
        generation,
        patch: args,
      });
      if (result.status === 'revision_conflict') {
        await rebasePreferencePatch(scope, operationId, result.revision, generation);
        result = await applyPatch({
          deviceId,
          operationId,
          baseRevision: result.revision,
          generation,
          patch: args,
        });
      }
      if (result.status === 'applied' || result.status === 'already_applied') {
        await acknowledgePreferencePatch(scope, operationId, result.revision);
      }
      return result;
    } catch {
      return operationId;
    }
  };

  return {
    scope,
    settings,
    updateSettings,
    isLoading: isDeviceLoading || !identity || (settings === undefined && !cacheLoaded),
  };
}
