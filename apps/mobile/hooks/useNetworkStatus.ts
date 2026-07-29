import { useMobileRuntime } from '../lib/state/mobileRuntimeStore';

export function useNetworkStatus() {
  const network = useMobileRuntime((state) => state.network);
  const isKnown = network !== 'unknown';
  const isOffline = network === 'offline';

  return {
    isKnown,
    isOffline,
    isOnline: isKnown && !isOffline,
  };
}
