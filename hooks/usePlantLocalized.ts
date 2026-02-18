import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export type PlantLocalized = {
    displayName: string;
    scientificName: string;
    description?: string;
    localeUsed: string;
};

export function localizePlant(
    i18nRows: Array<{ locale: string; commonName: string; description?: string }>,
    userLocale: string,
    scientificName: string
): PlantLocalized {
    const exact = i18nRows.find((r) => r.locale === userLocale);
    const en = i18nRows.find((r) => r.locale === 'en');
    const first = i18nRows[0];
    const picked = exact ?? en ?? first;

    return {
        displayName: picked?.commonName ?? scientificName,
        scientificName,
        description: picked?.description,
        localeUsed: picked?.locale ?? 'latin',
    };
}

export function usePlantDisplayName(plant: any): PlantLocalized {
    const { i18n } = useTranslation();
    const locale = (i18n.language ?? 'en').split('-')[0].toLowerCase();

    return useMemo(() => {
        if (!plant) {
            return {
                displayName: '',
                scientificName: '',
                localeUsed: 'latin',
            };
        }

        if (plant.displayName) {
            return {
                displayName: plant.displayName,
                scientificName: plant.scientificName,
                description: plant.description,
                localeUsed: plant.localeUsed ?? 'latin',
            };
        }

        if (plant.i18nRows?.length) {
            return localizePlant(plant.i18nRows, locale, plant.scientificName);
        }

        return {
            displayName: plant.scientificName ?? '—',
            scientificName: plant.scientificName ?? '—',
            description: plant.description,
            localeUsed: 'latin',
        };
    }, [plant, locale]);
}
