# RichFarm database extraction prompt

Copy the prompt below into a new Codex task when you need to recreate or adapt
RichFarm's data architecture. This is an architectural extraction, not a request
to blindly copy the gardening domain.

---

## Prompt

You are a senior TypeScript, React Native, Convex, Better Auth, and offline-sync
engineer. Design and implement a production-ready database layer using the
RichFarm architecture described below as a reference.

Before writing code:

1. Inspect the target project's existing files and dependencies.
2. Identify which parts of this reference are reusable infrastructure and which
   parts are RichFarm-only domain data.
3. Produce a short adaptation plan and table mapping.
4. Do not copy plant, garden, harvest, or taxonomy tables unless the target
   product actually needs them.
5. Preserve the important invariants: authenticated ownership, indexed reads,
   idempotent writes, explicit offline identity, optimistic concurrency,
   tombstones, and account-data deletion.

### 1. Existing RichFarm database topology

RichFarm has three separate persistence/authentication concerns. Do not merge
them accidentally:

- **Convex application database:** source of truth for the mobile application,
  user-owned data, reference content, subscriptions, storage metadata, and
  offline sync.
- **Better Auth Convex component:** owns Better Auth's internal user, session,
  account, verification, and anonymous-auth records. These tables are generated
  and managed by `@convex-dev/better-auth`; they are not declared in the
  application `schema.ts`.
- **SQLite admin database:** a separate backend/dashboard store containing
  admin accounts and a smaller mirror of master plant content. It uses its own
  JWT authentication and is not the mobile app's user database.

The target project should normally choose one application source of truth.
Keep a separate admin SQLite database only if there is a concrete operational
requirement for it.

### 2. Convex application schema

Every Convex document also has Convex-managed `_id` and `_creationTime`.

#### Identity, profile, settings, and entitlement

**`users`**

- `tokenIdentifier: string`
- `revenueCatAppUserId?: string`
- `name?: string`
- `email?: string`
- `avatarUrl?: string`
- `deviceId?: string`
- `isAnonymous?: boolean`
- `locale?: string`
- `timezone?: string`
- `zoneCode?: string`
- `frostDates?: { lastSpring?: string; firstFall?: string }`
- `notificationPreferences?: { watering: boolean; fertilizing: boolean;
  pruning: boolean; harvest: boolean; quietHoursStart?: string;
  quietHoursEnd?: string }`
- `aiConsent?: boolean`
- `subscription?: { tier: string; expiresAt?: number; source?: string }`
- `lastSyncAt?: number`
- `isActive: boolean`
- Indexes: `by_token(tokenIdentifier)`,
  `by_revenuecat_app_user_id(revenueCatAppUserId)`, `by_email(email)`

**`userSettings`**

- Ownership/sync: `userId`, `revision?`, `generation?`, `updatedAt?`
- UI: `appMode?`, `theme?`, `defaultView?`, `showWeatherCard?`
- Units: `unitSystem?`, `temperatureUnit?: "C" | "F"`
- Notifications/privacy: `emailNotifications?`, `pushNotifications?`,
  `shareAnonymousData?`
- `onboarding?: { role?; goals[]; scaleEnvironment[]; crops[]; experience;
  needs[]; purposeWeights?; environmentWeights?; completedAt; version? }`
- Index: `by_user(userId)`
- Intended invariant: at most one settings document per user.

**`deviceTokens`**

- `userId`, `deviceId`, `platform`, `token`, `isActive`, `lastUsedAt`
- Indexes: `by_user(userId)`, `by_device(deviceId)`, `by_token(token)`

#### User-owned garden hierarchy

**`gardens`**

- Sync/ownership: `userId`, `entityUuid?`, `revision?`
- Data: `name`, `areaM2?`, `locationType`, `description?`, `isDeleted?`
- Indexes: `by_user(userId)`, `by_user_entity_uuid(userId, entityUuid)`

**`beds`**

- Sync/ownership: `userId`, `entityUuid?`, `revision?`
- Parent: `gardenId?: Id<"gardens">`
- Data: `name`, `bedType?`, `tiers?`, `areaM2?`,
  `dimensions?: { widthCm; heightCm }`, `layoutJson?`, `locationType`,
  `sunlightHours?`, `soilType?`
