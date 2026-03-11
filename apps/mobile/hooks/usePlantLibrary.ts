import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../packages/convex/convex/_generated/api';
import { useNetworkStatus } from './useNetworkStatus';
import { buildPlantSeedKey, plantGroupsSeed, plantI18nSeed, plantsMasterSeed } from '../../../packages/convex/convex/data/plantsMasterSeed';
import { plantTaxonomyI18nSeed } from '../../../packages/convex/convex/data/plantTaxonomyI18nSeed';
import { buildTaxonomyFields } from '../../../packages/convex/convex/lib/plantTaxonomy';
import {
    buildGenusTaxonomyKey,
    buildSpeciesTaxonomyKey,
} from '../../../packages/convex/convex/lib/plantTaxonomyI18n';

const PLANTS_CACHE_VERSION = 6;
const GROUPS_CACHE_VERSION = 1;

function normalizeLocale(locale?: string) {
    const normalized = (locale ?? 'en').split('-')[0]?.toLowerCase();
    return normalized || 'en';
}

function normalizeScientificName(value: string) {
    return value
        .toLowerCase()
        .replaceAll('×', 'x')
        .replace(/\s+/g, ' ')
        .trim();
}

function plantsCacheKey(locale: string) {
    return `plant_library_plants_v${PLANTS_CACHE_VERSION}_${locale}`;
}

function plantsWithoutImagesCacheKey(locale: string) {
    return `plant_library_plants_without_images_v${PLANTS_CACHE_VERSION}_${locale}`;
}

function groupsCacheKey(locale: string) {
    return `plant_library_groups_v${GROUPS_CACHE_VERSION}_${locale}`;
}

const seedI18nMap = (() => {
    const map = new Map<string, { commonName: string; description?: string }>();
    for (const row of plantI18nSeed) {
        const key = `${row.locale.toLowerCase()}|${buildPlantSeedKey({
            scientificName: row.scientificName,
            cultivar: row.cultivar,
        })}`;
        map.set(key, {
            commonName: row.commonName,
            description: row.description ?? undefined,
        });
    }
    return map;
})();

const taxonomyCommonNamesByKey = (() => {
    const map = new Map<string, Record<string, string>>();
    for (const row of plantTaxonomyI18nSeed) {
        const entry = map.get(row.taxonomyKey) ?? {};
        entry[row.locale] = row.commonName;
        map.set(row.taxonomyKey, entry);
    }
    return map;
})();

function decoratePlantWithTaxonomy(plant: any) {
    const taxonomy = buildTaxonomyFields({
        scientificName: plant?.scientificName,
        cultivar: plant?.cultivar,
    });

    const genus = String(plant?.genus ?? taxonomy.genus ?? '').trim() || undefined;
    const species = String(plant?.species ?? taxonomy.species ?? '').trim() || undefined;
    const genusNormalized = String(
        plant?.genusNormalized ?? taxonomy.genusNormalized ?? ''
    ).trim() || undefined;
    const speciesNormalized = String(
        plant?.speciesNormalized ?? taxonomy.speciesNormalized ?? ''
    ).trim() || undefined;

    const genusNames = genusNormalized
        ? taxonomyCommonNamesByKey.get(buildGenusTaxonomyKey(genusNormalized))
        : undefined;
    const speciesNames =
        genusNormalized && speciesNormalized
            ? taxonomyCommonNamesByKey.get(
                buildSpeciesTaxonomyKey(genusNormalized, speciesNormalized)
            )
            : undefined;

    return {
        ...plant,
        genus,
        species,
        genusNormalized,
        speciesNormalized,
        commonGenusNameVi:
            plant?.commonGenusNameVi ?? genusNames?.vi ?? undefined,
        commonGenusNameEn:
            plant?.commonGenusNameEn ?? genusNames?.en ?? undefined,
        commonSpeciesNameVi:
            plant?.commonSpeciesNameVi ?? speciesNames?.vi ?? undefined,
        commonSpeciesNameEn:
            plant?.commonSpeciesNameEn ?? speciesNames?.en ?? undefined,
    };
}

