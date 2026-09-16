import { useQuery, useMutation } from 'convex/react';
import { Alert } from 'react-native';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../packages/convex/convex/_generated/api';
import { useDeviceId } from '../lib/deviceId';
import { Id } from '../../../packages/convex/convex/_generated/dataModel';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';
import { useHasAuthSession, useSessionScopedCacheKey } from '../lib/sessionCache';
import { getFavoriteWriteState, getFavoriteWritesRevision, getNextFavoriteDesired, submitFavoriteDesired, subscribeFavoriteWrites } from '../lib/favoriteWrites';
import { mobileRuntimeStore } from '../lib/state/mobileRuntimeStore';

export function useFavorites() {
    const { t } = useTranslation();
    const { deviceId } = useDeviceId();
    const { isKnown, isOffline } = useNetworkStatus();
    const shouldBypassRemote = isKnown && isOffline;
    const hasSession = useHasAuthSession();
    const remoteFavorites = useQuery(api.favorites.list, hasSession && deviceId ? { deviceId } : 'skip');

    const cacheKey = useSessionScopedCacheKey('rf_favorites_v2');
    const { cached, cacheLoaded } = useQueryCache(cacheKey, remoteFavorites);

    const favorites = !hasSession ? [] : remoteFavorites ?? cached;

    const setFavoriteMutation = useMutation(api.favorites.setFavorite);
    useSyncExternalStore(subscribeFavoriteWrites, getFavoriteWritesRevision, getFavoriteWritesRevision);

    const isScopeActive = (expectedCacheKey: string, expectedToken: string) => {
        const runtime = mobileRuntimeStore.getState();
        return runtime.authStatus === 'account'
            && runtime.scopeToken === expectedToken
            && !!runtime.activeScope
            && expectedCacheKey === `rf_favorites_v2_${encodeURIComponent(runtime.activeScope)}`;
    };

    const showFailure = (plantMasterId: Id<'plantsMaster'>, desired: boolean, expectedCacheKey: string, expectedToken: string) => {
        if (!isScopeActive(expectedCacheKey, expectedToken)) return;
        Alert.alert(
            t('common.error'),
            t('favorites.write_failed', { defaultValue: 'Could not update favorite. Please try again.' }),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('common.retry'),
                    onPress: () => {
                        if (isScopeActive(expectedCacheKey, expectedToken)) void setFavorite(plantMasterId, desired);
                    },
                },
            ],
        );
    };

    const setFavorite = async (plantMasterId: Id<'plantsMaster'>, desired: boolean) => {
        if (!hasSession || !cacheKey) {
            Alert.alert(t('common.error'), t('favorites.account_required'));
            return false;
        }
        const capturedToken = mobileRuntimeStore.getState().scopeToken;
        if (!isScopeActive(cacheKey, capturedToken)) return false;
        if (!isKnown || isOffline) {
            Alert.alert(t('favorites.offline_title', { defaultValue: 'Favorites need a connection' }), t('favorites.offline_message', { defaultValue: 'Connect to the internet and try again.' }));
            return false;
        }
        const result = await submitFavoriteDesired({
            scope: cacheKey,
            plantId: String(plantMasterId),
            desired,
            write: () => setFavoriteMutation({ plantMasterId, desired, deviceId }),
            isActive: () => isScopeActive(cacheKey, capturedToken),
        });
        if (result === 'failed' && isScopeActive(cacheKey, capturedToken) && !getFavoriteWriteState(cacheKey, String(plantMasterId)).pending) {
            showFailure(plantMasterId, desired, cacheKey, capturedToken);
        }
        return result === 'succeeded';
    };

    const toggleFavorite = async (plantMasterId: Id<'plantsMaster'>) => {
        const serverValue = (favorites ?? []).some((favorite) => String(favorite.plantMasterId) === String(plantMasterId));
        const desired = cacheKey
            ? getNextFavoriteDesired(cacheKey, String(plantMasterId), serverValue)
            : !serverValue;
        return await setFavorite(plantMasterId, desired);
    };

    const retryFavorite = async (plantMasterId: Id<'plantsMaster'>) => {
        if (!cacheKey) return false;
        const desired = getFavoriteWriteState(cacheKey, String(plantMasterId)).desired;
        return desired === undefined ? false : await setFavorite(plantMasterId, desired);
    };

    return {
        favorites: favorites ?? [],
        isLoading: favorites === undefined && !cacheLoaded && !shouldBypassRemote,
        toggleFavorite,
        setFavorite,
        retryFavorite,
        isFavoritePending: (plantMasterId: Id<'plantsMaster'>) => cacheKey
            ? getFavoriteWriteState(cacheKey, String(plantMasterId)).pending
            : false,
        getFavoriteError: (plantMasterId: Id<'plantsMaster'>) => cacheKey
            ? getFavoriteWriteState(cacheKey, String(plantMasterId)).error
            : undefined,
        canWriteFavorites: hasSession && isKnown && !isOffline,
    };
}
