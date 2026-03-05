import { ConvexHttpClient } from "convex/browser";
import type {
    PlantFormState,
    GroupFormState,
    I18nFormState,
    PhotoFormState,
} from "./types";

declare const __CONVEX_URL__: string;

export const convex = new ConvexHttpClient(__CONVEX_URL__);

export const convexReady = Boolean(__CONVEX_URL__);

// ──────────────────────────────────────────────
// Empty form defaults
// ──────────────────────────────────────────────

export const emptyPlantForm: PlantFormState = {
    genus: "",
    species: "",
    cultivar: "",
    group: "other",
    description: "",
    imageUrl: "",
    purposes: "",
    viCommonName: "",
    viDescription: "",
    enCommonName: "",
    enDescription: "",
    typicalDaysToHarvest: "",
    wateringFrequencyDays: "",
    germinationDays: "",
    spacingCm: "",
    lightRequirements: "",
    maxPlantsPerM2: "",
    seedRatePerM2: "",
    waterLitersPerM2: "",
    yieldKgPerM2: "",
};

export const emptyGroupForm: GroupFormState = {
    key: "",
    displayNameVi: "",
    displayNameEn: "",
    descriptionVi: "",
    descriptionEn: "",
    iconUrl: "",
    sortOrder: "0",
};

export const emptyI18nForm: I18nFormState = {
    plantId: "",
    locale: "",
    commonName: "",
    description: "",
    careContent: "",
    contentVersion: "",
};

export const emptyPhotoForm: PhotoFormState = {
    userPlantId: "",
    userId: "",
    localId: "",
    photoUrl: "",
    thumbnailUrl: "",
    storageId: "",
    takenAt: "",
    uploadedAt: "",
    isPrimary: false,
    source: "camera",
    analysisStatus: "pending",
    analysisResult: "",
    aiModelVersion: "",
};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

import type { I18nRow, Plant } from "./types";

export function getLocaleRow(rows: I18nRow[], locale: "vi" | "en") {
    return rows.find((row) => row.locale === locale);
}

export function getDisplayName(plant: Plant) {
    const vi = getLocaleRow(plant.i18nRows, "vi")?.commonName;
    const en = getLocaleRow(plant.i18nRows, "en")?.commonName;
    return vi || en || plant.scientificName;
}

export function parsePurposes(value: string) {
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

/** Compute the scientific name string from genus + species (display only). */
export function computeScientificName(genus: string, species: string): string {
    const g = genus.trim();
    const s = species.trim();
    if (!g) return "";
    if (!s) return g;
    return `${g} ${s}`;
}

/** Parse a numeric form field — returns undefined if empty/NaN. */
export function parseOptionalNumber(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    return isNaN(n) ? undefined : n;
}

export const LIGHT_OPTIONS = [
    { value: "", label: "— not set —" },
    { value: "full_sun", label: "Full sun" },
    { value: "partial_shade", label: "Partial shade" },
    { value: "shade", label: "Shade" },
    { value: "indirect", label: "Indirect light" },
] as const;

export const DEFAULT_CULTIVAR_NORMALIZED = "__default__";

/** Returns true if this plant is a cultivar variant (not the base species). */
export function isVariant(plant: Plant): boolean {
    return Boolean(plant.cultivar) && plant.cultivar !== "";
}
