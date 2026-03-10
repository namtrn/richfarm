import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../packages/convex/_generated/api';
import { useDeviceId } from '../lib/deviceId';
import { Id } from '../../../packages/convex/_generated/dataModel';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';

export function useFavorites() {
    const { deviceId } = useDeviceId();
    const { isKnown, isOffline } = useNetworkStatus();
    const shouldBypassRemote = isKnown && isOffline;
    const remoteFavorites = useQuery(api.favorites.list, deviceId ? { deviceId } : 'skip');

    const cacheKey = deviceId ? `rf_favorites_v1_${deviceId}` : null;
    const { cached, cacheLoaded } = useQueryCache(cacheKey, remoteFavorites);

    const favorites = remoteFavorites ?? cached;

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
