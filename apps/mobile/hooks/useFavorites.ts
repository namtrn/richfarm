import { useMutation, useQuery } from 'convex/react';
import { Alert } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../packages/convex/convex/_generated/api';
import { Id } from '../../../packages/convex/convex/_generated/dataModel';
import { useDeviceId } from '../lib/deviceId';
import {
    applyFavoriteWrites,
    canWriteFavorite,
    reconcileSuccessfulFavoriteWrites,
    type FavoriteWriteState,
} from '../lib/favoriteWrites';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';
import { useHasAuthSession, useSessionScopedCacheKey } from '../lib/sessionCache';

export function useFavorites() {
    const { deviceId } = useDeviceId();
    const { isKnown, isOffline } = useNetworkStatus();
    const { t } = useTranslation();
    const shouldBypassRemote = isKnown && isOffline;
    const hasSession = useHasAuthSession();
    const remoteFavorites = useQuery(api.favorites.list, hasSession && deviceId ? { deviceId } : 'skip');

    const cacheKey = useSessionScopedCacheKey('rf_favorites_v2');
    const { cached, cacheLoaded } = useQueryCache(cacheKey, remoteFavorites);
    const favorites = !hasSession ? [] : remoteFavorites ?? cached;
    const sessionScope = `${cacheKey ?? 'anonymous'}:${hasSession ? 'account' : 'none'}`;
    const [writes, setWrites] = useState<Record<string, FavoriteWriteState>>({});
    const writeScopeRef = useRef(sessionScope);
    const scopeChanged = writeScopeRef.current !== sessionScope;
    if (scopeChanged) writeScopeRef.current = sessionScope;
    const activeWrites = scopeChanged ? {} : writes;
    const writesRef = useRef(activeWrites);
    writesRef.current = activeWrites;

    useEffect(() => {
        if (scopeChanged) setWrites({});
    }, [scopeChanged, sessionScope]);

    const setFavoriteMutation = useMutation(api.favorites.setFavorite);

    const retryFavoriteRef = useRef<(
        plantMasterId: Id<'plantsMaster'>
    ) => Promise<boolean>>(async () => false);

    const updateWrite = (plantMasterId: Id<'plantsMaster'>, state: FavoriteWriteState) => {
        const key = String(plantMasterId);
        const next = { ...writesRef.current, [key]: state };
        writesRef.current = next;
        setWrites(next);
    };

    const serverIsFavorite = (plantMasterId: Id<'plantsMaster'>) =>
        (favorites ?? []).some((favorite: any) => String(favorite.plantMasterId) === String(plantMasterId));

    const visibleIsFavorite = (plantMasterId: Id<'plantsMaster'>) => {
        const state = writesRef.current[String(plantMasterId)];
        return state && state.status !== 'error' ? state.desired : serverIsFavorite(plantMasterId);
    };

    const showFailure = (plantMasterId: Id<'plantsMaster'>) => {
        const title = t('common.error', { defaultValue: 'Error' });
        const message = !hasSession
            ? t('favorites.account_required', { defaultValue: 'Sign in to save favorites.' })
            : isOffline
              ? t('favorites.offline_message', { defaultValue: 'Favorites need a connection. Try again when you are online.' })
              : t('favorites.write_failed', { defaultValue: 'Could not update favorite. Please try again.' });
        Alert.alert(title, message, [
            { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
            {
                text: t('common.retry', { defaultValue: 'Retry' }),
                onPress: () => { void retryFavoriteRef.current(plantMasterId); },
            },
        ]);
    };

    async function writeFavorite(
        plantMasterId: Id<'plantsMaster'>,
        desired: boolean,
        previous: boolean,
    ) {
        const capturedScope = sessionScope;
        const current = writesRef.current[String(plantMasterId)];
        if (current?.status === 'pending') return false;
        if (!canWriteFavorite({ hasSession, isKnown, isOffline })) {
            updateWrite(plantMasterId, {
                desired,
                previous,
                status: 'error',
                error: !hasSession ? 'account_required' : 'offline',
            });
            showFailure(plantMasterId);
            return false;
        }

        updateWrite(plantMasterId, { desired, previous, status: 'pending' });
        try {
            await setFavoriteMutation({ plantMasterId, desired, deviceId });
            if (writeScopeRef.current !== capturedScope) return false;
            updateWrite(plantMasterId, { desired, previous, status: 'success' });
            return true;
        } catch (error) {
            if (writeScopeRef.current !== capturedScope) return false;
            updateWrite(plantMasterId, {
                desired,
                previous,
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
            });
            showFailure(plantMasterId);
            return false;
        }
    }

    async function setFavorite(plantMasterId: Id<'plantsMaster'>, desired: boolean) {
        const current = visibleIsFavorite(plantMasterId);
        return await writeFavorite(plantMasterId, desired, current);
    }

    async function retryFavorite(plantMasterId: Id<'plantsMaster'>) {
        const existing = writesRef.current[String(plantMasterId)];
        if (!existing) return false;
        return await writeFavorite(plantMasterId, existing.desired, serverIsFavorite(plantMasterId));
    }

    retryFavoriteRef.current = retryFavorite;

    useEffect(() => {
        if (remoteFavorites === undefined) return;
        const serverFavoriteIds = new Set(
            remoteFavorites.map((favorite: any) => String(favorite.plantMasterId)),
        );
        const current = writesRef.current;
        const next = reconcileSuccessfulFavoriteWrites(current, serverFavoriteIds);
        if (Object.keys(next).length === Object.keys(current).length) return;
        writesRef.current = next;
        setWrites(next);
    }, [remoteFavorites, sessionScope]);

    const toggleFavorite = async (plantMasterId: Id<'plantsMaster'>) =>
        await setFavorite(plantMasterId, !visibleIsFavorite(plantMasterId));

    const visibleFavorites = useMemo(
        () => applyFavoriteWrites(favorites, activeWrites),
        [activeWrites, favorites],
    );

    return {
        favorites: visibleFavorites,
        isLoading: favorites === undefined && !cacheLoaded && !shouldBypassRemote,
        toggleFavorite,
        setFavorite,
        retryFavorite,
        isFavoritePending: (plantMasterId: Id<'plantsMaster'>) =>
            writesRef.current[String(plantMasterId)]?.status === 'pending',
        getFavoriteStatus: (plantMasterId: Id<'plantsMaster'>) =>
            writesRef.current[String(plantMasterId)]?.status ?? 'idle',
        getFavoriteError: (plantMasterId: Id<'plantsMaster'>) =>
            writesRef.current[String(plantMasterId)]?.error,
    };
}
