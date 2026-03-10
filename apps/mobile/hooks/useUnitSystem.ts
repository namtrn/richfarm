import { useEffect, useState } from 'react';
import { getLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { useUserSettings } from './useUserSettings';
import { resolveUnitSystem, UnitSystem } from '../lib/units';
import {
    getCachedUnitSystemPreference,
    hydrateUnitSystemPreference,
    subscribeUnitSystemPreference,
} from '../lib/unitPreference';

export function useUnitSystem() {
    const { i18n } = useTranslation();
    const { settings } = useUserSettings();
    const deviceRegion = getLocales()[0]?.regionCode ?? undefined;
    const [localUnitSystem, setLocalUnitSystem] = useState<UnitSystem | undefined>(
        getCachedUnitSystemPreference()
    );

    useEffect(() => {
        void hydrateUnitSystemPreference().then((value) => {
            setLocalUnitSystem(value);
        });
        return subscribeUnitSystemPreference((value) => {
            setLocalUnitSystem(value);
        });
    }, []);

    return resolveUnitSystem(localUnitSystem ?? settings?.unitSystem, i18n.language, deviceRegion);
}
