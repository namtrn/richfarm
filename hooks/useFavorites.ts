import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useDeviceId } from '../lib/deviceId';
import { Id } from '../convex/_generated/dataModel';

export function useFavorites() {
    const { deviceId } = useDeviceId();
    const favorites = useQuery(api.favorites.list, deviceId ? { deviceId } : 'skip');
    const toggleFavoriteMutation = useMutation(api.favorites.toggle);

    const toggleFavorite = async (plantMasterId: Id<'plantsMaster'>) => {
        return await toggleFavoriteMutation({ plantMasterId, deviceId });
    };

    return {
        favorites: favorites ?? [],
        isLoading: favorites === undefined,
        toggleFavorite,
    };
}
