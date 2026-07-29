import { useCallback, useEffect, useRef } from 'react';
import { useSyncExecutor } from '../lib/sync/useSyncExecutor';
import { useQuery } from 'convex/react';
import { api } from '../../../packages/convex/convex/_generated/api';
import { useDeviceId } from '../lib/deviceId';
import { useLocalSyncIdentity } from '../lib/sync/identity';
import { useMobileRuntime } from '../lib/state/mobileRuntimeStore';
import { getSyncRetryDelay } from '../lib/sync/syncTriggerPolicy';

const MIN_ATTEMPT_INTERVAL_MS = 15000;

export function useSyncTriggers(enabled: boolean = true) {
  const lastAttemptRef = useRef(0);
  const inflightRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptSyncRef = useRef<() => void>(() => undefined);
  const enabledRef = useRef(enabled);
  const { execute } = useSyncExecutor();
  const { deviceId } = useDeviceId();
  const { identity } = useLocalSyncIdentity();
  const network = useMobileRuntime((state) => state.network);
  const appState = useMobileRuntime((state) => state.appState);
  const signal = useQuery(
    api.syncV2.syncSignal,
    enabled && deviceId && identity?.kind === 'account' ? { deviceId } : 'skip'
  );
  const lastSignalRef = useRef<string | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const attemptSync = useCallback(async () => {
    if (!enabledRef.current || inflightRef.current) return;
    const now = Date.now();
    const retryDelay = getSyncRetryDelay(lastAttemptRef.current, now, MIN_ATTEMPT_INTERVAL_MS);
    if (retryDelay > 0) {
      if (!retryTimerRef.current) {
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          attemptSyncRef.current();
        }, retryDelay);
      }
      return;
    }

    inflightRef.current = true;
    try {
      await execute();
      lastAttemptRef.current = Date.now();
    } finally {
      inflightRef.current = false;
    }
  }, [execute]);
  attemptSyncRef.current = () => { void attemptSync(); };

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  useEffect(() => {
    if (enabledRef.current) {
      attemptSync();
    }
  }, [attemptSync]);

  useEffect(() => {
    if (!enabled || !signal) return;
    const key = `${signal.generation}:${signal.sequence}`;
    if (lastSignalRef.current === null) {
      lastSignalRef.current = key;
      return;
    }
    if (lastSignalRef.current !== key) {
      lastSignalRef.current = key;
      void execute();
    }
  }, [enabled, execute, signal]);

  useEffect(() => {
    if (network === 'online' && appState === 'active') {
      attemptSync();
    }
  }, [appState, attemptSync, network]);
}