- Sharing: `sharedWith?: Array<{ userId; role }>`
- Indexes: `by_user`, `by_user_entity_uuid`, `by_user_location`,
  `by_garden`

**`userPlants`**

- Sync/ownership: `userId`, `entityUuid?`, `revision?`, `version`,
  `clientId?`, `clientRequestId?`, `mergedInto?`, `isDeleted?`
- Reference/parents: `plantMasterId?`, `gardenId?`, `bedId?`
- Custom data: `nickname?`, `photoUrl?`, `notes?`
- Layout: `positionInBed?: { x; y; width; height }`
- Dates: `plantedAt?`, `seedStartDate?`, `transplantDate?`,
  `expectedHarvestDate?`, `actualHarvestDate?`, `archivedAt?`,
  `lastWateredAt?`, `lastFertilizedAt?`, `lastHarvestedAt?`
- State: `status`
- Overrides: `customCareRules?: { wateringDays?; fertilizingDays? }`
- Indexes: `by_user`, `by_user_entity_uuid`, `by_user_status`, `by_garden`,
  `by_bed`, `by_user_harvest_date`, `by_client_id`, `by_user_request`

#### Activity, media, scheduling, and harvest

**`logs`**

- `userId`, `userPlantId`, `entityUuid?`, `revision?`
- `type`, `value?: any`, `occurredAt?`, `recordedAt`, `source`, `localId?`,
  `title?`, `reminderId?`, `harvestRecordId?`, `photoUrl?`, `note?`
- Indexes: by plant, user/entity UUID, recorded date, occurred date,
  plant/type/occurred date, plant/local ID, harvest record, type, recorded time.

**`harvestRecords`**

- `userId`, `userPlantId`, `entityUuid?`, `revision?`, `localId?`
- `harvestDate`, `quantity?`, `unit?`, `quality?`, `notes?`, `photoUrl?`,
  `preservationRecipeId?`
- Indexes: by plant, user/entity UUID, plant/local ID, plant/date,
  harvest date.

**`plantPhotos`**

- `userPlantId`, denormalized `userId`, `entityUuid?`, `revision?`, `localId?`
- Storage: `photoUrl`, `thumbnailUrl?`, `storageId?`
- Metadata: `takenAt`, `uploadedAt`, `isPrimary`, `source`
- AI: `analysisResult?`, `aiModelVersion?`, `analysisStatus`
- Indexes: by plant, user/entity UUID, plant/local ID, plant/date,
  analysis status.

**`reminders`**

- `userId`, `userPlantId?`, `bedId?`
- Content: `type`, `title`, `description?`
- Schedule: `rrule?`, `nextRunAt`, `lastRunAt?`, `lastNotifiedAt?`
- State: `enabled`, `snoozedUntil?`, `priority?`, `notificationMethods?`
- Domain values: `waterLiters?`, `completedCount?`, `skippedCount?`
- Indexes: by user, user/next run, plant, bed, global next run.

**`aiAnalysisQueue`**

- `photoId`, `userPlantId`, `status`, `priority`, `attempts`,
  `lastAttemptAt?`, `errorMessage?`, `result?: any`, `completedAt?`
- Indexes: by status, status/priority, photo.

#### Master content and localization

**`plantsMaster`**

- Identity: `scientificName`, `genus?`, `species?`, `cultivar?`,
  `taxonomyParseStatus?: "ok" | "manual_review"`
- Classification: `group`, `family?`, `purposes[]`
- Legacy grouping: `basePlantId?`, `commonNameGroupKey?`,
  `commonNameGroupVi?`, `commonNameGroupEn?`
- Other: `pestsDiseases?`, `imageUrl?`, `source?`
- Indexes: by scientific name, group, family.

**`plantI18n`**

- `plantId`, `locale`, `commonName`, `description?`
- Indexes: `by_plant_locale`, `by_locale_common_name`
- Intended invariant: one row per `(plantId, locale)`.

**`plantCare`**

- `plantId`, harvest/germination timing, light/soil preferences, spacing,
  density, seed rate, water, yield, watering and fertilizing frequency.
- Index: `by_plant`

**`plantCareI18n`**

