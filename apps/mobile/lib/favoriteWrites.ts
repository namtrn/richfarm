export type FavoriteWriteStatus = 'pending' | 'success' | 'error';

export type FavoriteWriteState = {
    desired: boolean;
    previous: boolean;
    status: FavoriteWriteStatus;
    error?: string;
};

export function canWriteFavorite(input: {
    hasSession: boolean;
    isKnown: boolean;
    isOffline: boolean;
}) {
    return input.hasSession && !(input.isKnown && input.isOffline);
}

export function applyFavoriteWrites<T extends { plantMasterId: unknown }>(
    favorites: readonly T[] | undefined,
    writes: Record<string, FavoriteWriteState>,
) {
    const byPlantId = new Map<string, T>();
    for (const favorite of favorites ?? []) {
        byPlantId.set(String(favorite.plantMasterId), favorite);
    }
    for (const [plantMasterId, state] of Object.entries(writes)) {
        if (state.status === 'error') continue;
        if (state.desired) {
            byPlantId.set(plantMasterId, byPlantId.get(plantMasterId) ?? { plantMasterId } as T);
        } else {
            byPlantId.delete(plantMasterId);
        }
    }
    return Array.from(byPlantId.values());
}

export function reconcileSuccessfulFavoriteWrites(
    writes: Record<string, FavoriteWriteState>,
    serverFavoriteIds: ReadonlySet<string>,
) {
    const next: Record<string, FavoriteWriteState> = {};
    for (const [plantMasterId, state] of Object.entries(writes)) {
        if (state.status === 'success' && serverFavoriteIds.has(plantMasterId) === state.desired) continue;
        next[plantMasterId] = state;
    }
    return next;
}
