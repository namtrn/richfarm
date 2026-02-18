// Richfarm — Convex Schema
// File: convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ==========================================
  // Users (đồng bộ với Convex Auth)
  // ==========================================
  users: defineTable({
    // Auth fields (từ Convex Auth)
    tokenIdentifier: v.string(),

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
    })),

    // Metadata
    lastSyncAt: v.optional(v.number()),
    isActive: v.boolean(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  // ==========================================
  // Gardens (top-level unit: Garden → Bed → Plant)
  // ==========================================
  gardens: defineTable({
    userId: v.id("users"),
    name: v.string(),

    // Size
    areaM2: v.optional(v.number()),

    // Environment
    locationType: v.string(), // "indoor", "outdoor", "greenhouse", "balcony"
    description: v.optional(v.string()),

    // Soft delete
    isDeleted: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"]),

  // ==========================================
  // Master Data: Plant Database
  // ==========================================
  plantsMaster: defineTable({
    scientificName: v.string(),
    commonNames: v.array(v.object({
      locale: v.string(),
      name: v.string(),
    })),

    // Classification
    group: v.string(), // "alliums", "herbs", "nightshades", ...
    family: v.optional(v.string()),
    purposes: v.array(v.string()), // ["cooking_spices", "indoor"]

    // Description
    description: v.optional(v.string()),

    // Growing info
    typicalDaysToHarvest: v.optional(v.number()),
    germinationDays: v.optional(v.number()),
    lightRequirements: v.optional(v.string()), // "full_sun", "partial_shade", "shade"
    soilPref: v.optional(v.string()),
    spacingCm: v.optional(v.number()),

    // Care schedule defaults
    wateringFrequencyDays: v.optional(v.number()),
    fertilizingFrequencyDays: v.optional(v.number()),

    // Relationships
    companionPlants: v.optional(v.array(v.id("plantsMaster"))),
    avoidPlants: v.optional(v.array(v.id("plantsMaster"))),
    pestsDiseases: v.optional(v.array(v.string())),

    // Media
    imageUrl: v.optional(v.string()),

    // Metadata
    source: v.optional(v.string()),
  })
    .index("by_scientific_name", ["scientificName"])
    .index("by_group", ["group"]),

  // ==========================================
  // Beds (belong to a Garden)
  // ==========================================
  beds: defineTable({
    userId: v.id("users"),
    gardenId: v.optional(v.id("gardens")), // belongs to garden
    name: v.string(),

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
    .index("by_user_location", ["userId", "locationType"])
    .index("by_garden", ["gardenId"]),

  // ==========================================
  // User's Plants
  // ==========================================
  userPlants: defineTable({
    userId: v.id("users"),
    plantMasterId: v.optional(v.id("plantsMaster")), // null nếu custom plant

    // Customization
    nickname: v.optional(v.string()),
    photoUrl: v.optional(v.string()), // Ảnh đại diện

    // Location
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

    // Status
    status: v.string(), // "planting", "growing", "harvested", "failed", "paused"
    notes: v.optional(v.string()),

    // Custom care rules (override defaults)
    customCareRules: v.optional(v.object({
      wateringDays: v.optional(v.number()),
      fertilizingDays: v.optional(v.number()),
    })),

    // Sync metadata (cho offline)
    clientId: v.optional(v.string()), // Device-generated ID
    version: v.number(), // For conflict resolution
    mergedInto: v.optional(v.id("userPlants")),

    // Soft delete
    isDeleted: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_bed", ["bedId"])
    .index("by_user_harvest_date", ["userId", "expectedHarvestDate"])
    .index("by_client_id", ["clientId"]),

  // ==========================================
  // Plant Photos
  // ==========================================
  plantPhotos: defineTable({
    userPlantId: v.id("userPlants"),
    userId: v.id("users"), // Denormalized for auth

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
    .index("by_user_plant_date", ["userPlantId", "takenAt"])
    .index("by_analysis_status", ["analysisStatus"]),

  // ==========================================
  // Reminders
  // ==========================================
  reminders: defineTable({
    userId: v.id("users"),
    userPlantId: v.optional(v.id("userPlants")),
    bedId: v.optional(v.id("beds")), // Reminder cho cả bed

    // Content
    type: v.string(), // "watering", "fertilizing", "pruning", "pest_check", "harvest", "custom"
    title: v.string(),
    description: v.optional(v.string()),

    // Scheduling
    rrule: v.optional(v.string()), // iCalendar RRULE
    nextRunAt: v.number(),
    lastRunAt: v.optional(v.number()),

    // State
    enabled: v.boolean(),
    snoozedUntil: v.optional(v.number()),
    priority: v.optional(v.number()), // 1-5
    notificationMethods: v.optional(v.array(v.string())), // ["push", "email", "in_app"]

    // Completion tracking
    completedCount: v.optional(v.number()),
    skippedCount: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_next_run", ["userId", "nextRunAt"])
    .index("by_user_plant", ["userPlantId"])
    .index("by_bed", ["bedId"])
    .index("by_next_run", ["nextRunAt"]), // For cron job

  // ==========================================
  // Activity Logs
  // ==========================================
  logs: defineTable({
    userId: v.id("users"),
    userPlantId: v.id("userPlants"),

    type: v.string(), // "watering", "fertilizing", "pruning", "pest_spotted", "treatment", "harvest", "note", "photo", "status_change"
    value: v.optional(v.any()), // Flexible data: { amountMl: 500, fertilizerType: "organic" }

    recordedAt: v.number(),
    source: v.string(), // "manual", "sensor", "auto", "reminder"

    // Optional references
    reminderId: v.optional(v.id("reminders")),
    photoUrl: v.optional(v.string()),
    note: v.optional(v.string()),
  })
    .index("by_user_plant", ["userPlantId"])
    .index("by_user_plant_date", ["userPlantId", "recordedAt"])
    .index("by_type", ["type"])
    .index("by_recorded_at", ["recordedAt"]),

  // ==========================================
  // Harvest Records
  // ==========================================
  harvestRecords: defineTable({
    userId: v.id("users"),
    userPlantId: v.id("userPlants"),

    harvestDate: v.number(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()), // "g", "kg", "piece", "bunch"
    quality: v.optional(v.string()), // "excellent", "good", "average", "poor"

    notes: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    preservationRecipeId: v.optional(v.id("preservationRecipes")),
  })
    .index("by_user_plant", ["userPlantId"])
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

    // App preferences
    theme: v.optional(v.string()), // "light", "dark", "system"
    defaultView: v.optional(v.string()), // "list", "grid", "calendar"

    // Units
    unitSystem: v.optional(v.string()), // "metric", "imperial"

    // Notifications
    emailNotifications: v.optional(v.boolean()),
    pushNotifications: v.optional(v.boolean()),

    // Privacy
    shareAnonymousData: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"]),
});

// Schema export for testing
import type { DataModel } from "./_generated/dataModel";
export type { DataModel };
