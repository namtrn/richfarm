import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useDeviceId } from '../lib/deviceId';

export function useUserSettings() {
    const { deviceId, isLoading: isDeviceLoading } = useDeviceId();
    const settings = useQuery(api.userSettings.getUserSettings, deviceId ? { deviceId } : 'skip');
    const upsert = useMutation(api.userSettings.upsertUserSettings);

    const updateSettings = async (args: { unitSystem?: string }) => {
        return await upsert({ ...args, deviceId });
    };

    return {
        settings,
        updateSettings,
        isLoading: isDeviceLoading || settings === undefined,
    };
}
