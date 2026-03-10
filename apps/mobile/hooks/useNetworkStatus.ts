import { useNetInfo } from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const netInfo = useNetInfo();
  const isKnown =
    netInfo.isConnected !== null || netInfo.isInternetReachable !== null;
  const isOffline =
    netInfo.isConnected === false || netInfo.isInternetReachable === false;

  return {
    isKnown,
    isOffline,
    isOnline: isKnown && !isOffline,
  };
}
