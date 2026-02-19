import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { syncQueue } from '../lib/sync/adapter';

const MIN_ATTEMPT_INTERVAL_MS = 15000;

export function useSyncTriggers() {
  const lastAttemptRef = useRef(0);
  const inflightRef = useRef(false);

  const attemptSync = useCallback(async () => {
    if (inflightRef.current) return;
    const now = Date.now();
    if (now - lastAttemptRef.current < MIN_ATTEMPT_INTERVAL_MS) return;

    inflightRef.current = true;
    try {
      const result = await syncQueue();
      if (result.queuedCount > 0 || result.reason === 'queue_empty') {
        lastAttemptRef.current = Date.now();
      }
    } finally {
      inflightRef.current = false;
    }
  }, []);

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
