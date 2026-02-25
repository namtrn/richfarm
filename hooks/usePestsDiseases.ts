import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

export type PestDiseaseType = 'pest' | 'disease';

export function usePestsDiseases(type?: PestDiseaseType) {
    const data = useQuery(api.pestsDiseases.list, type ? { type } : {});

    return {
        items: data ?? [],
        isLoading: data === undefined,
    };
}
