import { useState, useCallback } from "react";
import type { BackendPlantStats } from "../types";
import { downloadBlob } from "../constants";
import { validateCanonicalPlantIdentity } from "../../../../packages/shared/src/canonicalPlantIdentity";

type AuthedFetch = (path: string, options?: RequestInit) => Promise<Response>;

/** Import is create-only: scientific_name/common_name never infer identity. */
export function validateImportCanonicalIdentity(value: unknown): string | null {
    const result = validateCanonicalPlantIdentity(value);
    return result.ok ? null : result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

type ImportCanonicalPreview = {
    status?: "exact" | "near_match" | "new";
    exact?: { id?: number; plantCode?: string } | null;
    suggestions?: unknown[];
};

export type ImportCanonicalPreflight =
    | { ok: true; preview: ImportCanonicalPreview }
    | { ok: false; reason: "invalid" | "exact" | "preview_error"; error: string };

/**
 * Validate one import row and ask the API for an exact-match preview before
 * allowing the create request.  Exact matches are a user-visible failure,
 * while near matches remain suggestions and may still be imported explicitly.
 */
export async function preflightImportCanonicalIdentity(
    authedFetch: AuthedFetch,
    value: unknown,
): Promise<ImportCanonicalPreflight> {
    const identityError = validateImportCanonicalIdentity(value);
    if (identityError) return { ok: false, reason: "invalid", error: identityError };

    try {
        const previewResponse = await authedFetch("/api/master-plants/canonical-match-preview", {
            method: "POST",
            body: JSON.stringify(value),
        });
        const previewBody = await previewResponse.json().catch(() => ({}));
        if (!previewResponse.ok) {
            return {
                ok: false,
                reason: "preview_error",
                error: previewBody.error ?? previewBody.details ?? "Canonical identity preview failed",
            };
        }
        const preview = (previewBody.data ?? previewBody) as ImportCanonicalPreview;
        if (preview.status === "exact") {
            const label = preview.exact?.plantCode ? ` (${preview.exact.plantCode})` : "";
            return {
                ok: false,
                reason: "exact",
                error: `exact canonical match at plant ${preview.exact?.id ?? "unknown"}${label}`,
            };
        }
        return { ok: true, preview };
    } catch (error) {
        return {
            ok: false,
            reason: "preview_error",
            error: error instanceof Error ? error.message : "Canonical identity preview failed",
        };
    }
}

export function useBackendPlants(authedFetch: AuthedFetch, enabled = true) {
    const [stats, setStats] = useState<BackendPlantStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [importLoading, setImportLoading] = useState(false);
    const [syncJsonLoading, setSyncJsonLoading] = useState(false);
    const [syncSqliteLoading, setSyncSqliteLoading] = useState(false);
    const [queueLocalLoading, setQueueLocalLoading] = useState(false);
    const [error, setError] = useState("");

    const loadStats = useCallback(async () => {
        if (!enabled) {
            setStats(null);
            return;
        }
        setStatsLoading(true);
        try {
            const res = await authedFetch("/api/master-plants/stats?source=sqlite");
            if (res.ok) {
                setStats(await res.json());
            }
        } catch {
            /* stats is non-critical */
        } finally {
            setStatsLoading(false);
        }
    }, [authedFetch, enabled]);

    const bulkAction = useCallback(
        async (action: "activate" | "deactivate" | "delete", ids: number[]): Promise<number> => {
            if (ids.length === 0) return 0;
            setBulkLoading(true);
            setError("");
            try {
                const res = await authedFetch("/api/master-plants/bulk", {
                    method: "POST",
                    body: JSON.stringify({ action, ids }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "Bulk operation failed");
                return data.affected ?? 0;
            } catch (e) {
                setError(e instanceof Error ? e.message : "Bulk error");
                return 0;
            } finally {
                setBulkLoading(false);
            }
        },
        [authedFetch],
    );

    const exportData = useCallback(
        async (format: "json" | "csv") => {
            setExportLoading(true);
            setError("");
            try {
                const res = await authedFetch(`/api/master-plants/export?format=${format}&source=sqlite`);
                if (!res.ok) throw new Error("Export failed");
                const blob = await res.blob();
                const ext = format === "csv" ? "csv" : "json";
                downloadBlob(blob, `master-plants-${Date.now()}.${ext}`);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Export error");
            } finally {
                setExportLoading(false);
            }
        },
        [authedFetch],
    );

    /**
     * Import plants from a parsed JSON array.
     * Each row must have at least: plant_code, i18n.vi.common_name, i18n.en.common_name
     */
    const importPlants = useCallback(
        async (
            rows: unknown[],
            onProgress?: (done: number, total: number) => void,
        ): Promise<{ created: number; failed: number; errors: string[] }> => {
            setImportLoading(true);
            setError("");
            let created = 0;
            let failed = 0;
            const errors: string[] = [];
            for (let i = 0; i < rows.length; i++) {
                try {
                    const preflight = await preflightImportCanonicalIdentity(authedFetch, rows[i]);
                    if (!preflight.ok) {
                        failed++;
                        errors.push(`Row ${i + 1}: ${preflight.error}`);
                        onProgress?.(i + 1, rows.length);
                        continue;
                    }
                    const res = await authedFetch("/api/master-plants", {
                        method: "POST",
                        body: JSON.stringify(rows[i]),
                    });
                    if (res.ok) {
                        created++;
                    } else {
                        const data = await res.json();
                        failed++;
                        errors.push(`Row ${i + 1}: ${data.error ?? "Unknown error"}`);
                    }
                } catch (e) {
                    failed++;
                    errors.push(`Row ${i + 1}: ${e instanceof Error ? e.message : "Network error"}`);
                }
                onProgress?.(i + 1, rows.length);
            }
            setImportLoading(false);
            return { created, failed, errors };
        },
        [authedFetch],
    );

    const syncConvexToJson = useCallback(async (): Promise<string | null> => {
        setSyncJsonLoading(true);
        setError("");
        try {
            const res = await authedFetch("/api/content-sync/sync-convex-to-json", {
                method: "POST",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Sync failed");
            return data.message ?? "Convex content synced to JSON source";
        } catch (e) {
            setError(e instanceof Error ? e.message : "Sync error");
            return null;
        } finally {
            setSyncJsonLoading(false);
        }
    }, [authedFetch]);

    const syncConvexToSqlite = useCallback(async (): Promise<string | null> => {
        setSyncSqliteLoading(true);
        setError("");
        try {
            const res = await authedFetch("/api/master-plants/sync-convex-to-sqlite", {
                method: "POST",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Sync failed");
            await loadStats();
            return `Convex synced to backend DB (${data.upserted ?? 0} plants)`;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Sync error");
            return null;
        } finally {
            setSyncSqliteLoading(false);
        }
    }, [authedFetch, loadStats]);

    const publishSyncOutbox = useCallback(async (): Promise<string | null> => {
        setError("");
        try {
            const retryResponse = await authedFetch("/api/master-plants/sync-outbox/retry-failed", {
                method: "POST",
            });
            const retryBody = await retryResponse.json().catch(() => ({}));
            if (!retryResponse.ok) throw new Error(retryBody.error ?? "Cannot retry sync outbox");
            const processResponse = await authedFetch("/api/master-plants/sync-outbox/process", {
                method: "POST",
            });
            const processBody = await processResponse.json().catch(() => ({}));
            if (!processResponse.ok) throw new Error(processBody.error ?? "Cannot process sync outbox");
            await loadStats();
            return `Retried ${retryBody.retried ?? 0}; applied ${processBody.applied ?? 0}`;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Cannot retry sync outbox");
            return null;
        }
    }, [authedFetch, loadStats]);

    const queueLocalAuthoring = useCallback(async (): Promise<string | null> => {
        setQueueLocalLoading(true);
        setError("");
        try {
            const response = await authedFetch("/api/master-plants/sync-outbox/queue-local", {
                method: "POST",
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error ?? "Cannot queue local authoring rows");
            return `Queued ${body.queued ?? 0} local rows for publish (not published)`;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Cannot queue local authoring rows");
            return null;
        } finally {
            setQueueLocalLoading(false);
        }
    }, [authedFetch]);

    // Backwards-compatible label used by the existing retry banner. Both
    // actions execute the same explicit outbox publication path.
    const retrySyncOutbox = publishSyncOutbox;

    return {
        stats, statsLoading, loadStats,
        bulkLoading, bulkAction,
        exportLoading, exportData,
        importLoading, importPlants,
        syncJsonLoading, syncConvexToJson,
        syncSqliteLoading, syncConvexToSqlite,
        queueLocalLoading, queueLocalAuthoring,
        publishSyncOutbox, retrySyncOutbox,
        error, setError,
    };
}
