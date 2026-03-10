import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSyncExecutor } from '../lib/sync/useSyncExecutor';

const MIN_ATTEMPT_INTERVAL_MS = 15000;

export function useSyncTriggers(enabled: boolean = true) {
  const lastAttemptRef = useRef(0);
  const inflightRef = useRef(false);
  const enabledRef = useRef(enabled);
  const { execute } = useSyncExecutor();

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const attemptSync = useCallback(async () => {
    if (!enabledRef.current || inflightRef.current) return;
    const now = Date.now();
    if (now - lastAttemptRef.current < MIN_ATTEMPT_INTERVAL_MS) return;

    inflightRef.current = true;
    try {
      await execute();
      lastAttemptRef.current = Date.now();
    } finally {
      inflightRef.current = false;
    }
  }, [execute]);

  useEffect(() => {
    if (enabledRef.current) {
      attemptSync();
    }
  }, [attemptSync]);

  useEffect(() => {
    if (!enabledRef.current) return;
    const subscription = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        attemptSync();
      }
    });
    return () => subscription();
  }, [attemptSync]);

  useEffect(() => {
    if (!enabledRef.current) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        attemptSync();
      }
    });
    return () => subscription.remove();
  }, [attemptSync]);
}
