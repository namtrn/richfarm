type UnknownRecord = Record<string, unknown>;

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
}
