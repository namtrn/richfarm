import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * useQueryCache — generic offline read-cache for Convex queries.
 *
 * Pattern (same as usePlantLibrary):
 *  1. On mount → load last-known value from AsyncStorage
 *  2. When remote arrives → update state + write-through to AsyncStorage
 *  3. Offline → returns cached data instead of undefined/[]
 *
 * @param key   AsyncStorage key (should include version + user scope)
 * @param remote  Value from Convex useQuery (undefined while loading, null if no match)
 */
export function useQueryCache<T>(key: string | null, remote: T | undefined) {
    const [cached, setCached] = useState<T | undefined>(undefined);
    const [cacheLoaded, setCacheLoaded] = useState(false);

    // 1. Load from AsyncStorage on mount / key change
    useEffect(() => {
        if (!key) {
            setCacheLoaded(true);
            return;
        }

        let cancelled = false;
        setCacheLoaded(false);
        setCached(undefined);

        AsyncStorage.getItem(key)
            .then((raw) => {
                if (cancelled || !raw) return;
                try {
                    setCached(JSON.parse(raw) as T);
                } catch {
                    /* corrupted cache, ignore */
                }
            })
            .finally(() => {
                if (!cancelled) setCacheLoaded(true);
            });

        return () => {
            cancelled = true;
        };
    }, [key]);

    // 2. Write-through when remote data arrives
    useEffect(() => {
        if (remote === undefined || !key) return;
        setCached(remote);
        AsyncStorage.setItem(key, JSON.stringify(remote)).catch(() => undefined);
    }, [remote, key]);

    return { cached, cacheLoaded };
}
