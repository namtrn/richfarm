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
import type * as lib_deleteUserData from "../lib/deleteUserData.js";
import type * as lib_localizePlant from "../lib/localizePlant.js";
import type * as lib_ownership from "../lib/ownership.js";
import type * as lib_plantCare from "../lib/plantCare.js";
import type * as lib_plantTaxonomy from "../lib/plantTaxonomy.js";
import type * as lib_plantTaxonomyI18n from "../lib/plantTaxonomyI18n.js";
import type * as lib_revenuecat from "../lib/revenuecat.js";
import type * as lib_subscription from "../lib/subscription.js";
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
  "lib/deleteUserData": typeof lib_deleteUserData;
  "lib/localizePlant": typeof lib_localizePlant;
  "lib/ownership": typeof lib_ownership;
  "lib/plantCare": typeof lib_plantCare;
  "lib/plantTaxonomy": typeof lib_plantTaxonomy;
  "lib/plantTaxonomyI18n": typeof lib_plantTaxonomyI18n;
  "lib/revenuecat": typeof lib_revenuecat;
  "lib/subscription": typeof lib_subscription;
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
  betterAuth: {
    adapter: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                data: {
                  createdAt: number;
                  displayUsername?: null | string;
                  email: string;
                  emailVerified: boolean;
                  image?: null | string;
                  isAnonymous?: null | boolean;
                  name: string;
                  phoneNumber?: null | string;
                  phoneNumberVerified?: null | boolean;
                  twoFactorEnabled?: null | boolean;
                  updatedAt: number;
                  userId?: null | string;
                  username?: null | string;
                };
                model: "user";
              }
            | {
                data: {
                  createdAt: number;
                  expiresAt: number;
                  ipAddress?: null | string;
                  token: string;
                  updatedAt: number;
                  userAgent?: null | string;
                  userId: string;
                };
                model: "session";
              }
            | {
                data: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId: string;
                  createdAt: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt: number;
                  userId: string;
                };
                model: "account";
              }
            | {
                data: {
                  createdAt: number;
                  expiresAt: number;
                  identifier: string;
                  updatedAt: number;
                  value: string;
                };
                model: "verification";
              }
            | {
                data: { backupCodes: string; secret: string; userId: string };
                model: "twoFactor";
              }
            | {
                data: {
                  aaguid?: null | string;
                  backedUp: boolean;
                  counter: number;
                  createdAt?: null | number;
                  credentialID: string;
                  deviceType: string;
                  name?: null | string;
                  publicKey: string;
                  transports?: null | string;
                  userId: string;
                };
                model: "passkey";
              }
            | {
                data: {
                  clientId?: null | string;
                  clientSecret?: null | string;
                  createdAt?: null | number;
                  disabled?: null | boolean;
                  icon?: null | string;
                  metadata?: null | string;
                  name?: null | string;
                  redirectURLs?: null | string;
                  type?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                model: "oauthApplication";
              }
            | {
                data: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  clientId?: null | string;
                  createdAt?: null | number;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                model: "oauthAccessToken";
              }
            | {
                data: {
                  clientId?: null | string;
                  consentGiven?: null | boolean;
                  createdAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                model: "oauthConsent";
              }
            | {
                data: {
                  createdAt: number;
                  privateKey: string;
                  publicKey: string;
                };
                model: "jwks";
              }
            | {
                data: {
                  count?: null | number;
                  key?: null | string;
                  lastRequest?: null | number;
                };
                model: "rateLimit";
              };
          onCreateHandle?: string;
          select?: Array<string>;
        },
        any
      >;
      deleteMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "twoFactorEnabled"
                    | "isAnonymous"
                    | "username"
                    | "displayUsername"
                    | "phoneNumber"
                    | "phoneNumberVerified"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "twoFactor";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "secret" | "backupCodes" | "userId" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "passkey";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "publicKey"
                    | "userId"
                    | "credentialID"
                    | "counter"
                    | "deviceType"
                    | "backedUp"
                    | "transports"
                    | "createdAt"
                    | "aaguid"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthApplication";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "icon"
                    | "metadata"
                    | "clientId"
                    | "clientSecret"
                    | "redirectURLs"
                    | "type"
                    | "disabled"
                    | "userId"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthAccessToken";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "refreshToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthConsent";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "consentGiven"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onDeleteHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any
      >;
      deleteOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "twoFactorEnabled"
                    | "isAnonymous"
                    | "username"
                    | "displayUsername"
                    | "phoneNumber"
                    | "phoneNumberVerified"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "twoFactor";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "secret" | "backupCodes" | "userId" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "passkey";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "publicKey"
                    | "userId"
                    | "credentialID"
                    | "counter"
                    | "deviceType"
                    | "backedUp"
                    | "transports"
                    | "createdAt"
                    | "aaguid"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthApplication";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "icon"
                    | "metadata"
                    | "clientId"
                    | "clientSecret"
                    | "redirectURLs"
                    | "type"
                    | "disabled"
                    | "userId"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthAccessToken";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "refreshToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthConsent";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "consentGiven"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onDeleteHandle?: string;
        },
        any
      >;
      findMany: FunctionReference<
        "query",
        "internal",
        {
          join?: any;
          limit?: number;
          model:
            | "user"
            | "session"
            | "account"
            | "verification"
            | "twoFactor"
            | "passkey"
            | "oauthApplication"
            | "oauthAccessToken"
            | "oauthConsent"
            | "jwks"
            | "rateLimit";
          offset?: number;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          sortBy?: { direction: "asc" | "desc"; field: string };
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
          }>;
        },
        any
      >;
      findOne: FunctionReference<
        "query",
        "internal",
        {
          join?: any;
          model:
            | "user"
            | "session"
            | "account"
            | "verification"
            | "twoFactor"
            | "passkey"
            | "oauthApplication"
            | "oauthAccessToken"
            | "oauthConsent"
            | "jwks"
            | "rateLimit";
          select?: Array<string>;
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
          }>;
        },
        any
      >;
      updateMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                update: {
                  createdAt?: number;
                  displayUsername?: null | string;
                  email?: string;
                  emailVerified?: boolean;
                  image?: null | string;
                  isAnonymous?: null | boolean;
                  name?: string;
                  phoneNumber?: null | string;
                  phoneNumberVerified?: null | boolean;
                  twoFactorEnabled?: null | boolean;
                  updatedAt?: number;
                  userId?: null | string;
                  username?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "twoFactorEnabled"
                    | "isAnonymous"
                    | "username"
                    | "displayUsername"
                    | "phoneNumber"
                    | "phoneNumberVerified"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  ipAddress?: null | string;
                  token?: string;
                  updatedAt?: number;
                  userAgent?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId?: string;
                  createdAt?: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId?: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  identifier?: string;
                  updatedAt?: number;
                  value?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "twoFactor";
                update: {
                  backupCodes?: string;
                  secret?: string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "secret" | "backupCodes" | "userId" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "passkey";
                update: {
                  aaguid?: null | string;
                  backedUp?: boolean;
                  counter?: number;
                  createdAt?: null | number;
                  credentialID?: string;
                  deviceType?: string;
                  name?: null | string;
                  publicKey?: string;
                  transports?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "publicKey"
                    | "userId"
                    | "credentialID"
                    | "counter"
                    | "deviceType"
                    | "backedUp"
                    | "transports"
                    | "createdAt"
                    | "aaguid"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthApplication";
                update: {
                  clientId?: null | string;
                  clientSecret?: null | string;
                  createdAt?: null | number;
                  disabled?: null | boolean;
                  icon?: null | string;
                  metadata?: null | string;
                  name?: null | string;
                  redirectURLs?: null | string;
                  type?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "icon"
                    | "metadata"
                    | "clientId"
                    | "clientSecret"
                    | "redirectURLs"
                    | "type"
                    | "disabled"
                    | "userId"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthAccessToken";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  clientId?: null | string;
                  createdAt?: null | number;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "refreshToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthConsent";
                update: {
                  clientId?: null | string;
                  consentGiven?: null | boolean;
                  createdAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "consentGiven"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                update: {
                  createdAt?: number;
                  privateKey?: string;
                  publicKey?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                update: {
                  count?: null | number;
                  key?: null | string;
                  lastRequest?: null | number;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onUpdateHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any
      >;
      updateOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                update: {
                  createdAt?: number;
                  displayUsername?: null | string;
                  email?: string;
                  emailVerified?: boolean;
                  image?: null | string;
                  isAnonymous?: null | boolean;
                  name?: string;
                  phoneNumber?: null | string;
                  phoneNumberVerified?: null | boolean;
                  twoFactorEnabled?: null | boolean;
                  updatedAt?: number;
                  userId?: null | string;
                  username?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "twoFactorEnabled"
                    | "isAnonymous"
                    | "username"
                    | "displayUsername"
                    | "phoneNumber"
                    | "phoneNumberVerified"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  ipAddress?: null | string;
                  token?: string;
                  updatedAt?: number;
                  userAgent?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId?: string;
                  createdAt?: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId?: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  identifier?: string;
                  updatedAt?: number;
                  value?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "twoFactor";
                update: {
                  backupCodes?: string;
                  secret?: string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "secret" | "backupCodes" | "userId" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "passkey";
                update: {
                  aaguid?: null | string;
                  backedUp?: boolean;
                  counter?: number;
                  createdAt?: null | number;
                  credentialID?: string;
                  deviceType?: string;
                  name?: null | string;
                  publicKey?: string;
                  transports?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "publicKey"
                    | "userId"
                    | "credentialID"
                    | "counter"
                    | "deviceType"
                    | "backedUp"
                    | "transports"
                    | "createdAt"
                    | "aaguid"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthApplication";
                update: {
                  clientId?: null | string;
                  clientSecret?: null | string;
                  createdAt?: null | number;
                  disabled?: null | boolean;
                  icon?: null | string;
                  metadata?: null | string;
                  name?: null | string;
                  redirectURLs?: null | string;
                  type?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "icon"
                    | "metadata"
                    | "clientId"
                    | "clientSecret"
                    | "redirectURLs"
                    | "type"
                    | "disabled"
                    | "userId"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthAccessToken";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  clientId?: null | string;
                  createdAt?: null | number;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "refreshToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthConsent";
                update: {
                  clientId?: null | string;
                  consentGiven?: null | boolean;
                  createdAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "consentGiven"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                update: {
                  createdAt?: number;
                  privateKey?: string;
                  publicKey?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                update: {
                  count?: null | number;
                  key?: null | string;
                  lastRequest?: null | number;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onUpdateHandle?: string;
        },
        any
      >;
    };
    adapterTest: {
      runCustomTests: FunctionReference<"action", "internal", any, any>;
      runTests: FunctionReference<"action", "internal", any, any>;
    };
  };
};
