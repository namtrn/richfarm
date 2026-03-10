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
  upsertMutation: string;
  deleteMutation: string;
}

export class ConvexSyncService {
  private deployUrl?: string;
  private adminKey?: string;
  private upsertMutation: string;
  private deleteMutation: string;

  constructor(config: ConvexSyncConfig) {
    this.deployUrl = config.deployUrl;
    this.adminKey = config.adminKey;
    this.upsertMutation = config.upsertMutation;
    this.deleteMutation = config.deleteMutation;
  }

  isEnabled(): boolean {
    return Boolean(this.deployUrl && this.adminKey);
  }

  canReadFromConvex(): boolean {
    return Boolean(this.deployUrl);
  }

  async syncUpsert(row: UnknownRecord): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.callMutation(this.upsertMutation, {
      source: "sqlite",
      row,
    });
  }

  async syncDelete(rowId: number): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.callMutation(this.deleteMutation, {
      source: "sqlite",
      id: rowId,
    });
  }

  async fetchMasterPlants(locale = "vi"): Promise<ConvexPlantLibraryItem[] | null> {
    if (!this.canReadFromConvex()) {
      return null;
    }

    return this.callQuery<ConvexPlantLibraryItem[]>("plantImages:getPlantsWithImages", { locale });
  }

  private async callMutation(path: string, args: Record<string, unknown>): Promise<void> {
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
  }

  private async callQuery<T>(path: string, args: Record<string, unknown>): Promise<T> {
    const endpoint = `${this.deployUrl!.replace(/\/$/, "")}/api/query`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
