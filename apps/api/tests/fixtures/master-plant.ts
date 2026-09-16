import type { ConvexPlantLibraryItem } from "../../src/convex-sync";
import type { SqliteDatabase } from "../../src/db";
import {
  CANONICAL_IDENTITY_VERSION,
  canonicalKeyFromPlantIdentity,
  validateCanonicalPlantIdentity,
  type CanonicalInfraspecificRank,
  type CanonicalScope,
} from "../../../../packages/shared/src/canonicalPlantIdentity";

export interface CanonicalIdentityFields {
  genus: string;
  species: string;
  infraspecific_rank: CanonicalInfraspecificRank | null;
  infraspecific_name: string | null;
  cultivar: string | null;
  identity_scope: CanonicalScope;
  parent_master_plant_id: number | null;
  parent_canonical_key: string | null;
  canonical_identity_version: typeof CANONICAL_IDENTITY_VERSION;
  canonical_key: string;
}

export interface CanonicalPlantOverrides {
  plantCode?: string;
  commonName?: string;
  scientificName?: string | null;
  genus?: string;
  species?: string;
  infraspecificRank?: CanonicalInfraspecificRank | null;
  infraspecificName?: string | null;
  cultivar?: string | null;
  identityScope?: CanonicalScope;
  parentMasterPlantId?: number | null;
  parentCanonicalKey?: string | null;
  sourceSystem?: string;
  sourceId?: string | null;
  syncOrigin?: "local" | "convex" | "mirror";
  category?: string;
  group?: string;
  purposes?: string[];
  growthStage?: "seedling" | "vegetative" | "flowering" | "harvest";
  isActive?: boolean;
  metadataJson?: Record<string, unknown>;
}

/** Build a valid base identity using the production canonical-key contract. */
export function canonicalBaseIdentity(
  genus: string,
  species: string,
  options: {
    infraspecificRank?: CanonicalInfraspecificRank | null;
    infraspecificName?: string | null;
  } = {},
): CanonicalIdentityFields {
  const identity = {
    genus,
    species,
    rank: options.infraspecificRank ?? null,
    infraspecificName: options.infraspecificName ?? null,
    cultivar: null,
    scope: "base" as const,
    parentMasterPlantId: null,
    parentCanonicalKey: null,
  };
  const validated = validateCanonicalPlantIdentity(identity);
  if (!validated.ok) {
    throw new Error(`Invalid canonical base fixture: ${validated.issues.map((issue) => issue.message).join('; ')}`);
  }
  return {
    genus: validated.identity.genus,
    species: validated.identity.species,
    infraspecific_rank: validated.identity.rank || null,
    infraspecific_name: validated.identity.infraspecificName || null,
    cultivar: null,
    identity_scope: "base",
    parent_master_plant_id: null,
    parent_canonical_key: null,
    canonical_identity_version: CANONICAL_IDENTITY_VERSION,
    canonical_key: canonicalKeyFromPlantIdentity(identity),
  };
}

/** Build a valid cultivar identity linked to the supplied base identity. */
export function canonicalCultivarIdentity(
  base: Pick<CanonicalIdentityFields, "genus" | "species" | "infraspecific_rank" | "infraspecific_name" | "canonical_key">,
  cultivar: string,
  parentMasterPlantId: number | null = null,
): CanonicalIdentityFields {
  const identity = {
    genus: base.genus,
    species: base.species,
    rank: base.infraspecific_rank,
    infraspecificName: base.infraspecific_name,
    cultivar,
    scope: "cultivar" as const,
    parentMasterPlantId,
    parentCanonicalKey: base.canonical_key,
  };
  const validated = validateCanonicalPlantIdentity(identity);
  if (!validated.ok) {
    throw new Error(`Invalid canonical cultivar fixture: ${validated.issues.map((issue) => issue.message).join('; ')}`);
  }
  return {
    genus: validated.identity.genus,
    species: validated.identity.species,
    infraspecific_rank: validated.identity.rank || null,
    infraspecific_name: validated.identity.infraspecificName || null,
    cultivar: validated.identity.cultivar,
    identity_scope: "cultivar",
    parent_master_plant_id: parentMasterPlantId,
    parent_canonical_key: base.canonical_key,
    canonical_identity_version: CANONICAL_IDENTITY_VERSION,
    canonical_key: canonicalKeyFromPlantIdentity(identity),
  };
}

