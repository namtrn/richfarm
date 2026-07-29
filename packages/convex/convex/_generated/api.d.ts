/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authCleanup from "../authCleanup.js";
import type * as beds from "../beds.js";
import type * as carePlans from "../carePlans.js";
import type * as cron from "../cron.js";
import type * as data_pestsDiseasesSeed from "../data/pestsDiseasesSeed.js";
import type * as data_plantI18n_en from "../data/plantI18n/en.js";
import type * as data_plantI18n_es from "../data/plantI18n/es.js";
import type * as data_plantI18n_fr from "../data/plantI18n/fr.js";
import type * as data_plantI18n_index from "../data/plantI18n/index.js";
import type * as data_plantI18n_pt from "../data/plantI18n/pt.js";
import type * as data_plantI18n_types from "../data/plantI18n/types.js";
import type * as data_plantI18n_vi from "../data/plantI18n/vi.js";
import type * as data_plantI18n_zh from "../data/plantI18n/zh.js";
import type * as data_plantTaxonomyI18nSeed from "../data/plantTaxonomyI18nSeed.js";
import type * as data_plantsMasterSeed from "../data/plantsMasterSeed.js";
import type * as favorites from "../favorites.js";
import type * as gardens from "../gardens.js";
import type * as harvestRecords from "../harvestRecords.js";
import type * as http from "../http.js";
import type * as lib_appMode from "../lib/appMode.js";
import type * as lib_carePlan from "../lib/carePlan.js";
import type * as lib_deleteUserData from "../lib/deleteUserData.js";
import type * as lib_localizePlant from "../lib/localizePlant.js";
import type * as lib_ownership from "../lib/ownership.js";
import type * as lib_plantActivities from "../lib/plantActivities.js";
import type * as lib_plantCare from "../lib/plantCare.js";
import type * as lib_plantContentQuality from "../lib/plantContentQuality.js";
import type * as lib_plantTaxonomy from "../lib/plantTaxonomy.js";
import type * as lib_plantTaxonomyI18n from "../lib/plantTaxonomyI18n.js";
import type * as lib_revenuecat from "../lib/revenuecat.js";
import type * as lib_subscription from "../lib/subscription.js";
import type * as lib_syncProtocol from "../lib/syncProtocol.js";
import type * as lib_user from "../lib/user.js";
import type * as logs from "../logs.js";
import type * as masterSync from "../masterSync.js";
import type * as notifications from "../notifications.js";
import type * as pestsDiseases from "../pestsDiseases.js";
import type * as plantAdmin from "../plantAdmin.js";
import type * as plantCareMigration from "../plantCareMigration.js";
import type * as plantGroups from "../plantGroups.js";
import type * as plantI18n from "../plantI18n.js";
import type * as plantImages from "../plantImages.js";
import type * as plantLibrary from "../plantLibrary.js";
import type * as plantMasterFieldMigration from "../plantMasterFieldMigration.js";
import type * as plantScan from "../plantScan.js";
import type * as plantTaxonomyChecks from "../plantTaxonomyChecks.js";
import type * as plantTaxonomyMigration from "../plantTaxonomyMigration.js";
import type * as plants from "../plants.js";
import type * as preservationRecipes from "../preservationRecipes.js";
import type * as recipeI18n from "../recipeI18n.js";
import type * as reminders from "../reminders.js";
import type * as seed from "../seed.js";
import type * as storage from "../storage.js";
import type * as subscriptions from "../subscriptions.js";
import type * as sync from "../sync.js";
import type * as syncMigration from "../syncMigration.js";
import type * as syncRuntime from "../syncRuntime.js";
import type * as syncV2 from "../syncV2.js";
import type * as userSettings from "../userSettings.js";
import type * as users from "../users.js";
import type * as webhooks_revenuecat from "../webhooks/revenuecat.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authCleanup: typeof authCleanup;
  beds: typeof beds;
  carePlans: typeof carePlans;
  cron: typeof cron;
  "data/pestsDiseasesSeed": typeof data_pestsDiseasesSeed;
  "data/plantI18n/en": typeof data_plantI18n_en;
  "data/plantI18n/es": typeof data_plantI18n_es;
  "data/plantI18n/fr": typeof data_plantI18n_fr;
  "data/plantI18n/index": typeof data_plantI18n_index;
  "data/plantI18n/pt": typeof data_plantI18n_pt;
  "data/plantI18n/types": typeof data_plantI18n_types;
  "data/plantI18n/vi": typeof data_plantI18n_vi;
  "data/plantI18n/zh": typeof data_plantI18n_zh;
  "data/plantTaxonomyI18nSeed": typeof data_plantTaxonomyI18nSeed;
  "data/plantsMasterSeed": typeof data_plantsMasterSeed;
  favorites: typeof favorites;
  gardens: typeof gardens;
  harvestRecords: typeof harvestRecords;
  http: typeof http;
  "lib/appMode": typeof lib_appMode;
  "lib/carePlan": typeof lib_carePlan;
  "lib/deleteUserData": typeof lib_deleteUserData;
  "lib/localizePlant": typeof lib_localizePlant;
  "lib/ownership": typeof lib_ownership;
  "lib/plantActivities": typeof lib_plantActivities;
  "lib/plantCare": typeof lib_plantCare;
  "lib/plantContentQuality": typeof lib_plantContentQuality;
  "lib/plantTaxonomy": typeof lib_plantTaxonomy;
  "lib/plantTaxonomyI18n": typeof lib_plantTaxonomyI18n;
  "lib/revenuecat": typeof lib_revenuecat;
  "lib/subscription": typeof lib_subscription;
  "lib/syncProtocol": typeof lib_syncProtocol;
  "lib/user": typeof lib_user;
  logs: typeof logs;
  masterSync: typeof masterSync;
  notifications: typeof notifications;
  pestsDiseases: typeof pestsDiseases;
  plantAdmin: typeof plantAdmin;
  plantCareMigration: typeof plantCareMigration;
  plantGroups: typeof plantGroups;
  plantI18n: typeof plantI18n;
  plantImages: typeof plantImages;
  plantLibrary: typeof plantLibrary;
  plantMasterFieldMigration: typeof plantMasterFieldMigration;
  plantScan: typeof plantScan;
  plantTaxonomyChecks: typeof plantTaxonomyChecks;
  plantTaxonomyMigration: typeof plantTaxonomyMigration;
  plants: typeof plants;
  preservationRecipes: typeof preservationRecipes;
  recipeI18n: typeof recipeI18n;
  reminders: typeof reminders;
  seed: typeof seed;
  storage: typeof storage;
  subscriptions: typeof subscriptions;
  sync: typeof sync;
  syncMigration: typeof syncMigration;
  syncRuntime: typeof syncRuntime;
  syncV2: typeof syncV2;
  userSettings: typeof userSettings;
  users: typeof users;
  "webhooks/revenuecat": typeof webhooks_revenuecat;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
