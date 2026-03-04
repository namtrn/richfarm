// ──────────────────────────────────────────────
// Data models (match Convex schema)
// ──────────────────────────────────────────────

export type I18nRow = {
  locale: string;
  commonName: string;
  description?: string;
  careContent?: string;
  contentVersion?: number;
};

export type Plant = {
  _id: string;
  scientificName: string;
  group: string;
  description?: string;
  imageUrl?: string | null;
  purposes?: string[];
  typicalDaysToHarvest?: number;
  wateringFrequencyDays?: number;
  lightRequirements?: string;
  germinationDays?: number;
  spacingCm?: number;
  maxPlantsPerM2?: number;
  seedRatePerM2?: number;
  waterLitersPerM2?: number;
  yieldKgPerM2?: number;
  source?: string;
  i18nRows: I18nRow[];
};

export type PlantGroup = {
  _id: string;
  key: string;
  displayName: Record<string, string>;
  description?: Record<string, string>;
  iconUrl?: string;
  sortOrder: number;
};

export type PlantI18nRow = {
  _id: string;
  plantId: string;
  locale: string;
  commonName: string;
  description?: string;
  careContent?: string;
  contentVersion?: number;
  plantScientificName?: string;
  plantGroup?: string;
};

export type PlantPhoto = {
  _id: string;
  userPlantId: string;
  userId: string;
  localId?: string;
  photoUrl: string;
  thumbnailUrl?: string;
  storageId?: string;
  takenAt: number;
  uploadedAt: number;
  isPrimary: boolean;
  source: string;
  analysisStatus: string;
  analysisResult?: unknown;
  aiModelVersion?: string;
};

// ──────────────────────────────────────────────
// Form state types
// ──────────────────────────────────────────────

export type PlantFormState = {
  scientificName: string;
  group: string;
  description: string;
  imageUrl: string;
  purposes: string;
  viCommonName: string;
  viDescription: string;
  enCommonName: string;
  enDescription: string;
};

export type GroupFormState = {
  key: string;
  displayNameVi: string;
  displayNameEn: string;
  descriptionVi: string;
  descriptionEn: string;
  iconUrl: string;
  sortOrder: string;
};

export type I18nFormState = {
  plantId: string;
  locale: string;
  commonName: string;
  description: string;
  careContent: string;
  contentVersion: string;
};

export type PhotoFormState = {
  userPlantId: string;
  userId: string;
  localId: string;
  photoUrl: string;
  thumbnailUrl: string;
  storageId: string;
  takenAt: string;
  uploadedAt: string;
  isPrimary: boolean;
  source: string;
  analysisStatus: string;
  analysisResult: string;
  aiModelVersion: string;
};

// ──────────────────────────────────────────────
// UI types
// ──────────────────────────────────────────────

export type Mode = "view" | "edit" | "create";

export type PageKey = "plants" | "groups" | "photos";

export type ToastType = "success" | "error" | "info";

export type Toast = {
  id: number;
  type: ToastType;
  message: string;
};