- `plantId`, `locale`, `careContent`, `contentVersion?`
- Index: `by_plant_locale`

**`plantRelations`**

- `plantId`, `relatedPlantId`, `relationType: "companion" | "avoid"`,
  `source?`
- Indexes: by plant, related plant, plant/relation type.

**`plantTaxonomyI18n`**

- `taxonomyKey`, `rank: "family" | "genus" | "species"`, `locale`
- Optional family/genus/species and normalized keys
- `commonName`, `description?`
- Indexes support taxonomy+locale, rank+locale, family, genus, and species
  navigation.

**`plantGroups`**

- `key`, localized `displayName`, localized `description?`, `iconUrl?`,
  `sortOrder`
- Indexes: by key and sort order.

**`pestsDiseases`**

- `key`, `type`, `name`, `imageUrl?`
- `identification[]`, `damage[]`, `prevention[]`
- `control: { physical[]; organic[]; chemical[] }`
- `plantsAffected[]`, `sortOrder`
- Indexes: by key, type, and type/sort order.

**`preservationRecipes`**

- `name`, `method`, `difficulty?`, `shelfLifeDays?`, `ingredients?`,
  `steps[]`, `suitablePlants[]`, `safetyNotes?`, `source?`, `authorId?`,
  `isVerified`, `ratingAvg?`, `ratingCount?`
- Indexes: by method, suitable plants, author.

**`recipeI18n`**

- `recipeId`, `locale`, `name`, `steps[]`, `safetyNotes?`
- Index: `by_recipe_locale`

#### Offline-sync protocol tables

**`syncOperationReceipts`**

- `userId`, `operationId`, `entityType`, `entityUuid`, `operationType`,
  `fingerprint`, `status`, `revision?`, `appliedAt`
- Unique lookup index: `by_user_operation(userId, operationId)`
- Purpose: make retried operations idempotent and detect operation-ID reuse
  with different payloads.

**`entityTombstones`**

- `userId`, `entityType`, `entityUuid`, `deleteOperationId`, `deletedAt`,
  `deletedRevision`
- Indexes: `by_user_entity`, `by_user_deleted_at`
- Purpose: prevent an offline client from resurrecting a deleted entity.

**`userPreferenceOperationReceipts`**

- `userId`, `operationId`, `fingerprint`, `revision`, `appliedAt`
- Index: `by_user_operation`

**`syncAccountState`**

- `userId`, `generation`, `createdAt`, `updatedAt`, `sequence?`
- Index: `by_user`
- Purpose: invalidate stale queues after account reset/claim/reconciliation.

**`syncRuntimeConfig`**

- Global rollout key, minimum client version, enforcement time, pause state,
  pause reason, health thresholds, update time.
- Index: `by_key`

**`syncOutcomeMetrics`**

- Aggregated `bucket`, `appVersion`, `entityType`, `status`, `count`,
  `updatedAt`
- Compound index over all dimensions.

**`syncUploadReservations`**

- `userId`, `operationId`, `entityUuid`, `storageId`, `createdAt`,
  `committedAt?`
- Indexes: by user/operation, creation time, storage ID.
- Purpose: connect a storage upload to the idempotent entity operation and
  clean up abandoned files.

### 3. Important Convex functions and behavior

Implement functions by domain. Every public function must authenticate the
caller server-side and derive ownership from the session; never trust a
client-supplied `userId`.

#### Authentication and user lifecycle

- `users.getCurrentUser`: resolve the current Convex app user from session.
- `users.getOrCreateUser`: bootstrap/upsert the app user after Better Auth
  establishes a session; optionally attach a device ID.
- `users.updateProfile`: update only whitelisted profile fields.
- `users.deleteAccount`: fetch Better Auth identity, delete all app-owned data
  in dependency order, delete the app user, then call Better Auth `deleteUser`.
  Sign-out remains a client responsibility.
- `authCleanup.cleanupStaleAnonymousUsers`: scheduled cleanup of abandoned
  anonymous accounts.
- `subscriptions.upsertSubscriptionFromRevenueCat`: internal webhook-side
  entitlement projection.

