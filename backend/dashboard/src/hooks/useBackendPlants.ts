import { useState, useCallback } from "react";
import type { BackendPlantStats } from "../types";
import { downloadBlob } from "../constants";

type AuthedFetch = (path: string, options?: RequestInit) => Promise<Response>;

export function useBackendPlants(authedFetch: AuthedFetch) {
    const [stats, setStats] = useState<BackendPlantStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [importLoading, setImportLoading] = useState(false);
    const [error, setError] = useState("");

    const loadStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            const res = await authedFetch("/api/master-plants/stats");
            if (res.ok) {
                setStats(await res.json());
            }
        } catch {
            /* stats is non-critical */
        } finally {
            setStatsLoading(false);
        }
    }, [authedFetch]);

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
                const res = await authedFetch(`/api/master-plants/export?format=${format}`);
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

    return {
        stats, statsLoading, loadStats,
        bulkLoading, bulkAction,
        exportLoading, exportData,
        importLoading, importPlants,
        error, setError,
    };
}
