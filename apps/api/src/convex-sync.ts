type UnknownRecord = Record<string, unknown>;

export interface ConvexPlantLibraryItem {
  _id: string;
  scientificName: string;
  displayName: string;
  description?: string;
  i18nRows?: Array<{
    locale: string;
    commonName: string;
    description?: string;
  }>;
  group?: string;
  imageUrl?: string | null;
  typicalDaysToHarvest?: number;
  germinationDays?: number;
  spacingCm?: number;
  source?: string;
  purposes?: string[];
  waterLitersPerM2?: number;
  yieldKgPerM2?: number;
}

export interface ConvexSyncConfig {
  deployUrl?: string;
  adminKey?: string;
  adminFunctionKey?: string;
  upsertMutation: string;
  deleteMutation: string;
}

export class ConvexSyncService {
  private deployUrl?: string;
  private adminKey?: string;
  private adminFunctionKey?: string;
  private upsertMutation: string;
  private deleteMutation: string;

  constructor(config: ConvexSyncConfig) {
    this.deployUrl = config.deployUrl;
    this.adminKey = config.adminKey;
    this.adminFunctionKey = config.adminFunctionKey;
    this.upsertMutation = config.upsertMutation;
    this.deleteMutation = config.deleteMutation;
  }

  isEnabled(): boolean {
    return Boolean(this.deployUrl && this.adminKey);
  }

  isAdminProxyEnabled(): boolean {
    return Boolean(this.deployUrl && this.adminKey && this.adminFunctionKey);
  }

  canReadFromConvex(): boolean {
    return Boolean(this.deployUrl);
  }

  async syncUpsert(row: UnknownRecord): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.callMutation(this.upsertMutation, this.withAdminFunctionKey({
      source: "sqlite",
      row,
    }));
  }

  async syncDelete(rowId: number): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.callMutation(this.deleteMutation, this.withAdminFunctionKey({
      source: "sqlite",
      id: rowId,
    }));
  }

  async fetchMasterPlants(locale = "vi"): Promise<ConvexPlantLibraryItem[] | null> {
    if (!this.canReadFromConvex()) {
      return null;
    }

    return this.callQuery<ConvexPlantLibraryItem[]>("plantImages:getPlantsWithImages", { locale });
  }

  async adminQuery<T>(path: string, args: Record<string, unknown>): Promise<T> {
    if (!this.isAdminProxyEnabled()) {
      throw new Error("Convex admin proxy is not configured");
    }

    return this.callQuery<T>(path, this.withAdminFunctionKey(args), true);
  }

  async adminMutation<T>(path: string, args: Record<string, unknown>): Promise<T> {
    if (!this.isAdminProxyEnabled()) {
      throw new Error("Convex admin proxy is not configured");
    }

    return this.callMutation<T>(path, this.withAdminFunctionKey(args));
  }

  private withAdminFunctionKey(args: Record<string, unknown>): Record<string, unknown> {
    if (!this.adminFunctionKey) {
      throw new Error("Convex admin functions are not configured");
    }

    return {
      ...args,
      adminKey: this.adminFunctionKey,
    };
  }

  private async callMutation<T>(path: string, args: Record<string, unknown>): Promise<T> {
    const endpoint = `${this.deployUrl!.replace(/\/$/, "")}/api/mutation`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Convex ${this.adminKey}`,
      },
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
    includeAdminAuth = false,
  ): Promise<T> {
    const endpoint = `${this.deployUrl!.replace(/\/$/, "")}/api/query`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (includeAdminAuth && this.adminKey) {
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
