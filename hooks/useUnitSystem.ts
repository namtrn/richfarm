import { getLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { useUserSettings } from './useUserSettings';
import { resolveUnitSystem } from '../lib/units';

export function useUnitSystem() {
    const { i18n } = useTranslation();
    const { settings } = useUserSettings();
    const deviceRegion = getLocales()[0]?.regionCode ?? undefined;
    return resolveUnitSystem(settings?.unitSystem, i18n.language, deviceRegion);
}