/** Build a complete SQLite/API-shaped canonical plant fixture. */
export function buildCanonicalPlant(overrides: CanonicalPlantOverrides = {}) {
  const genus = overrides.genus ?? "Testus";
  const species = overrides.species ?? "fixtureus";
  const identity = overrides.identityScope === "cultivar"
    ? canonicalCultivarIdentity(
      canonicalBaseIdentity(genus, species, {
        infraspecificRank: overrides.infraspecificRank,
        infraspecificName: overrides.infraspecificName,
      }),
      overrides.cultivar ?? "Test cultivar",
      overrides.parentMasterPlantId ?? null,
    )
    : canonicalBaseIdentity(genus, species, {
      infraspecificRank: overrides.infraspecificRank,
      infraspecificName: overrides.infraspecificName,
    });

  const metadataJson = overrides.metadataJson ?? {};
  return {
    plant_code: overrides.plantCode ?? "TEST_CANONICAL_PLANT",
    common_name: overrides.commonName ?? "Canonical fixture plant",
    scientific_name: overrides.scientificName ?? `${genus} ${species}`,
    ...identity,
    source_system: overrides.sourceSystem ?? "sqlite",
    source_id: overrides.sourceId ?? null,
    sync_origin: overrides.syncOrigin ?? "local",
    category: overrides.category ?? "general",
    group: overrides.group ?? "other",
    purposes: overrides.purposes ?? [],
    growth_stage: overrides.growthStage ?? "seedling",
    is_active: overrides.isActive ?? true,
    metadata_json: metadataJson,
  };
}

/** Insert one fully canonical master-plant row and return its numeric id. */
export function insertCanonicalPlant(
  db: SqliteDatabase,
  overrides: CanonicalPlantOverrides = {},
): number {
  const plant = buildCanonicalPlant(overrides);
  const result = db.prepare(`
    INSERT INTO master_plants (
      plant_code, common_name, scientific_name,
      canonical_identity_version, canonical_key,
      genus, species, infraspecific_rank, infraspecific_name,
      cultivar, identity_scope, parent_master_plant_id, parent_canonical_key,
      source_system, source_id, sync_origin,
      category, "group", purposes_json, growth_stage, is_active, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    plant.plant_code,
    plant.common_name,
    plant.scientific_name,
    plant.canonical_identity_version,
    plant.canonical_key,
    plant.genus,
    plant.species,
    plant.infraspecific_rank,
    plant.infraspecific_name,
    plant.cultivar,
    plant.identity_scope,
    plant.parent_master_plant_id,
    plant.parent_canonical_key,
    plant.source_system,
    plant.source_id,
    plant.sync_origin,
    plant.category,
    plant.group,
    JSON.stringify(plant.purposes),
    plant.growth_stage,
    plant.is_active ? 1 : 0,
    JSON.stringify(plant.metadata_json),
  );
  return Number(result.lastInsertRowid);
}

export interface CanonicalConvexPlantOverrides extends Partial<ConvexPlantLibraryItem> {
  _id?: string;
  scientificName?: string;
  displayName?: string;
  genus?: string;
  species?: string;
  cultivar?: string | null;
}

/** Build a trusted Convex snapshot with explicit structured taxonomy fields. */
export function buildCanonicalConvexPlant(
  overrides: CanonicalConvexPlantOverrides = {},
): ConvexPlantLibraryItem {
  const scientificName = overrides.scientificName ?? "Testus fixtureus";
  const [genus, species] = scientificName.trim().split(/\s+/, 2);
  const id = overrides._id ?? "convex-canonical-fixture";
  return {
    _id: id,
    scientificName,
    displayName: overrides.displayName ?? "Canonical fixture plant",
    genus: overrides.genus ?? genus,
    species: overrides.species ?? species,
    taxonomyParseStatus: "ok",
    sourceSystem: "convex",
    sourceId: id,
    isActive: true,
    group: "other",
    i18nRows: [
      { locale: "vi", commonName: "Cây kiểm thử" },
      { locale: "en", commonName: "Canonical fixture plant" },
    ],
    ...overrides,
  };
}
