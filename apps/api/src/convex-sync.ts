type UnknownRecord = Record<string, unknown>;

/** Environment variables used by the server-side Convex integration.
 *
 * These names are intentionally the only configuration details exposed by
 * readiness diagnostics. Values (especially admin credentials) must never be
 * returned to an HTTP client or written to logs.
 */
export const CONVEX_CONFIG_ENV_VARS = {
  deployUrl: "CONVEX_URL",
  adminKey: "CONVEX_ADMIN_KEY",
  serviceToken: "CONVEX_ADMIN_FUNCTION_KEY",
} as const;

export type ConvexConfigEnvVar = (typeof CONVEX_CONFIG_ENV_VARS)[keyof typeof CONVEX_CONFIG_ENV_VARS];

export const CONVEX_ADMIN_PROXY_CONFIG_VARS: readonly ConvexConfigEnvVar[] = [
  CONVEX_CONFIG_ENV_VARS.deployUrl,
  CONVEX_CONFIG_ENV_VARS.serviceToken,
];

export interface ConvexCapabilityReadiness {
  enabled: boolean;
  missing: ConvexConfigEnvVar[];
}

export interface ConvexReadiness {
  /** SQLite-to-Convex writes, authenticated by the app function token. */
  sync: ConvexCapabilityReadiness;
  /** Public/canonical Convex reads, which only require the deployment URL. */
  read: ConvexCapabilityReadiness;
  /** Admin query/mutation proxy, authenticated by the app function token. */
  adminProxy: ConvexCapabilityReadiness;
}

export interface ConvexPlantLibraryItem {
  _id: string;
  scientificName: string;
  displayName: string;
  description?: string;
  sourceSystem?: string;
  sourceId?: string;
  recordVersion?: number;
  sourceUrl?: string;
  isActive?: boolean;
  contentStatus?: "draft" | "published" | "needs_review" | "archived";
  contentVersion?: number;
  reviewStatus?: "unreviewed" | "in_review" | "reviewed";
  reviewedAt?: number;
  reviewedBy?: string;
  growthStage?: string;
  notes?: string;
  i18nRows?: Array<{
    locale: string;
    commonName: string;
    description?: string;
    careContent?: string;
    contentVersion?: number;
    source?: string;
    sourceUrl?: string;
    contentStatus?: "draft" | "published" | "needs_review" | "archived";
    reviewStatus?: "unreviewed" | "in_review" | "reviewed";
    reviewedAt?: number;
    reviewedBy?: string;
    contentOrigin?: "authored" | "inherited" | "imported";
  }>;
  group?: string;
  family?: string;
  cultivar?: string | null;
  cultivarNormalized?: string;
  imageUrl?: string | null;
  contentTier?: "taxonomy_only" | "full_detail";
  careStatus?: "missing" | "awaiting_review" | "verified" | "not_applicable";
  missingViCommonName?: boolean;
  typicalDaysToHarvest?: number;
  germinationDays?: number;
  spacingCm?: number;
  source?: string;
  purposes?: string[];
  waterLitersPerM2?: number;
  yieldKgPerM2?: number;
  wateringFrequencyDays?: number;
  fertilizingFrequencyDays?: number;
  soilPhMin?: number;
  soilPhMax?: number;
  moistureTarget?: number;
  lightHours?: number;
  lightRequirements?: string;
  maxPlantsPerM2?: number;
  seedRatePerM2?: number;
}

export interface ConvexSyncConfig {
  deployUrl?: string;
  adminKey?: string;
  serviceToken?: string;
  upsertMutation: string;
  deleteMutation: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function missingFor(values: Array<[ConvexConfigEnvVar, string | undefined]>): ConvexConfigEnvVar[] {
  return values.filter(([, value]) => !value).map(([name]) => name);
}

/**
 * Build a safe, value-free readiness snapshot for the Convex integration.
 * This helper is exported for health checks/tests without exposing secrets.
 */
export function getConvexReadiness(config: Pick<ConvexSyncConfig, "deployUrl" | "adminKey" | "serviceToken">): ConvexReadiness {
  const values: Array<[ConvexConfigEnvVar, string | undefined]> = [
    [CONVEX_CONFIG_ENV_VARS.deployUrl, nonEmpty(config.deployUrl)],
    [CONVEX_CONFIG_ENV_VARS.adminKey, nonEmpty(config.adminKey)],
    [CONVEX_CONFIG_ENV_VARS.serviceToken, nonEmpty(config.serviceToken)],
  ];
  const readMissing = missingFor([values[0]]);
  // App functions authenticate themselves from `serviceToken` in the
  // encoded args. CONVEX_ADMIN_KEY is a deployment-admin credential and is
  // intentionally optional for these service-token paths.
  const serviceTokenMissing = missingFor([values[0], values[2]]);

  return {
    sync: {
      enabled: serviceTokenMissing.length === 0,
      missing: serviceTokenMissing,
    },
    read: {
      enabled: readMissing.length === 0,
      missing: readMissing,
    },
    adminProxy: {
      enabled: serviceTokenMissing.length === 0,
      missing: serviceTokenMissing,
    },
  };
}

export class ConvexSyncService {
  private deployUrl?: string;
  private adminKey?: string;
  private serviceToken?: string;
  private upsertMutation: string;
  private deleteMutation: string;

