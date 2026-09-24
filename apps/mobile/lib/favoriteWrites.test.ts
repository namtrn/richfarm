import { describe, expect, it } from 'vitest';
import {
    applyFavoriteWrites,
    canWriteFavorite,
    reconcileSuccessfulFavoriteWrites,
    type FavoriteWriteState,
} from './favoriteWrites';

const pendingAdd: FavoriteWriteState = { desired: true, previous: false, status: 'pending' };

describe('favorite write state', () => {
    it('applies optimistic add and remove without persistence', () => {
        expect(applyFavoriteWrites([], { tomato: pendingAdd })).toEqual([{ plantMasterId: 'tomato' }]);
        expect(applyFavoriteWrites(
            [{ plantMasterId: 'tomato' }],
            { tomato: { desired: false, previous: true, status: 'pending' } },
        )).toEqual([]);
    });

    it('rolls back failed writes to the server snapshot', () => {
        expect(applyFavoriteWrites(
            [{ plantMasterId: 'tomato' }],
            { tomato: { desired: false, previous: true, status: 'error', error: 'offline' } },
        )).toEqual([{ plantMasterId: 'tomato' }]);
    });

    it('removes a successful overlay only after the server matches it', () => {
        const writes = {
            tomato: { desired: true, previous: false, status: 'success' as const },
            basil: { desired: false, previous: true, status: 'success' as const },
        };
        expect(reconcileSuccessfulFavoriteWrites(writes, new Set(['tomato', 'basil']))).toEqual({
            basil: writes.basil,
        });
        expect(reconcileSuccessfulFavoriteWrites(writes, new Set())).toEqual({
            tomato: writes.tomato,
        });
    });

    it('blocks only unauthenticated or known-offline writes', () => {
        expect(canWriteFavorite({ hasSession: true, isKnown: true, isOffline: false })).toBe(true);
        expect(canWriteFavorite({ hasSession: true, isKnown: false, isOffline: false })).toBe(true);
        expect(canWriteFavorite({ hasSession: true, isKnown: true, isOffline: true })).toBe(false);
        expect(canWriteFavorite({ hasSession: false, isKnown: true, isOffline: false })).toBe(false);
    });
});
