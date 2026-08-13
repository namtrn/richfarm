import { describe, expect, it, vi } from 'vitest';

import { changeLanguageAndSyncProfile } from './profileLanguage';

describe('changeLanguageAndSyncProfile', () => {
  it('changes the local language and syncs the profile', async () => {
    const changeLanguage = vi.fn().mockResolvedValue(undefined);
    const updateProfile = vi.fn().mockResolvedValue(undefined);

    await expect(changeLanguageAndSyncProfile({
      code: 'vi',
      currentLanguage: 'en',
      isAuthenticated: true,
      changeLanguage,
      updateProfile,
    })).resolves.toEqual({ status: 'synced', synced: true });
    expect(changeLanguage).toHaveBeenCalledWith('vi');
    expect(updateProfile).toHaveBeenCalledWith({ locale: 'vi' });
  });

  it('changes guests locally without calling the remote profile mutation', async () => {
    const changeLanguage = vi.fn().mockResolvedValue(undefined);
    const updateProfile = vi.fn().mockResolvedValue(undefined);

    await expect(changeLanguageAndSyncProfile({
      code: 'vi',
      currentLanguage: 'en',
      isAuthenticated: false,
      changeLanguage,
      updateProfile,
    })).resolves.toEqual({ status: 'local-only', synced: false });
    expect(changeLanguage).toHaveBeenCalledWith('vi');
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('keeps the local language change and asks for auth after an unauthorized sync failure', async () => {
    const error = { data: { code: 'UNAUTHORIZED', message: 'Session required' } };
    const changeLanguage = vi.fn().mockResolvedValue(undefined);
    const updateProfile = vi.fn().mockRejectedValue(error);

    await expect(changeLanguageAndSyncProfile({
      code: 'vi',
      currentLanguage: 'en',
      isAuthenticated: true,
      changeLanguage,
      updateProfile,
    })).resolves.toEqual({ status: 'requires-auth', synced: false, error });
    expect(changeLanguage).toHaveBeenCalledWith('vi');
  });

  it('contains a non-auth sync failure without undoing the local language change', async () => {
    const error = new Error('network unavailable');
    const changeLanguage = vi.fn().mockResolvedValue(undefined);
    const updateProfile = vi.fn().mockRejectedValue(error);

    await expect(changeLanguageAndSyncProfile({
      code: 'vi',
      currentLanguage: 'en',
      isAuthenticated: true,
      changeLanguage,
      updateProfile,
    })).resolves.toEqual({ status: 'failed', synced: false, error });
  });

  it('contains a local language failure', async () => {
    const error = new Error('translation load failed');
    const changeLanguage = vi.fn().mockRejectedValue(error);
    const updateProfile = vi.fn();

    await expect(changeLanguageAndSyncProfile({
      code: 'vi',
      currentLanguage: 'en',
      isAuthenticated: true,
      changeLanguage,
      updateProfile,
    })).resolves.toEqual({ status: 'failed', synced: false, error });
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('does nothing when the requested language is already active', async () => {
    const changeLanguage = vi.fn();
    const updateProfile = vi.fn();

    await expect(changeLanguageAndSyncProfile({
      code: 'en',
      currentLanguage: 'en',
      isAuthenticated: true,
      changeLanguage,
      updateProfile,
    })).resolves.toEqual({ status: 'unchanged', synced: true });
    expect(changeLanguage).not.toHaveBeenCalled();
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