Better Auth configuration uses email/password, mandatory email verification,
password reset email, Expo integration, anonymous auth, and the Convex plugin.
Production requires `BETTER_AUTH_SECRET`; trusted origins must explicitly
include the mobile deep-link scheme.

#### User preferences

- `userSettings.getUserSettings`
- `userSettings.upsertUserSettings`
- `userSettings.applyPreferencesPatch`: generation check + base-revision check
  + operation receipt + canonical fingerprint.

#### Core CRUD

- Gardens: `getGardens`, `createGarden`, `updateGarden`, `deleteGarden`,
  `getBedsInGarden`
- Beds: `getBeds`, `createBed`, `updateBed`, `deleteBed`
- User plants: `getUserPlants`, `addPlant`, `updatePlantStatus`,
  `updatePlant`, `deletePlant`
- Favorites: `list`, `toggle`
- Logs: `addActivity`, `addLog`, `getLogsForPlant`, `deleteLog`
- Harvests: `addHarvest`, `getHarvests`, `deleteHarvest`, `getHarvestStats`
- Reminders: `getReminders`, `getTodayReminders`, `createReminder`,
  `toggleReminder`, `updateReminder`, `snoozeReminder`, `skipReminder`,
  `completeReminder`, `deleteReminder`
- Storage: `generateUploadUrl`, `registerSyncUpload`,
  `cleanupOrphanSyncUploads`, `savePhoto`, `deletePhoto`, `getStorageUrl`,
  `deleteStorageFile`
- Notifications: `registerDeviceToken`, internal `sendDueReminders`

#### Sync

RichFarm contains two generations:

- `sync.batchSync` is the legacy queue sync.
- `syncV2.ensureSession`, `syncV2.applyOperation`, `syncV2.syncSignal`, and
  `syncV2.snapshotPage` implement the newer protocol.

For new work, use the V2 ideas and do not build new features on the legacy
batch endpoint.

Required V2 operation behavior:

1. Operation has `operationId`, `syncGeneration`, `entityType`, `entityUuid`,
   operation type, optional `baseRevision`, parent UUID references, and payload.
2. Resolve entity by `(userId, entityUuid)` through an index.
3. Canonicalize the operation and compute a stable fingerprint.
4. If a receipt exists with the same fingerprint, return `already_applied`.
5. If a receipt exists with a different fingerprint, return
   `operation_conflict`.
6. Reject a stale `syncGeneration`.
7. For updates, compare `baseRevision` with current revision; return
   `revision_conflict` rather than silently overwriting.
8. Validate referenced parents and ownership.
9. On delete, create a tombstone so stale offline creates cannot resurrect it.
10. Record the receipt and outcome metrics.
11. Create/update related activity snapshots atomically in the same mutation.
12. Snapshot downloads must be paginated; never collect an unbounded
    user dataset.

#### Master content/admin

- Library: matching, list, taxonomy navigation, and search queries.
- Admin: plant CRUD, group CRUD, localization CRUD, photo CRUD, and bulk i18n.
- Migration/audit: taxonomy backfill, duplicate resolution, family
  normalization, care migration, invariant reports, and seed-alignment reports.
- Backend projection: `masterSync.upsertPlantFromBackend` and
  `masterSync.deletePlantFromBackend`.
- AI actions: `plantScan.detectPlant` and `detectPlantVision`.

### 4. SQLite admin database

This database is independent from Convex.

**`users`**

- Integer ID, unique email, bcrypt password hash
- Role constrained to `admin | editor | viewer`
- Active flag, created/updated timestamps
- Update trigger maintains `updated_at`

**`master_plants`**

- Unique `plant_code`
- Common/scientific name, category, group, family, purposes JSON
- Growth stage enum
- Harvest/germination timing
- Soil pH range with checks, moisture target, light hours
- Spacing, water, yield, image, active flag, notes, metadata JSON
- Created/updated timestamps and update trigger

**`master_plant_i18n`**

- FK to `master_plants` with `ON DELETE CASCADE`
- Locale constrained to `vi | en`
- Common name, description, care JSON, content version, timestamps
- Unique `(master_plant_id, locale)`

**`plant_measurements`**

- FK to `master_plants` with cascade
- Recorded time, temperature, humidity with 0–100 check, pH with 0–14 check,
  note, created time

SQLite helper functions:

