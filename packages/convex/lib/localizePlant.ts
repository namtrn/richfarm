export type PlantI18nRow = {
    locale: string;
    commonName: string;
    description?: string;
    careContent?: string;
    contentVersion?: number;
};

export type PlantLocalized = {
    displayName: string;
    scientificName: string;
    description?: string;
    localeUsed: string;
    careContent?: string;
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
            description: fallbackDescription,
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

    return {
        displayName: picked?.commonName ?? scientificName,
        scientificName,
        description: picked?.description ?? fallbackDescription,
        localeUsed: picked?.locale ?? "latin",
        careContent: picked?.careContent,
        contentVersion: picked?.contentVersion,
    };
}