  constructor(config: ConvexSyncConfig) {
    this.deployUrl = nonEmpty(config.deployUrl);
    this.adminKey = nonEmpty(config.adminKey);
    this.serviceToken = nonEmpty(config.serviceToken);
    this.upsertMutation = config.upsertMutation;
    this.deleteMutation = config.deleteMutation;
  }

  /** Return value-free capability readiness for health endpoints and logs. */
  getReadiness(): ConvexReadiness {
    return getConvexReadiness({
      deployUrl: this.deployUrl,
      adminKey: this.adminKey,
      serviceToken: this.serviceToken,
    });
  }

  isEnabled(): boolean {
    return this.getReadiness().sync.enabled;
  }

  isAdminProxyEnabled(): boolean {
    return this.getReadiness().adminProxy.enabled;
  }

  canReadFromConvex(): boolean {
    return this.getReadiness().read.enabled;
  }

  async syncUpsert(row: UnknownRecord): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.callMutation(this.upsertMutation, this.withServiceToken({
      source: "sqlite",
      row,
    }));
  }

  async syncDelete(identity: {
    id?: number;
    sourceSystem?: string | null;
    sourceId?: string | null;
  }): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.callMutation(this.deleteMutation, this.withServiceToken({
      source: "sqlite",
      id: identity.id,
      source_system: identity.sourceSystem ?? undefined,
      source_id: identity.sourceId ?? undefined,
    }));
  }

  async fetchMasterPlants(locale = "vi"): Promise<ConvexPlantLibraryItem[] | null> {
    if (!this.canReadFromConvex()) {
      return null;
    }

    return this.callQuery<ConvexPlantLibraryItem[]>("plantLibrary:listCanonical", { locale });
  }

  async fetchAdminMasterPlants(locale = "vi"): Promise<ConvexPlantLibraryItem[] | null> {
    if (!this.isAdminProxyEnabled()) {
      return null;
    }

    return this.adminQuery<ConvexPlantLibraryItem[]>("masterSync:listAll", { locale });
  }

  async adminQuery<T>(path: string, args: Record<string, unknown>): Promise<T> {
    if (!this.isAdminProxyEnabled()) {
      throw new Error("Convex admin proxy is not configured");
    }

    // The Convex function validates serviceToken. Do not send a deployment
    // admin key here: it may belong to a different Convex deployment and is
    // not required by the app-function contract.
    return this.callQuery<T>(path, this.withServiceToken(args));
  }

  async adminMutation<T>(path: string, args: Record<string, unknown>): Promise<T> {
    if (!this.isAdminProxyEnabled()) {
      throw new Error("Convex admin proxy is not configured");
    }

    return this.callMutation<T>(path, this.withServiceToken(args));
  }

  private withServiceToken(args: Record<string, unknown>): Record<string, unknown> {
    if (!this.serviceToken) {
      throw new Error("Convex admin functions are not configured");
    }

    return {
      ...args,
      serviceToken: this.serviceToken,
    };
  }

  private async callMutation<T>(
    path: string,
    args: Record<string, unknown>,
    includeDeploymentAdminAuth = false,
  ): Promise<T> {
    const endpoint = `${this.deployUrl!.replace(/\/$/, "")}/api/mutation`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Service-token mutations do not need deployment-admin authorization.
    // Keep this opt-in for any future endpoint that explicitly requires the
    // optional deployment credential.
    if (includeDeploymentAdminAuth && this.adminKey) {
      headers.Authorization = `Convex ${this.adminKey}`;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ path, args, format: "convex_encoded_json" }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Convex sync failed (${response.status}): ${body.slice(0, 400)}`);
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          status?: string;
          value?: T;
          errorMessage?: string;
        }
      | null;

    if (payload && payload.status && payload.status !== "success") {
      throw new Error(`Convex mutation failed: ${payload.errorMessage ?? "unknown error"}`);
    }

    return (payload?.value ?? undefined) as T;
  }

  private async callQuery<T>(
    path: string,
    args: Record<string, unknown>,
    includeDeploymentAdminAuth = false,
  ): Promise<T> {
    const endpoint = `${this.deployUrl!.replace(/\/$/, "")}/api/query`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Keep the optional deployment-admin transport available for a future
    // endpoint that explicitly needs it, but service-token calls must leave
    // this header unset.
    if (includeDeploymentAdminAuth && this.adminKey) {
      headers.Authorization = `Convex ${this.adminKey}`;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ path, args, format: "convex_encoded_json" }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Convex query failed (${response.status}): ${body.slice(0, 400)}`);
    }

    const payload = (await response.json()) as {
      status?: string;
      value?: T;
      errorMessage?: string;
    };

    if (payload.status !== "success") {
      throw new Error(`Convex query failed: ${payload.errorMessage ?? "unknown error"}`);
    }

    return payload.value as T;
  }
}
