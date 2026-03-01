import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';

export type PestDiseaseType = 'pest' | 'disease';

export function usePestsDiseases(type?: PestDiseaseType) {
    const { isKnown, isOffline } = useNetworkStatus();
    const shouldBypassRemote = isKnown && isOffline;
    const remoteData = useQuery(api.pestsDiseases.list, type ? { type } : {});

    const cacheKey = `rf_pests_diseases_v1${type ? `_${type}` : ''}`;
    const { cached, cacheLoaded } = useQueryCache(cacheKey, remoteData);

    const data = remoteData ?? cached;

    return {
        items: data ?? (shouldBypassRemote ? [] : []),
        isLoading: data === undefined && !cacheLoaded && !shouldBypassRemote,
    };
}
