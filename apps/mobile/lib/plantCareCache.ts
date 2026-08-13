/**
 * plantCareCache.ts
 *
 * Offline-first local cache for plant care content.
 *
 * Contract (Phase 6.3): the cached payload stores canonical Markdown
 * (`careContent: string`), never the legacy structured-object `PlantCareContent`.
 *
 * Strategy:
 *  1. App loads care content from local cache immediately (fast, offline-safe).
 *  2. In background, compare local contentVersion vs server contentVersion.
 *  3. If server is newer (or no local cache) → fetch full content, save locally.
 *
 * Storage key per plant+locale: `plant_care_v2_${plantId}_${locale}`
 * (namespace bumped from the legacy `plant_care_*` object-shaped cache).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Legacy object-shaped cache entries are detected by shape at read time. */

interface CachedEntry {
    plantId: string;
    locale: string;
    contentVersion: number;
    careContent: string;
    cachedAt: number;
}

function cacheKey(plantId: string, locale: string) {
    return `plant_care_v2_${plantId}_${locale}`;
}

function legacyCacheKey(plantId: string, locale: string) {
    return `plant_care_${plantId}_${locale}`;
}

/**
 * Load care content from local cache. Returns null if not cached or if the
 * cached entry is a legacy object-shaped value (never coerced to Markdown).
 */
export async function loadCachedCareContent(
    plantId: string,
    locale: string,
): Promise<CachedEntry | null> {
    const currentKey = cacheKey(plantId, locale);
    const legacyKey = legacyCacheKey(plantId, locale);
    try {
        // Remove the v1 object-shaped entry whenever this key is touched. A
        // valid v2 entry must not leave stale legacy data around for a later
        // fallback path to accidentally consume.
        await AsyncStorage.removeItem(legacyKey);
        const raw = await AsyncStorage.getItem(currentKey);
        if (!raw) {
            return null;
        }
        const entry = JSON.parse(raw) as Partial<CachedEntry> | null;
        if (
            !entry ||
            typeof entry !== "object" ||
            Array.isArray(entry) ||
            entry.plantId !== plantId ||
            entry.locale !== locale ||
            typeof entry.careContent !== "string" ||
            typeof entry.contentVersion !== "number" ||
            !Number.isFinite(entry.contentVersion) ||
            typeof entry.cachedAt !== "number" ||
            !Number.isFinite(entry.cachedAt)
        ) {
            // v2 namespace should only ever hold Markdown; treat anything else
            // as incompatible.
            await AsyncStorage.removeItem(currentKey);
            return null;
        }
        return entry as CachedEntry;
    } catch {
        // Malformed JSON (or a malformed object) is not recoverable content;
        // evict it so every subsequent offline read starts from a clean state.
        await AsyncStorage.removeItem(currentKey).catch(() => undefined);
        return null;
    }
}

/** Save canonical Markdown care content to local cache. */
export async function saveCareContent(
    plantId: string,
    locale: string,
    contentVersion: number,
    careContent: string,
): Promise<void> {
    const entry: CachedEntry = {
        plantId,
        locale,
        contentVersion,
        careContent,
        cachedAt: Date.now(),
    };
    await AsyncStorage.setItem(cacheKey(plantId, locale), JSON.stringify(entry));
}
