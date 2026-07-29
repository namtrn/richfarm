import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Scope-safe offline read cache for Convex queries.
 * The returned snapshot is synchronously masked when the cache key changes.
 */
export function useQueryCache<T>(key: string | null, remote: T | undefined) {
    const [snapshot, setSnapshot] = useState<{
        key: string | null;
        cached: T | undefined;
        loaded: boolean;
    }>({ key: null, cached: undefined, loaded: false });

    useEffect(() => {
        if (!key) {
            setSnapshot({ key: null, cached: undefined, loaded: true });
            return;
        }

        let cancelled = false;
        setSnapshot({ key, cached: undefined, loaded: false });
        AsyncStorage.getItem(key)
            .then((raw) => {
                if (cancelled || !raw) return;
                try {
                    const cached = JSON.parse(raw) as T;
                    setSnapshot((current) => current.key === key
                        ? { key, cached, loaded: current.loaded }
                        : current);
                } catch {
                    // Disposable read caches may ignore malformed payloads.
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setSnapshot((current) => current.key === key
                        ? { ...current, loaded: true }
                        : current);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [key]);

    useEffect(() => {
        if (remote === undefined || !key) return;
        setSnapshot((current) => current.key === key
            ? { key, cached: remote, loaded: true }
            : current);
        AsyncStorage.setItem(key, JSON.stringify(remote)).catch(() => undefined);
    }, [remote, key]);

    const remoteResolved = remote !== undefined;
    const matchesScope = snapshot.key === key;
    return {
        cached: matchesScope ? snapshot.cached : undefined,
        cacheLoaded: key === null || (matchesScope && snapshot.loaded),
        remoteResolved,
    };
}
