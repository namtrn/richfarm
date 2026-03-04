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
    scientificName: "",
    group: "other",
    description: "",
    imageUrl: "",
    purposes: "",
    viCommonName: "",
    viDescription: "",
    enCommonName: "",
    enDescription: "",
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