- `createDatabase`: enable foreign keys and run migrations.
- `ensureColumn`: additive compatibility migration for older local files.
- `ensureBootstrapAdmin`: normalize email and create/update a bcrypt admin.
- `listUserTables`, `getTableMetadata`, `getAllTableMetadata`: safe
  introspection; validate identifiers before interpolating PRAGMA/table names.
- API auth: `/login`, `/me`, `requireAuth`, and `requireRole` use JWT with
  explicit issuer and audience.

Do not reuse the SQLite JWT admin-auth system for mobile users when Better Auth
already owns mobile authentication.

### 5. Non-negotiable implementation rules

1. Define a Convex schema and use `Id<"table">` references.
2. Add argument and return validators to all public functions.
3. Use object-style `query`, `mutation`, `action`, and internal functions.
4. Use indexes for all ownership, identity, scheduling, and pagination reads.
   Do not use `.filter()` as a substitute for a missing index.
5. Never accept ownership from client input. Resolve `userId` from auth.
6. Check both ownership and parent consistency before mutations.
7. Make retried writes idempotent using operation IDs and fingerprints.
8. Keep `occurredAt` separate from server-side `recordedAt`.
9. Use server timestamps for persistence/audit times.
10. Store canonical units; convert only for display.
11. Prefer literal unions and typed payload validators over unconstrained
    strings and `v.any()`.
12. Avoid JSON strings such as `layoutJson` when a stable typed object is
    possible.
13. Convex does not provide relational foreign-key cascades. Implement account
    deletion and dependent cleanup explicitly.
14. Keep public client functions small. Move privileged orchestration,
    migrations, webhooks, and scheduled work to internal functions.
15. Make cron/queue processors retry-safe and bound the amount of work per run.
16. Use Convex Storage IDs as the durable file reference. URLs can expire or
    change and should be derived when possible.
17. Add tests for authorization, cross-user access, duplicate operation IDs,
    revision conflict, stale generation, deletion/resurrection, orphan upload
    cleanup, and full account deletion.

### 6. Known RichFarm-specific debt; do not reproduce blindly

- Many status/type fields are generic strings instead of literal unions.
- Several public functions lack explicit return validators.
- `logs.value` and AI results use `v.any()`.
- Some structured data is stored as serialized JSON.
- Legacy and V2 sync coexist.
- Some soft-delete behavior is inconsistent across entity types.
- `userSettings.by_user` is an index, not a database-enforced unique
  constraint; mutations must preserve uniqueness.
- An index over an array field does not provide SQL-like membership semantics.
  Model join rows when membership queries are important.
- Taxonomy contains legacy grouping fields and additive migration fields.
- Master plant data exists in both SQLite and Convex, so synchronization and
  source-of-truth ownership must be explicit.
- There are two unrelated user/auth concepts: dashboard SQLite admins and
  mobile Better Auth users.

### 7. Required output

Return:

1. A target-domain table mapping showing `reuse`, `rename`, `replace`, or
   `omit` for every relevant RichFarm infrastructure concept.
2. A relationship diagram.
3. The proposed `convex/schema.ts`.
4. Auth/user bootstrap and account-deletion functions.
5. Indexed queries and validated mutations by domain.
6. Offline-sync protocol only if offline writes are a real requirement.
7. Migration/seed strategy.
8. Test plan and implemented critical tests.
9. A concise list of deliberate deviations from RichFarm and why they improve
   the target project.

Do not generate gardening tables merely to demonstrate completeness. The goal
is to preserve RichFarm's proven infrastructure patterns while designing a
clean schema for the target product.

---

## Source files used for this extraction

- `packages/convex/convex/schema.ts`
- `packages/convex/convex/auth.ts`
- `packages/convex/convex/users.ts`
- `packages/convex/convex/userSettings.ts`
- `packages/convex/convex/sync.ts`
- `packages/convex/convex/syncV2.ts`
- `packages/convex/convex/syncRuntime.ts`
- `packages/convex/convex/storage.ts`
- `packages/convex/convex/lib/syncProtocol.ts`
- `packages/convex/convex/lib/deleteUserData.ts`
- `apps/api/src/db.ts`
- `apps/api/src/auth.ts`
