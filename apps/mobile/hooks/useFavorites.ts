import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../packages/convex/_generated/api';
import { useDeviceId } from '../lib/deviceId';
import { Id } from '../../../packages/convex/_generated/dataModel';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';
import { useHasAuthSession, useSessionScopedCacheKey } from '../lib/sessionCache';

export function useFavorites() {
    const { deviceId } = useDeviceId();
    const { isKnown, isOffline } = useNetworkStatus();
    const shouldBypassRemote = isKnown && isOffline;
    const hasSession = useHasAuthSession();
    const remoteFavorites = useQuery(api.favorites.list, deviceId ? { deviceId } : 'skip');

    const cacheKey = useSessionScopedCacheKey('rf_favorites_v2');
    const { cached, cacheLoaded } = useQueryCache(cacheKey, remoteFavorites);

    const favorites = !hasSession ? [] : remoteFavorites ?? cached;

    const toggleFavoriteMutation = useMutation(api.favorites.toggle);

    const toggleFavorite = async (plantMasterId: Id<'plantsMaster'>) => {
        return await toggleFavoriteMutation({ plantMasterId, deviceId });
    };

    return {
        favorites: favorites ?? [],
        isLoading: favorites === undefined && !cacheLoaded && !shouldBypassRemote,
        toggleFavorite,
    };
}
