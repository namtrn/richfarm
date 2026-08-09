export type PlantI18nLocaleRow = {
  scientificName: string;
  cultivar?: string;
  locale: string;
  commonName: string;
  description?: string;
  // Phase 3.1 provenance: source system and authored/imported origin.
  sourceSystem?: string;
  content_origin?: "authored" | "inherited" | "imported";
};
