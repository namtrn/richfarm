export type PlantI18nRow = {
    locale: string;
    commonName: string;
    description?: string;
    careContent?: string;
    contentUpdatedAt?: number;
    contentVersion?: number;
};

export type PlantLocalized = {
    displayName: string;
    scientificName: string;
    description?: string;
    localeUsed: string;
    careContent?: string;
    contentUpdatedAt?: number;
    contentVersion?: number;
};

export function localizePlantRows(
    rows: PlantI18nRow[] | undefined,
    userLocale: string | undefined,
    scientificName: string,
    fallbackDescription?: string
): PlantLocalized {
    if (!rows || rows.length === 0) {
        return {
            displayName: scientificName,
            scientificName,
            description: isPlaceholderPlantDescription(fallbackDescription)
                ? undefined
                : fallbackDescription,
            localeUsed: "latin",
        };
    }

    const normalizedLocale = (userLocale ?? "en")
        .split("-")[0]
        .toLowerCase();
    const exact = rows.find((r) => r.locale === normalizedLocale);
    const en = rows.find((r) => r.locale === "en");
    const first = rows[0];
    const picked = exact ?? en ?? first;

    const pickedDescription = isPlaceholderPlantDescription(picked?.description)
        ? undefined
        : picked?.description;
    const safeFallbackDescription = isPlaceholderPlantDescription(fallbackDescription)
        ? undefined
        : fallbackDescription;

    return {
        displayName: picked?.commonName ?? scientificName,
        scientificName,
        description: pickedDescription ?? safeFallbackDescription,
        localeUsed: picked?.locale ?? "latin",
        careContent: picked?.careContent,
        contentUpdatedAt: picked?.contentUpdatedAt,
        contentVersion: picked?.contentVersion,
    };
}
import { isPlaceholderPlantDescription } from "./plantContentQuality";