function decoratePlantLibrary(plants: any[] | null | undefined) {
    if (!Array.isArray(plants)) return null;
    return plants.map((plant) => decoratePlantWithTaxonomy(plant));
}

function buildSeedPlantLibrary(locale: string) {
    const normalizedLocale = normalizeLocale(locale);
    return plantsMasterSeed.map((plant) => {
        const seedKey = buildPlantSeedKey({
            scientificName: plant.scientificName,
            cultivar: (plant as any).cultivar,
        });
        const localeRow = seedI18nMap.get(`${normalizedLocale}|${seedKey}`);
        const fallbackEnRow =
            seedI18nMap.get(`en|${seedKey}`) ??
            seedI18nMap.get(`en|${buildPlantSeedKey({ scientificName: plant.scientificName })}`);
        const localized = localeRow ?? fallbackEnRow;
        const localeUsed = localeRow ? normalizedLocale : 'en';
        const displayName = localized?.commonName ?? plant.scientificName;
        const description = localized?.description;
        const cultivar = (plant as any).cultivar;

        return decoratePlantWithTaxonomy({
            _id: `seed:${encodeURIComponent(seedKey)}`,
            scientificName: plant.scientificName,
            cultivar: cultivar ?? null,
            speciesKey: normalizeScientificName(plant.scientificName),
            isBaseVariant: !cultivar,
            displayName,
            description,
            localeUsed,
            careContent: undefined,
            contentVersion: 0,
            i18nRows: localized
                ? [
                    {
                        locale: localeUsed,
                        commonName: displayName,
                        description,
                    },
                ]
                : [],
            group: plant.group,
            imageUrl: null,
            hasImage: false,
            typicalDaysToHarvest: plant.typicalDaysToHarvest,
            wateringFrequencyDays: plant.wateringFrequencyDays,
            lightRequirements: plant.lightRequirements,
            germinationDays: plant.germinationDays,
            spacingCm: plant.spacingCm,
            source: plant.source,
            purposes: plant.purposes,
            maxPlantsPerM2: plant.maxPlantsPerM2,
            seedRatePerM2: plant.seedRatePerM2,
            waterLitersPerM2: plant.waterLitersPerM2,
            yieldKgPerM2: plant.yieldKgPerM2,
        });
    });
}

