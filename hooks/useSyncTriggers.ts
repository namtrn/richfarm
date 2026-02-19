import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSyncExecutor } from '../lib/sync/useSyncExecutor';

const MIN_ATTEMPT_INTERVAL_MS = 15000;

export function useSyncTriggers() {
  const lastAttemptRef = useRef(0);
  const inflightRef = useRef(false);
  const { execute } = useSyncExecutor();

  const attemptSync = useCallback(async () => {
    if (inflightRef.current) return;
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
    attemptSync();
  }, [attemptSync]);

  useEffect(() => {
    const subscription = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        attemptSync();
      }
    });
    return () => subscription();
  }, [attemptSync]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        attemptSync();
      }
    });
    return () => subscription.remove();
  }, [attemptSync]);
}
