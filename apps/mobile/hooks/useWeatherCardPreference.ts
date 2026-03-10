import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDeviceId } from '../lib/deviceId';
import { useUserSettings } from './useUserSettings';

function weatherCardStorageKey(deviceId?: string) {
    return deviceId ? `rf_show_weather_card_v1_${deviceId}` : null;
}

export function useWeatherCardPreference() {
    const { deviceId } = useDeviceId();
    const { settings, updateSettings } = useUserSettings();
    const [showWeatherCard, setShowWeatherCard] = useState(true);
    const [isHydrated, setIsHydrated] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const key = useMemo(() => weatherCardStorageKey(deviceId), [deviceId]);

    useEffect(() => {
        if (!key) return;

        let cancelled = false;
        setIsHydrated(false);

        AsyncStorage.getItem(key)
            .then((raw) => {
                if (cancelled) return;

                if (raw === 'true' || raw === 'false') {
                    setShowWeatherCard(raw === 'true');
                    return;
                }

                const fallbackValue = settings?.showWeatherCard ?? true;
                setShowWeatherCard(fallbackValue);
                return AsyncStorage.setItem(key, String(fallbackValue));
            })
            .catch(() => {
                if (!cancelled) {
                    setShowWeatherCard(settings?.showWeatherCard ?? true);
                }
            })
            .finally(() => {
                if (!cancelled) setIsHydrated(true);
            });

        return () => {
            cancelled = true;
        };
    }, [key, settings?.showWeatherCard]);

    const setWeatherCardVisible = useCallback(async (nextValue: boolean) => {
        const previousValue = showWeatherCard;
        setShowWeatherCard(nextValue);
        setIsSaving(true);

        try {
            if (key) {
                await AsyncStorage.setItem(key, String(nextValue));
            }
            try {
                await updateSettings({ showWeatherCard: nextValue });
            } catch {
                // Local device preference remains the primary source of truth.
            }
        } catch (error) {
            setShowWeatherCard(previousValue);
            throw error;
        } finally {
            setIsSaving(false);
        }
    }, [key, showWeatherCard, updateSettings]);

    return {
        showWeatherCard,
        setWeatherCardVisible,
        isHydrated,
        isSaving,
    };
}
