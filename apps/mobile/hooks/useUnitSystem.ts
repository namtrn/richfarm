import { getLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { resolveUnitSystem } from '../lib/units';
import { useScopedPreferenceValue } from './useScopedPreference';

export function useUnitSystem() {
    const { i18n } = useTranslation();
    const unitSystem = useScopedPreferenceValue('unitSystem');
    const deviceRegion = getLocales()[0]?.regionCode ?? undefined;
    return resolveUnitSystem(unitSystem, i18n.language, deviceRegion);
}
