import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFavoriteWriteState, getNextFavoriteDesired, resetFavoriteWritesForTests, submitFavoriteDesired } from './favoriteWrites';

describe('favorite desired-state writes', () => {
  beforeEach(resetFavoriteWritesForTests);

  it('retries the captured desired state without inversion', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce(undefined);
    expect(await submitFavoriteDesired({ scope: 'a', plantId: 'p', desired: true, write })).toBe('failed');
    expect(getFavoriteWriteState('a', 'p')).toMatchObject({ desired: true, error: expect.any(Error) });
    expect(await submitFavoriteDesired({ scope: 'a', plantId: 'p', desired: true, write })).toBe('succeeded');
    expect(write).toHaveBeenNthCalledWith(1, true);
    expect(write).toHaveBeenNthCalledWith(2, true);
  });

  it('serializes concurrent consumers per account and plant in intent order', async () => {
    let finishFirst!: () => void;
    const calls: boolean[] = [];
    const write = vi.fn((desired: boolean) => {
      calls.push(desired);
      return calls.length === 1 ? new Promise<void>((resolve) => { finishFirst = resolve; }) : Promise.resolve();
    });
    const first = submitFavoriteDesired({ scope: 'a', plantId: 'p', desired: true, write });
    const second = submitFavoriteDesired({ scope: 'a', plantId: 'p', desired: false, write });
    await Promise.resolve();
    expect(write).toHaveBeenCalledOnce();
    finishFirst();
    await first;
    expect(await second).toBe('succeeded');
    expect(calls).toEqual([true, false]);
    expect(getFavoriteWriteState('a', 'p')).toEqual({ pending: false });
  });

  it('derives a concurrent toggle from the newest shared intent, not a stale server snapshot', async () => {
    let finishFirst!: () => void;
    const calls: boolean[] = [];
    const write = vi.fn((desired: boolean) => {
      calls.push(desired);
      return calls.length === 1 ? new Promise<void>((resolve) => { finishFirst = resolve; }) : Promise.resolve();
    });
    const serverValue = false;
    const firstDesired = getNextFavoriteDesired('a', 'p', serverValue);
    const first = submitFavoriteDesired({ scope: 'a', plantId: 'p', desired: firstDesired, write });
    const secondDesired = getNextFavoriteDesired('a', 'p', serverValue);
    const second = submitFavoriteDesired({ scope: 'a', plantId: 'p', desired: secondDesired, write });
    expect([firstDesired, secondDesired]).toEqual([true, false]);
    await Promise.resolve();
    finishFirst();
    await Promise.all([first, second]);
    expect(calls).toEqual([true, false]);
  });

  it('isolates operation state between accounts', async () => {
    await submitFavoriteDesired({ scope: 'a', plantId: 'p', desired: true, write: async () => undefined });
    expect(getFavoriteWriteState('b', 'p')).toEqual({ pending: false });
  });

  it('invalidates queued writes and late failures after an account transition', async () => {
    let activeScope = 'a';
    let rejectFirst!: (error: unknown) => void;
    const write = vi.fn(() => new Promise<void>((_, reject) => { rejectFirst = reject; }));
    const first = submitFavoriteDesired({ scope: 'a', plantId: 'p', desired: true, write, isActive: () => activeScope === 'a' });
    const queued = submitFavoriteDesired({ scope: 'a', plantId: 'p', desired: false, write, isActive: () => activeScope === 'a' });
    await Promise.resolve();
    activeScope = 'b';
    rejectFirst(new Error('late failure'));
    expect(await first).toBe('stale');
    expect(await queued).toBe('stale');
    expect(write).toHaveBeenCalledOnce();
    expect(getFavoriteWriteState('a', 'p')).toEqual({ pending: false });
  });

  it('releases acknowledged intent so an external update becomes authoritative', async () => {
    await submitFavoriteDesired({ scope: 'a', plantId: 'p', desired: true, write: async () => undefined });
    expect(getFavoriteWriteState('a', 'p')).toEqual({ pending: false });
  });
});
