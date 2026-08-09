// ──────────────────────────────────────────────
// Data models (match Convex schema + SQLite backend)
// ──────────────────────────────────────────────

export type I18nRow = {
  locale: string;
  commonName: string;
  description?: string;
  careContent?: string;
  contentVersion?: number;
  source?: string;
  sourceUrl?: string;
  contentStatus?: string;
  reviewStatus?: string;
  reviewedAt?: number | string;
  reviewedBy?: string;
  contentOrigin?: "authored" | "inherited" | "imported";
};

export type Plant = {
  _id: string;
  // Taxonomy (new schema)
  family?: string;
  genus?: string;
  species?: string;
  cultivar?: string;
  genusNormalized?: string;
  speciesNormalized?: string;
  cultivarNormalized?: string;
  // Legacy compat field (computed from genus+species)
  scientificName: string;
  group: string;
  basePlantId?: string;
  commonNameGroupKey?: string;
  commonNameGroupVi?: string;
  commonNameGroupEn?: string;
  commonGenusNameVi?: string;
  commonGenusNameEn?: string;
  commonSpeciesNameVi?: string;
  commonSpeciesNameEn?: string;
  description?: string;
  imageUrl?: string | null;
  purposes?: string[];
  // Growing params
  typicalDaysToHarvest?: number;
  wateringFrequencyDays?: number;
  fertilizingFrequencyDays?: number;
  lightRequirements?: string;
  germinationDays?: number;
  spacingCm?: number;
  maxPlantsPerM2?: number;
  seedRatePerM2?: number;
  waterLitersPerM2?: number;
  yieldKgPerM2?: number;
  source?: string;
  sourceSystem?: string;
  sourceId?: string;
  recordVersion?: number;
  sourceUrl?: string;
  isActive?: boolean;
  contentStatus?: "draft" | "published" | "needs_review" | "archived";
  contentVersion?: number;
  reviewStatus?: "unreviewed" | "in_review" | "reviewed";
  reviewedAt?: number | string;
  reviewedBy?: string;
  careStatus?: "missing" | "awaiting_review" | "verified" | "not_applicable";
  contentTier?: "taxonomy_only" | "full_detail";
  growthStage?: string;
  soilPhMin?: number;
  soilPhMax?: number;
  moistureTarget?: number;
  lightHours?: number;
  notes?: string;
  i18nRows: I18nRow[];
};

export type PlantListPage = {
  items: Plant[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  viewMode?: "common" | "family";
  groupOptions: string[];
  stats: {
    total: number;
    missingI18n: number;
    missingImages: number;
  };
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
  source?: string;
  sourceUrl?: string;
  contentStatus?: string;
  reviewStatus?: string;
  reviewedAt?: number | string;
  reviewedBy?: string;
  contentOrigin?: "authored" | "inherited" | "imported";
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

export type BackendPlantStats = {
  total: number;
  active: number;
  inactive: number;
  missingVi: number;
  missingEn: number;
  missingImage: number;
};

// ──────────────────────────────────────────────
// Form state types
// ──────────────────────────────────────────────

export type PlantFormState = {
  // Taxonomy (replaces scientificName free-text)
  genus: string;
  species: string;
  cultivar: string; // empty string = base species
  // Classification
  group: string;
  basePlantId: string;
  commonNameGroupKey: string;
  commonNameGroupVi: string;
  commonNameGroupEn: string;
  commonGenusNameVi: string;
  commonGenusNameEn: string;
  commonSpeciesNameVi: string;
  commonSpeciesNameEn: string;
  imageUrl: string;
  purposes: string; // comma-separated
  // I18n
  viCommonName: string;
  viDescription: string;
  enCommonName: string;
  enDescription: string;
  // Growing params (stored as strings for input binding, parsed on save)
  typicalDaysToHarvest: string;
  wateringFrequencyDays: string;
  fertilizingFrequencyDays: string;
  germinationDays: string;
  spacingCm: string;
  lightRequirements: string;
  maxPlantsPerM2: string;
  seedRatePerM2: string;
  waterLitersPerM2: string;
  yieldKgPerM2: string;
  // Extra
  soilPhMin: string;
  soilPhMax: string;
  moistureTarget: string;
  lightHours: string;
  family: string;
  notes: string;
  isActive: boolean;
  growthStage: string;
  source: string;
  sourceSystem: string;
  sourceId: string;
  sourceUrl: string;
  recordVersion: string;
  contentStatus: "draft" | "published" | "needs_review" | "archived";
  contentVersion: string;
  reviewStatus: "unreviewed" | "in_review" | "reviewed";
  reviewedBy: string;
  careStatus: "missing" | "awaiting_review" | "verified" | "not_applicable";
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
  source: string;
  sourceUrl: string;
  contentStatus: "draft" | "published" | "needs_review" | "archived";
  reviewStatus: "unreviewed" | "in_review" | "reviewed";
  reviewedBy: string;
  contentOrigin: "authored" | "inherited" | "imported";
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

export type PageKey = "plants" | "groups" | "photos" | "import";

export type ToastType = "success" | "error" | "info" | "warning";

export type Toast = {
  id: number;
  type: ToastType;
  message: string;
};
