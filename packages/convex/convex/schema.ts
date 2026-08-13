// RichFarm — Convex Schema
// File: packages/convex/convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const propagationMethod = v.union(
  v.literal("seed"),
  v.literal("stem_cutting"),
  v.literal("leaf_cutting"),
  v.literal("root_cutting"),
  v.literal("division"),
  v.literal("air_layering"),
  v.literal("ground_layering"),
  v.literal("grafting"),
  v.literal("budding"),
  v.literal("bulb"),
  v.literal("corm"),
  v.literal("tuber"),
  v.literal("rhizome"),
  v.literal("runner"),
  v.literal("offset"),
  v.literal("sucker"),
  v.literal("spore"),
  v.literal("tissue_culture"),
);

const careSourceRef = v.object({
  sourceSystem: v.optional(v.string()),
  sourceName: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  sourceLocator: v.optional(v.string()),
});

export default defineSchema({
  // ==========================================
  // Users (đồng bộ với Convex Auth)
  // ==========================================
  users: defineTable({
    // Auth fields (từ Convex Auth)
    tokenIdentifier: v.string(),
    revenueCatAppUserId: v.optional(v.string()),

    // Profile
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),

    // Anonymous device users
    deviceId: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),

    // Localization
    locale: v.optional(v.string()), // "vi", "en"
    timezone: v.optional(v.string()), // "Asia/Ho_Chi_Minh"

    // Garden settings
    zoneCode: v.optional(v.string()), // USDA hardiness zone
    frostDates: v.optional(v.object({
      lastSpring: v.optional(v.string()), // "MM-DD"
      firstFall: v.optional(v.string()), // "MM-DD"
    })),

    // Preferences
    notificationPreferences: v.optional(v.object({
      watering: v.boolean(),
      fertilizing: v.boolean(),
      pruning: v.boolean(),
      harvest: v.boolean(),
      quietHoursStart: v.optional(v.string()), // "22:00"
      quietHoursEnd: v.optional(v.string()), // "08:00"
    })),

    // Privacy
    aiConsent: v.optional(v.boolean()), // Opt-in cho AI training

    // Subscription (nếu có)
    subscription: v.optional(v.object({
      tier: v.string(), // "free", "premium"
      expiresAt: v.optional(v.number()),
      source: v.optional(v.string()), // "revenuecat"
    })),

    // Metadata
    lastSyncAt: v.optional(v.number()),
    isActive: v.boolean(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_revenuecat_app_user_id", ["revenueCatAppUserId"])
    .index("by_email", ["email"]),

  // ==========================================
  // Gardens (top-level unit: Garden → Bed → Plant)
  // ==========================================
  gardens: defineTable({
    userId: v.id("users"),
    entityUuid: v.optional(v.string()),
    revision: v.optional(v.number()),
    name: v.string(),

    // Size
    areaM2: v.optional(v.number()),

    // Environment
    locationType: v.string(), // "indoor", "outdoor", "greenhouse", "balcony"
    description: v.optional(v.string()),

    // Soft delete
    isDeleted: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_entity_uuid", ["userId", "entityUuid"]),

  // ==========================================
  // Master Data: Plant Database
  // ==========================================
  plantsMaster: defineTable({
    scientificName: v.string(),

    // Stable synchronization identity. Legacy rows may omit these fields until
    // the additive backfill migration runs; projection code treats the legacy
    // source field as a compatibility fallback.
    sourceSystem: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    recordVersion: v.optional(v.number()),

    // Taxonomy identity (Phase 1 additive; required will be enforced later).
    genus: v.optional(v.string()),
    species: v.optional(v.string()),
    cultivar: v.optional(v.string()), // null/undefined means base species row
    taxonomyParseStatus: v.optional(
      v.union(v.literal("ok"), v.literal("manual_review"))
    ),

    // Classification
    group: v.string(), // business category: "alliums", "herbs", "nightshades", ...
    basePlantId: v.optional(v.id("plantsMaster")), // legacy base-species display cluster pointer
    commonNameGroupKey: v.optional(v.string()), // legacy display-cluster override
    commonNameGroupVi: v.optional(v.string()), // legacy display-cluster label
    commonNameGroupEn: v.optional(v.string()), // legacy display-cluster label
    family: v.optional(v.string()),
    purposes: v.array(v.string()), // ["cooking_spices", "indoor"]

    // Relationships
    pestsDiseases: v.optional(v.array(v.string())),

    // Media
    imageUrl: v.optional(v.string()),

    // Metadata
    source: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    contentStatus: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("published"),
        v.literal("needs_review"),
        v.literal("archived"),
      ),
    ),
    contentVersion: v.optional(v.number()),
    reviewStatus: v.optional(
      v.union(v.literal("unreviewed"), v.literal("in_review"), v.literal("reviewed")),
    ),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.string()),

    // Backend/admin fields kept on the canonical row instead of being hidden
    // in an opaque metadata blob.
    growthStage: v.optional(v.string()),
    // Rollout-only compatibility fields. Existing plantsMaster documents may
    // still carry these values until migratePlantMasterCareProfile has
    // copied them into plantCare and its report is verified at zero.
    soilPhMin: v.optional(v.number()),
    soilPhMax: v.optional(v.number()),
    moistureTarget: v.optional(v.number()),
    lightHours: v.optional(v.number()),
    notes: v.optional(v.string()),
  })
    .index("by_scientific_name", ["scientificName"])
    .index("by_group", ["group"])
    .index("by_family", ["family"])
    .index("by_source_identity", ["sourceSystem", "sourceId"])
    .index("by_active", ["isActive"]),

  // ==========================================
  // Master Data: Plant i18n
  // ==========================================
  plantI18n: defineTable({
    plantId: v.id("plantsMaster"),
    locale: v.string(),
    commonName: v.string(),
    description: v.optional(v.string()),
    source: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    contentStatus: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("published"),
        v.literal("needs_review"),
        v.literal("archived"),
      ),
    ),
    contentVersion: v.optional(v.number()),
    reviewStatus: v.optional(
      v.union(v.literal("unreviewed"), v.literal("in_review"), v.literal("reviewed")),
    ),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.string()),
    // Phase 3.1 content provenance: authored (written for this row),
    // inherited (projected from base species), imported (synced/seed with
    // provenance). `imported` requires source/provenance.
    contentOrigin: v.optional(
      v.union(
        v.literal("authored"),
        v.literal("inherited"),
        v.literal("imported"),
      ),
    ),
  })
    .index("by_plant_locale", ["plantId", "locale"])
    .index("by_locale_common_name", ["locale", "commonName"]),

  plantCare: defineTable({
    plantId: v.id("plantsMaster"),
    typicalDaysToHarvest: v.optional(v.number()),
    germinationDays: v.optional(v.number()),
    lightRequirements: v.optional(v.string()),
    soilPref: v.optional(v.string()),
    spacingCm: v.optional(v.number()),
    maxPlantsPerM2: v.optional(v.number()),
    seedRatePerM2: v.optional(v.number()),
    waterLitersPerM2: v.optional(v.number()),
    yieldKgPerM2: v.optional(v.number()),
    wateringFrequencyDays: v.optional(v.number()),
    fertilizingFrequencyDays: v.optional(v.number()),
    soilPhMin: v.optional(v.number()),
    soilPhMax: v.optional(v.number()),
    moistureTarget: v.optional(v.number()),
    lightHours: v.optional(v.number()),
    propagationMethods: v.optional(v.array(propagationMethod)),
    source: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    contentStatus: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("published"),
        v.literal("needs_review"),
        v.literal("archived"),
      ),
    ),
    contentVersion: v.optional(v.number()),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.string()),
    // Phase 3.1 record-level care status. Persisted aggregate of the per-field
    // evidence below; recomputed on every field/evidence change.
    careStatus: v.optional(
      v.union(
        v.literal("missing"),
        v.literal("awaiting_review"),
        v.literal("verified"),
        v.literal("not_applicable"),
      ),
    ),
    // Per-field evidence/sourceRefs. Keyed by care field name; the special
    // "__profile__" key marks the whole profile as not_applicable.
    careFieldEvidence: v.optional(
      v.record(
        v.string(),
        v.object({
          status: v.union(
            v.literal("missing"),
            v.literal("awaiting_review"),
            v.literal("verified"),
            v.literal("not_applicable"),
          ),
          sourceSystem: v.optional(v.string()),
          sourceName: v.optional(v.string()),
          sourceUrl: v.optional(v.string()),
          sourceLocator: v.optional(v.string()),
          sourceRefs: v.optional(v.array(careSourceRef)),
          fetchedAt: v.optional(v.number()),
          reviewedAt: v.optional(v.number()),
          reviewedBy: v.optional(v.string()),
        }),
      ),
    ),
  }).index("by_plant", ["plantId"]),

  plantCareI18n: defineTable({
    plantId: v.id("plantsMaster"),
    locale: v.string(),
    careContent: v.string(),
    // Timestamp of the published care guide currently visible to users.
    // Draft-only edits must not advance this value.
    contentUpdatedAt: v.optional(v.number()),
    contentVersion: v.optional(v.number()),
    source: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    contentStatus: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("published"),
        v.literal("needs_review"),
        v.literal("archived"),
      ),
    ),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.string()),
    sourceRefs: v.optional(v.array(careSourceRef)),
  }).index("by_plant_locale", ["plantId", "locale"]),

  plantRelations: defineTable({
    plantId: v.id("plantsMaster"),
    relatedPlantId: v.id("plantsMaster"),
    relationType: v.union(v.literal("companion"), v.literal("avoid")),
    source: v.optional(v.string()),
  })
    .index("by_plant", ["plantId"])
    .index("by_related_plant", ["relatedPlantId"])
    .index("by_plant_relation", ["plantId", "relationType"]),

  // ==========================================
  // Taxonomy localized names
  // ==========================================
  plantTaxonomyI18n: defineTable({
    taxonomyKey: v.string(),
    rank: v.union(
      v.literal("family"),
      v.literal("genus"),
      v.literal("species"),
    ),
    locale: v.string(),
    family: v.optional(v.string()),
    genus: v.optional(v.string()),
    genusNormalized: v.optional(v.string()),
    species: v.optional(v.string()),
    speciesNormalized: v.optional(v.string()),
    commonName: v.string(),
    description: v.optional(v.string()),
  })
    .index("by_taxonomy_locale", ["taxonomyKey", "locale"])
    .index("by_rank_locale", ["rank", "locale"])
    .index("by_family_locale", ["rank", "family", "locale"])
    .index("by_genus_locale", ["rank", "genusNormalized", "locale"])
    .index("by_species_locale", [
      "rank",
      "genusNormalized",
      "speciesNormalized",
      "locale",
    ]),

  // ==========================================
  // Master Data: Pests and Diseases
  // ==========================================
  pestsDiseases: defineTable({
    key: v.string(),
    type: v.string(), // "pest" | "disease"
    name: v.string(),
    imageUrl: v.optional(v.string()),
    identification: v.array(v.string()),
    damage: v.array(v.string()),
    prevention: v.array(v.string()),
    control: v.object({
      physical: v.array(v.string()),
      organic: v.array(v.string()),
      chemical: v.array(v.string()),
    }),
    plantsAffected: v.array(v.string()),
    sortOrder: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_type", ["type"])
    .index("by_type_sort", ["type", "sortOrder"]),

  // ==========================================
  // Beds (belong to a Garden)
  // ==========================================
  beds: defineTable({
    userId: v.id("users"),
    entityUuid: v.optional(v.string()),
    revision: v.optional(v.number()),
    gardenId: v.optional(v.id("gardens")), // belongs to garden
    name: v.string(),

    // Classification
    bedType: v.optional(v.string()), // "in_ground", "raised", "container", "no_dig"
    tiers: v.optional(v.number()),

    // Dimensions
    areaM2: v.optional(v.number()),
    dimensions: v.optional(v.object({
      widthCm: v.number(),
      heightCm: v.number(),
    })),

    // Layout
    layoutJson: v.optional(v.string()), // Serialized canvas layout

    // Environment
    locationType: v.string(), // "indoor", "outdoor", "greenhouse", "balcony"
    sunlightHours: v.optional(v.number()),
    soilType: v.optional(v.string()),

    // Sharing (multi-user)
    sharedWith: v.optional(v.array(v.object({
      userId: v.id("users"),
      role: v.string(), // "viewer", "editor"
    }))),
  })
    .index("by_user", ["userId"])
    .index("by_user_entity_uuid", ["userId", "entityUuid"])
    .index("by_user_location", ["userId", "locationType"])
    .index("by_garden", ["gardenId"]),

  // ==========================================
  // User's Plants
  // ==========================================
  userPlants: defineTable({
    userId: v.id("users"),
    entityUuid: v.optional(v.string()),
    revision: v.optional(v.number()),
    plantMasterId: v.optional(v.id("plantsMaster")), // null nếu custom plant

    // Customization
    nickname: v.optional(v.string()),
    photoUrl: v.optional(v.string()), // Ảnh đại diện

    // Location
    gardenId: v.optional(v.id("gardens")),
    bedId: v.optional(v.id("beds")),
    positionInBed: v.optional(v.object({
      x: v.number(),
      y: v.number(),
      width: v.number(),
      height: v.number(),
    })),

    // Timeline
    plantedAt: v.optional(v.number()), // timestamp
    seedStartDate: v.optional(v.number()),
    transplantDate: v.optional(v.number()),
    expectedHarvestDate: v.optional(v.number()),
    actualHarvestDate: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    lastWateredAt: v.optional(v.number()),
    lastFertilizedAt: v.optional(v.number()),
    lastHarvestedAt: v.optional(v.number()),

    // Status
    status: v.string(), // "planning", "growing", "dormant", "harvested", "archived", "failed"
    notes: v.optional(v.string()),

    // Custom care rules (override defaults)
    customCareRules: v.optional(v.object({
      wateringDays: v.optional(v.number()),
      fertilizingDays: v.optional(v.number()),
    })),

    // Sync metadata (cho offline)
    clientId: v.optional(v.string()), // Device-generated ID
    clientRequestId: v.optional(v.string()), // Idempotency key for Add Plant retries
    version: v.number(), // For conflict resolution
    mergedInto: v.optional(v.id("userPlants")),

    // Soft delete
    isDeleted: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_entity_uuid", ["userId", "entityUuid"])
    .index("by_user_status", ["userId", "status"])
    .index("by_garden", ["gardenId"])
    .index("by_bed", ["bedId"])
    .index("by_user_harvest_date", ["userId", "expectedHarvestDate"])
    .index("by_client_id", ["clientId"])
    .index("by_user_request", ["userId", "clientRequestId"]),

  // ==========================================
  // User Favorites (plantsMaster)
  // ==========================================
  userFavorites: defineTable({
    userId: v.id("users"),
    plantMasterId: v.id("plantsMaster"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_plant", ["userId", "plantMasterId"])
    .index("by_plant", ["plantMasterId"]),

  // ==========================================
  // Plant Photos
  // ==========================================
  plantPhotos: defineTable({
    userPlantId: v.id("userPlants"),
    userId: v.id("users"), // Denormalized for auth
    entityUuid: v.optional(v.string()),
    revision: v.optional(v.number()),
    localId: v.optional(v.string()),

    // Storage
    photoUrl: v.string(), // Storage URL or local path
    thumbnailUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")), // Reference to Convex Storage

    // Metadata
    takenAt: v.number(),
    uploadedAt: v.number(),
    isPrimary: v.boolean(),
    source: v.string(), // "camera", "gallery"

    // AI Analysis
    analysisResult: v.optional(v.object({
      confidence: v.number(),
      diseaseTags: v.optional(v.array(v.string())),
      growthStage: v.optional(v.string()),
      suggestions: v.optional(v.array(v.string())),
    })),
    aiModelVersion: v.optional(v.string()),
    analysisStatus: v.string(), // "pending", "success", "failed"
  })
    .index("by_user_plant", ["userPlantId"])
    .index("by_user_entity_uuid", ["userId", "entityUuid"])
    .index("by_user_plant_local", ["userPlantId", "localId"])
    .index("by_user_plant_date", ["userPlantId", "takenAt"])
    .index("by_analysis_status", ["analysisStatus"]),

  // ==========================================
  // Reminders
  // ==========================================
  reminders: defineTable({
    userId: v.id("users"),
    entityUuid: v.optional(v.string()),
    revision: v.optional(v.number()),
    userPlantId: v.optional(v.id("userPlants")),
    bedId: v.optional(v.id("beds")), // Reminder cho cả bed
    carePlanId: v.optional(v.id("userPlantCarePlans")),
    carePlanVersion: v.optional(v.number()),
    taskType: v.optional(v.string()),
    timezone: v.optional(v.string()),

    // Content
    type: v.string(), // "watering", "fertilizing", "pruning", "pest_check", "harvest", "custom"
    title: v.string(),
    description: v.optional(v.string()),

    // Scheduling
    rrule: v.optional(v.string()), // iCalendar RRULE
    nextRunAt: v.number(),
    lastRunAt: v.optional(v.number()),
    lastNotifiedAt: v.optional(v.number()),

    // State
    enabled: v.boolean(),
    snoozedUntil: v.optional(v.number()),
    priority: v.optional(v.number()), // 1-5
    notificationMethods: v.optional(v.array(v.string())), // ["push", "email", "in_app"]

    // Optional amounts
    waterLiters: v.optional(v.number()), // Stored in liters (convert for display)

    // Completion tracking
    completedCount: v.optional(v.number()),
    skippedCount: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_entity_uuid", ["userId", "entityUuid"])
    .index("by_user_next_run", ["userId", "nextRunAt"])
    .index("by_user_plant", ["userPlantId"])
    .index("by_bed", ["bedId"])
    .index("by_next_run", ["nextRunAt"]), // For cron job

  userPlantCarePlans: defineTable({
    userId: v.id("users"),
    userPlantId: v.id("userPlants"),
    entityUuid: v.string(),
    revision: v.number(),
    planVersion: v.number(),
    status: v.union(
      v.literal("draft"), v.literal("active"),
      v.literal("superseded"), v.literal("disabled")
    ),
    sourcePlantId: v.optional(v.id("plantsMaster")),
    sourceContentVersion: v.optional(v.number()),
    sourceLabel: v.optional(v.string()),
    sourceValues: v.object({
      wateringFrequencyDays: v.optional(v.number()),
      fertilizingFrequencyDays: v.optional(v.number()),
      typicalDaysToHarvest: v.optional(v.number()),
    }),
    tasks: v.array(v.object({
      type: v.union(
        v.literal("watering"), v.literal("fertilizing"),
        v.literal("pest_check"), v.literal("harvest_check")
      ),
      enabled: v.boolean(),
      intervalDays: v.optional(v.number()),
      expectedDate: v.optional(v.number()),
    })),
    activatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user_entity_uuid", ["userId", "entityUuid"])
    .index("by_user_plant", ["userId", "userPlantId"])
    .index("by_plant_version", ["userPlantId", "planVersion"]),

  reminderOutcomes: defineTable({
    userId: v.id("users"),
    userPlantId: v.optional(v.id("userPlants")),
    reminderId: v.id("reminders"),
    entityUuid: v.string(),
    revision: v.number(),
    operationId: v.string(),
    outcome: v.union(
      v.literal("performed"), v.literal("checked_not_needed"),
      v.literal("snoozed"), v.literal("skipped"), v.literal("edited"),
      v.literal("disabled"), v.literal("deleted")
    ),
    occurredAt: v.number(),
    recordedAt: v.number(),
    snoozedUntil: v.optional(v.number()),
    note: v.optional(v.string()),
    activityId: v.optional(v.id("logs")),
  })
    .index("by_user_entity_uuid", ["userId", "entityUuid"])
    .index("by_user_operation", ["userId", "operationId"])
    .index("by_reminder", ["reminderId"]),

  // ==========================================
  // Activity Logs
  // ==========================================
  logs: defineTable({
    userId: v.id("users"),
    userPlantId: v.id("userPlants"),
    entityUuid: v.optional(v.string()),
    revision: v.optional(v.number()),

    type: v.string(), // "watering", "fertilizing", "pruning", "pest_spotted", "treatment", "harvest", "note", "photo", "status_change"
    value: v.optional(v.any()), // Flexible data: { amountMl: 500, fertilizerType: "organic" }

    occurredAt: v.optional(v.number()), // when the real-world activity happened
    recordedAt: v.number(), // when RichFarm persisted the activity
    source: v.string(), // "manual", "sensor", "auto", "reminder"
    localId: v.optional(v.string()), // idempotency key for offline entries
    title: v.optional(v.string()),

    // Optional references
    reminderId: v.optional(v.id("reminders")),
    harvestRecordId: v.optional(v.id("harvestRecords")),
    photoUrl: v.optional(v.string()),
    note: v.optional(v.string()),
  })
    .index("by_user_plant", ["userPlantId"])
    .index("by_user_entity_uuid", ["userId", "entityUuid"])
    .index("by_user_plant_date", ["userPlantId", "recordedAt"])
    .index("by_user_plant_occurred", ["userPlantId", "occurredAt"])
    .index("by_user_plant_type_occurred", ["userPlantId", "type", "occurredAt"])
    .index("by_user_plant_local", ["userPlantId", "localId"])
    .index("by_harvest_record", ["harvestRecordId"])
    .index("by_type", ["type"])
    .index("by_recorded_at", ["recordedAt"]),

  // ==========================================
  // Harvest Records
  // ==========================================
  harvestRecords: defineTable({
    userId: v.id("users"),
    userPlantId: v.id("userPlants"),
    entityUuid: v.optional(v.string()),
    revision: v.optional(v.number()),

    localId: v.optional(v.string()),
    harvestDate: v.number(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()), // "g", "kg", "piece", "bunch"
    quality: v.optional(v.string()), // "excellent", "good", "average", "poor"

    notes: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    preservationRecipeId: v.optional(v.id("preservationRecipes")),
  })
    .index("by_user_plant", ["userPlantId"])
    .index("by_user_entity_uuid", ["userId", "entityUuid"])
    .index("by_user_plant_local", ["userPlantId", "localId"])
    .index("by_user_plant_date", ["userPlantId", "harvestDate"])
    .index("by_harvest_date", ["harvestDate"]),

  // ==========================================
  // Plant Groups (reference data)
  // ==========================================
  plantGroups: defineTable({
    key: v.string(), // "alliums", "herbs", ...
    displayName: v.record(v.string(), v.string()), // { vi: "Rau thơm", en: "Herbs" }
    description: v.optional(v.record(v.string(), v.string())),
    iconUrl: v.optional(v.string()),
    sortOrder: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_sort_order", ["sortOrder"]),

  // ==========================================
  // Adaptation taxonomy (canonical reference data, design doc §2.1)
  // ==========================================
  adaptationTerms: defineTable({
    code: v.string(), // stable machine identifier, e.g. "hot", "frost_free"
    dimension: v.string(), // "temperature" | "moisture" | "climate" | "season"
    status: v.string(), // "active" | "archived"
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_dimension_status_sort", ["dimension", "status", "sortOrder"])
    .index("by_code", ["code"]),

  adaptationTermI18n: defineTable({
    termCode: v.string(),
    locale: v.string(), // "vi" | "en" required for the publication gate; others later
    label: v.string(),
    description: v.optional(v.string()),
    translationStatus: v.string(), // "missing" | "machine_translated" | "qa_passed" | "human_reviewed" | "approved"
    updatedAt: v.number(),
  })
    .index("by_term_locale", ["termCode", "locale"])
    .index("by_locale", ["locale"]),

  // Plant geography — assignment join tables
  plantOriginCountries: defineTable({
    plantId: v.id("plantsMaster"),
    countryCode: v.string(), // ISO 3166-1 alpha-2, e.g. "US"
    sourceRefs: v.optional(v.array(careSourceRef)),
  })
    .index("by_plant", ["plantId"])
    .index("by_country", ["countryCode"]),

  plantProvenRegions: defineTable({
    plantId: v.id("plantsMaster"),
    countryCode: v.string(),
    subdivisionCode: v.optional(v.string()), // ISO 3166-2, deferred catalog, format-validated only
    sourceRefs: v.optional(v.array(careSourceRef)),
  })
    .index("by_plant", ["plantId"])
    .index("by_country", ["countryCode"]),

  plantAdaptationTerms: defineTable({
    plantId: v.id("plantsMaster"),
    termCode: v.string(),
    sourceRefs: v.optional(v.array(careSourceRef)),
  })
    .index("by_plant", ["plantId"])
    .index("by_term", ["termCode"]),

  // ==========================================
  // Recipe i18n
  // ==========================================
  recipeI18n: defineTable({
    recipeId: v.id("preservationRecipes"),
    locale: v.string(),
    name: v.string(),
    steps: v.array(v.string()),
    safetyNotes: v.optional(v.string()),
  })
    .index("by_recipe_locale", ["recipeId", "locale"]),

  // ==========================================
  // Preservation Recipes
  // ==========================================
  preservationRecipes: defineTable({
    name: v.string(),
    method: v.string(), // "dry", "salt", "ferment", "pickle", "freeze", "can", "other"
    difficulty: v.optional(v.string()), // "easy", "medium", "hard"
    shelfLifeDays: v.optional(v.number()),

    ingredients: v.optional(v.array(v.string())),
    steps: v.array(v.string()),

    suitablePlants: v.array(v.id("plantsMaster")),
    safetyNotes: v.optional(v.string()),

    source: v.optional(v.string()),
    authorId: v.optional(v.id("users")), // null nếu system
    isVerified: v.boolean(),

    // Stats
    ratingAvg: v.optional(v.number()),
    ratingCount: v.optional(v.number()),
  })
    .index("by_method", ["method"])
    .index("by_suitable_plants", ["suitablePlants"])
    .index("by_author", ["authorId"]),

  // ==========================================
  // Device Tokens (Push Notifications)
  // ==========================================
  deviceTokens: defineTable({
    userId: v.id("users"),
    deviceId: v.string(),
    platform: v.string(), // "ios", "android", "web"
    token: v.string(),
    isActive: v.boolean(),
    lastUsedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_device", ["deviceId"])
    .index("by_token", ["token"]),

  // Durable Expo dispatch state. One row represents one batched message for
  // one device token. The stable dispatch key lets cron retries and the
  // development trigger share the same ticket/receipt lifecycle.
  notificationDispatches: defineTable({
    userId: v.id("users"),
    dispatchKey: v.string(),
    batchKey: v.string(),
    tokenId: v.id("deviceTokens"),
    items: v.array(v.object({
      reminderId: v.id("reminders"),
      occurrenceKey: v.string(),
      scheduledAt: v.number(),
    })),
    status: v.union(
      v.literal("reserved"),
      v.literal("ticket_accepted"),
      v.literal("delivered"),
      v.literal("retryable"),
      v.literal("unknown"),
      v.literal("permanent_failure")
    ),
    expoTicketId: v.optional(v.string()),
    attemptCount: v.number(),
    lastAttemptAt: v.optional(v.number()),
    nextAttemptAt: v.optional(v.number()),
    receiptCheckAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    acceptedAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_dispatch_key", ["dispatchKey"])
    .index("by_user", ["userId"])
    .index("by_status_receipt", ["status", "receiptCheckAt"]),

  // ==========================================
  // AI Analysis Queue (for background processing)
  // ==========================================
  aiAnalysisQueue: defineTable({
    photoId: v.id("plantPhotos"),
    userPlantId: v.id("userPlants"),
    status: v.string(), // "pending", "processing", "completed", "failed"
    priority: v.number(), // 1-5

    // Retry
    attempts: v.number(),
    lastAttemptAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),

    // Result
    result: v.optional(v.any()), // Flexible analysis result payload
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_status_priority", ["status", "priority"])
    .index("by_photo", ["photoId"]),

  // ==========================================
  // User Settings / Preferences
  // ==========================================
  userSettings: defineTable({
    userId: v.id("users"),
    revision: v.optional(v.number()),
    generation: v.optional(v.string()),
    updatedAt: v.optional(v.number()),

    // App preferences
    appMode: v.optional(v.string()), // "farmer" | "gardener"
    theme: v.optional(v.string()), // "light", "dark", "system"
    defaultView: v.optional(v.string()), // "list", "grid", "calendar"
    showWeatherCard: v.optional(v.boolean()),

    // Units
    unitSystem: v.optional(v.string()), // "metric", "imperial"
    temperatureUnit: v.optional(v.union(v.literal("C"), v.literal("F"))),

    // Notifications
    emailNotifications: v.optional(v.boolean()),
    pushNotifications: v.optional(v.boolean()),

    // Privacy
    shareAnonymousData: v.optional(v.boolean()),

    // Onboarding profile (farm-first)
    onboarding: v.optional(
      v.object({
        role: v.optional(v.string()),
        goals: v.array(v.string()),
        scaleEnvironment: v.array(v.string()),
        crops: v.array(v.string()),
        experience: v.string(),
        needs: v.array(v.string()),
        purposeWeights: v.optional(v.record(v.string(), v.number())),
        environmentWeights: v.optional(v.record(v.string(), v.number())),
        completedAt: v.number(),
        version: v.optional(v.number()),
      })
    ),
  })
    .index("by_user", ["userId"]),

  syncOperationReceipts: defineTable({
    userId: v.id("users"),
    operationId: v.string(),
    entityType: v.string(),
    entityUuid: v.string(),
    operationType: v.string(),
    fingerprint: v.string(),
    status: v.string(),
    revision: v.optional(v.number()),
    appliedAt: v.number(),
  }).index("by_user_operation", ["userId", "operationId"]),

  entityTombstones: defineTable({
    userId: v.id("users"),
    entityType: v.string(),
    entityUuid: v.string(),
    deleteOperationId: v.string(),
    deletedAt: v.number(),
    deletedRevision: v.number(),
  })
    .index("by_user_entity", ["userId", "entityType", "entityUuid"])
    .index("by_user_deleted_at", ["userId", "deletedAt"]),

  userPreferenceOperationReceipts: defineTable({
    userId: v.id("users"),
    operationId: v.string(),
    fingerprint: v.string(),
    revision: v.number(),
    appliedAt: v.number(),
  }).index("by_user_operation", ["userId", "operationId"]),

  syncAccountState: defineTable({
    userId: v.id("users"),
    generation: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    sequence: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  syncRuntimeConfig: defineTable({
    key: v.string(),
    minimumSafeClientVersion: v.string(),
    legacyEnforcementAt: v.optional(v.number()),
    rolloutPaused: v.boolean(),
    pauseReason: v.optional(v.string()),
    thresholds: v.object({
      conflictRate: v.number(),
      wrongGenerationRate: v.number(),
      retryableRate: v.number(),
      quarantineRate: v.number(),
      minimumSampleSize: v.number(),
    }),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  syncOutcomeMetrics: defineTable({
    bucket: v.string(),
    appVersion: v.string(),
    entityType: v.string(),
    status: v.string(),
    count: v.number(),
    updatedAt: v.number(),
  }).index("by_bucket_dimensions", ["bucket", "appVersion", "entityType", "status"]),

  syncUploadReservations: defineTable({
    userId: v.id("users"),
    operationId: v.string(),
    entityUuid: v.string(),
    storageId: v.id("_storage"),
    createdAt: v.number(),
    committedAt: v.optional(v.number()),
  })
    .index("by_user_operation", ["userId", "operationId"])
    .index("by_created_at", ["createdAt"])
    .index("by_storage", ["storageId"]),
});

// Schema export for testing
import type { DataModel } from "./_generated/dataModel";
export type { DataModel };