// Hook để lấy danh sách plants từ library (plantsMaster)
export function usePlantLibrary(
    locale?: string,
    options?: { allowSeedFallback?: boolean }
) {
    const normalizedLocale = normalizeLocale(locale);
    const { isKnown, isOffline } = useNetworkStatus();
    const remotePlants = useQuery(api.plantImages.getPlantsWithImages, {
        locale: normalizedLocale,
    });

    const remotePlantsWithoutImages = useQuery(
        api.plantImages.getPlantsWithoutImages,
        { locale: normalizedLocale }
    );
    const seedPlants = useMemo(
        () => buildSeedPlantLibrary(normalizedLocale),
        [normalizedLocale]
    );
    const normalizedRemotePlants = useMemo(
        () => decoratePlantLibrary(remotePlants),
        [remotePlants]
    );
    const normalizedRemotePlantsWithoutImages = useMemo(
        () => decoratePlantLibrary(remotePlantsWithoutImages),
        [remotePlantsWithoutImages]
    );
    const [cachedPlants, setCachedPlants] = useState<any[] | null>(null);
    const [cachedPlantsWithoutImages, setCachedPlantsWithoutImages] = useState<any[] | null>(null);
    const [cacheLoaded, setCacheLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setCacheLoaded(false);

        (async () => {
            try {
                const [plantsRaw, withoutRaw] = await Promise.all([
                    AsyncStorage.getItem(plantsCacheKey(normalizedLocale)),
                    AsyncStorage.getItem(plantsWithoutImagesCacheKey(normalizedLocale)),
                ]);
                if (cancelled) return;
                const parsedPlants = plantsRaw ? JSON.parse(plantsRaw) : null;
                const parsedWithout = withoutRaw ? JSON.parse(withoutRaw) : null;
                setCachedPlants(decoratePlantLibrary(parsedPlants));
                setCachedPlantsWithoutImages(decoratePlantLibrary(parsedWithout));
            } catch {
                if (cancelled) return;
                setCachedPlants(null);
                setCachedPlantsWithoutImages(null);
            } finally {
                if (!cancelled) setCacheLoaded(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [normalizedLocale]);

    useEffect(() => {
        if (!normalizedRemotePlants) return;
        const decoratedPlants = normalizedRemotePlants;
        setCachedPlants(decoratedPlants);
        AsyncStorage.setItem(
            plantsCacheKey(normalizedLocale),
            JSON.stringify(decoratedPlants)
        ).catch(() => undefined);
    }, [normalizedRemotePlants, normalizedLocale]);

    useEffect(() => {
        if (!normalizedRemotePlantsWithoutImages) return;
        const decoratedPlants = normalizedRemotePlantsWithoutImages;
        setCachedPlantsWithoutImages(decoratedPlants);
        AsyncStorage.setItem(
            plantsWithoutImagesCacheKey(normalizedLocale),
            JSON.stringify(decoratedPlants)
        ).catch(() => undefined);
    }, [normalizedRemotePlantsWithoutImages, normalizedLocale]);

    const hasCached = !!(cachedPlants && cachedPlants.length > 0);
    const shouldUseSeed =
        Boolean(options?.allowSeedFallback) &&
        isKnown &&
        isOffline &&
        !hasCached;
    const plants =
        normalizedRemotePlants ??
        cachedPlants ??
        (shouldUseSeed ? seedPlants : []);
    const plantsWithoutImages =
        normalizedRemotePlantsWithoutImages ??
        cachedPlantsWithoutImages ??
        (shouldUseSeed ? seedPlants : []);
    const isLoading =
        plants.length === 0 &&
        remotePlants === undefined &&
        !cacheLoaded &&
        !shouldUseSeed;

    return {
        plants,
        plantsWithoutImages,
        isLoading,
    };
}

// Hook để lấy tất cả plant groups
export function usePlantGroups() {
    const normalizedLocale = 'en';
    const { isKnown, isOffline } = useNetworkStatus();
    const remoteGroups = useQuery(api.plantGroups.list, {});
    const [cachedGroups, setCachedGroups] = useState<any[] | null>(null);
    const [cacheLoaded, setCacheLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setCacheLoaded(false);
        AsyncStorage.getItem(groupsCacheKey(normalizedLocale))
            .then((raw) => {
                if (cancelled) return;
                const parsed = raw ? JSON.parse(raw) : null;
                setCachedGroups(Array.isArray(parsed) ? parsed : null);
            })
            .catch(() => {
                if (cancelled) return;
                setCachedGroups(null);
            })
            .finally(() => {
                if (!cancelled) setCacheLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!Array.isArray(remoteGroups)) return;
        setCachedGroups(remoteGroups);
        AsyncStorage.setItem(
            groupsCacheKey(normalizedLocale),
            JSON.stringify(remoteGroups)
        ).catch(() => undefined);
    }, [remoteGroups, normalizedLocale]);

    const hasCached = !!(cachedGroups && cachedGroups.length > 0);
    const shouldUseSeed = isKnown && isOffline && !hasCached;
    const groups =
        (Array.isArray(remoteGroups) ? remoteGroups : null) ??
        cachedGroups ??
        (shouldUseSeed ? plantGroupsSeed : []);
    const isLoading =
        groups.length === 0 &&
        remoteGroups === undefined &&
        !cacheLoaded &&
        !shouldUseSeed;

    return {
        groups,
        isLoading,
    };
}
