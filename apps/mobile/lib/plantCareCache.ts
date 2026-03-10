/**
 * plantCareCache.ts
 *
 * Offline-first local cache for plant care content.
 *
 * Strategy:
 *  1. App loads care content from local cache immediately (fast, offline-safe).
 *  2. In background, compare local contentVersion vs server contentVersion.
 *  3. If server is newer (or no local cache) → fetch full content, save locally.
 *
 * Storage key per plant+locale: `plant_care_${plantId}_${locale}`
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Shape of each care section */
export interface CareSectionContent {
    /** Short intro paragraph */
    intro?: string;
    /** Bullet points or paragraphs */
    items?: string[];
}

/** Full care content for a plant (stored as JSON in plantI18n.careContent) */
export interface PlantCareContent {
    watering?: CareSectionContent;
    fertilizing?: CareSectionContent;
    location?: CareSectionContent;
    soil?: CareSectionContent;
    nutrition?: CareSectionContent;
    propagation?: CareSectionContent;
    temperature?: CareSectionContent;
    toxicity?: CareSectionContent;
}

interface CachedEntry {
    plantId: string;
    locale: string;
    contentVersion: number;
    care: PlantCareContent;
    cachedAt: number;
}

function cacheKey(plantId: string, locale: string) {
    return `plant_care_${plantId}_${locale}`;
}

/** Load care content from local cache. Returns null if not cached. */
export async function loadCachedCareContent(
    plantId: string,
    locale: string,
): Promise<CachedEntry | null> {
    try {
        const raw = await AsyncStorage.getItem(cacheKey(plantId, locale));
        if (!raw) return null;
        return JSON.parse(raw) as CachedEntry;
    } catch {
        return null;
    }
}

/** Save care content to local cache. */
export async function saveCareContent(
    plantId: string,
    locale: string,
    contentVersion: number,
    care: PlantCareContent,
): Promise<void> {
    const entry: CachedEntry = {
        plantId,
        locale,
        contentVersion,
        care,
        cachedAt: Date.now(),
    };
    await AsyncStorage.setItem(cacheKey(plantId, locale), JSON.stringify(entry));
}

/**
 * Parse raw careContent JSON string from the server into a PlantCareContent object.
 * Returns null if the string is missing or malformed.
 */
export function parseCareContent(raw: string | null | undefined): PlantCareContent | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as PlantCareContent;
    } catch {
        return null;
    }
}
