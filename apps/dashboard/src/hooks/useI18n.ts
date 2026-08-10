import { useState, useMemo, useCallback } from "react";
import type { PlantI18nRow, I18nFormState, Mode, Plant } from "../types";
import { emptyI18nForm, type AuthedFetch } from "../constants";

type BackendI18nRow = {
    id: number | string;
    master_plant_id: number | string;
    locale: string;
    common_name: string;
    description?: string | null;
    care_content_json?: Record<string, unknown> | null;
    content_version?: number;
    source?: string | null;
    source_url?: string | null;
    content_status?: string;
    review_status?: string;
    reviewed_at?: string | null;
    reviewed_by?: string | null;
    content_origin?: "authored" | "inherited" | "imported";
    plant_scientific_name?: string | null;
    plant_group?: string | null;
};

function mapBackendI18n(row: BackendI18nRow): PlantI18nRow {
    return {
        _id: String(row.id),
        plantId: String(row.master_plant_id),
        locale: row.locale,
        commonName: row.common_name,
        description: row.description ?? undefined,
        careContent: JSON.stringify(row.care_content_json ?? {}),
        contentVersion: row.content_version,
        source: row.source ?? undefined,
        sourceUrl: row.source_url ?? undefined,
        contentStatus: row.content_status,
        reviewStatus: row.review_status,
        reviewedAt: row.reviewed_at ?? undefined,
        reviewedBy: row.reviewed_by ?? undefined,
        contentOrigin: row.content_origin ?? "imported",
        plantScientificName: row.plant_scientific_name ?? undefined,
        plantGroup: row.plant_group ?? undefined,
    };
}

function normalizeSearch(value: unknown): string {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function parseCareContent(value: string): Record<string, unknown> {
    if (!value.trim()) return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        // Keep authored free-form care text lossless while the API persists a
        // JSON object. Structured callers still round-trip their original map.
        return { text: value };
    }
}

function toFormState(row: PlantI18nRow): I18nFormState {
    return {
        plantId: row.plantId,
        locale: row.locale,
        commonName: row.commonName ?? "",
        description: row.description ?? "",
        careContent: row.careContent ?? "",
        contentVersion: row.contentVersion ? String(row.contentVersion) : "",
        source: row.source ?? "",
        sourceUrl: row.sourceUrl ?? "",
        contentStatus: (row.contentStatus as I18nFormState["contentStatus"]) ?? "published",
        reviewStatus: (row.reviewStatus as I18nFormState["reviewStatus"]) ?? "unreviewed",
        reviewedBy: row.reviewedBy ?? "",
        contentOrigin: (row.contentOrigin as I18nFormState["contentOrigin"]) ?? "imported",
    };
}

export function useI18n(authedFetch: AuthedFetch) {
    const [rows, setRows] = useState<PlantI18nRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>("view");
    const [form, setForm] = useState<I18nFormState>(emptyI18nForm);
    const [search, setSearch] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await authedFetch("/api/master-plants-i18n?source=sqlite");
            const body = (await response.json().catch(() => ({}))) as { data?: BackendI18nRow[]; error?: string };
            if (!response.ok || !body.data) throw new Error(body.error ?? "Cannot load plant i18n");
            setRows(body.data.map(mapBackendI18n));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot load plant i18n");
        } finally {
            setLoading(false);
        }
    }, [authedFetch]);

    const selected = useMemo(
        () => rows.find((r) => r._id === selectedId) ?? null,
        [rows, selectedId],
    );

    const filtered = useMemo(() => {
        const normalized = normalizeSearch(search);
        let result = rows.slice();
        if (normalized) {
            result = result.filter((row) => {
                const haystack = [
                    row.plantScientificName ?? "",
                    row.plantGroup ?? "",
                    row.locale,
                    row.commonName,
                    row.description ?? "",
                ]
                    .join(" ");
                return normalizeSearch(haystack).includes(normalized);
            });
        }
        return result.sort((a, b) => a.commonName.localeCompare(b.commonName));
    }, [rows, search]);

    function select(row: PlantI18nRow) {
        setSelectedId(row._id);
        if (mode !== "create") setMode("view");
    }

    function startCreate(plants: Plant[]) {
        setMode("create");
        setForm({ ...emptyI18nForm, plantId: plants[0]?._id ?? "" });
        setSelectedId(null);
        setError("");
    }

    function startEdit(row: PlantI18nRow) {
        setMode("edit");
        setForm(toFormState(row));
        setSelectedId(row._id);
        setError("");
    }

    function cancel() {
        if (selected) {
            setForm(toFormState(selected));
        } else {
            setForm(emptyI18nForm);
        }
        setMode("view");
    }

    async function save(): Promise<string | null> {
        if (saving) return null;
        if (!form.plantId) {
            setError("Plant is required.");
            return null;
        }
        if (!form.locale.trim()) {
            setError("Locale is required.");
            return null;
        }
        if (!form.commonName.trim()) {
            setError("Common name is required.");
            return null;
        }

        const contentVersion = form.contentVersion.trim()
            ? Number(form.contentVersion)
            : undefined;
        if (form.contentVersion.trim() && !Number.isFinite(contentVersion)) {
            setError("Content version must be a number.");
            return null;
        }

        setSaving(true);
        setError("");
        try {
            const payload = {
                master_plant_id: Number(form.plantId),
                locale: form.locale.trim(),
                common_name: form.commonName.trim(),
                description: form.description.trim() || undefined,
                care_content_json: parseCareContent(form.careContent),
                content_version: contentVersion,
                source: form.source.trim() || undefined,
                source_url: form.sourceUrl.trim() || undefined,
                content_status: form.contentStatus,
                review_status: form.reviewStatus,
                reviewed_by: form.reviewedBy.trim() || undefined,
                content_origin: form.contentOrigin,
            };
            if (!Number.isInteger(payload.master_plant_id) || payload.master_plant_id <= 0) {
                throw new Error("Plant must have a numeric SQLite id.");
            }

            if (mode === "create") {
                const response = await authedFetch("/api/master-plants-i18n", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                const body = (await response.json().catch(() => ({}))) as { data?: BackendI18nRow; error?: string };
                if (!response.ok || !body.data) throw new Error(body.error ?? "Cannot save i18n");
                setSelectedId(String(body.data.id));
                setMode("view");
                void load();
                return "Translation created locally";
            } else if (mode === "edit" && selected) {
                if (!/^\d+$/.test(selected._id)) throw new Error("Translation does not have a numeric SQLite id.");
                const response = await authedFetch(`/api/master-plants-i18n/${selected._id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                const body = (await response.json().catch(() => ({}))) as { data?: BackendI18nRow; error?: string };
                if (!response.ok || !body.data) throw new Error(body.error ?? "Cannot save i18n");
                setMode("view");
                void load();
                return "Translation updated locally";
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot save i18n");
        } finally {
            setSaving(false);
        }
        return null;
    }

    async function remove(): Promise<string | null> {
        if (!selected || saving) return null;
        if (!confirm("Delete this translation? This cannot be undone.")) return null;

        setSaving(true);
        setError("");
        try {
            if (!/^\d+$/.test(selected._id)) throw new Error("Translation does not have a numeric SQLite id.");
            const response = await authedFetch(`/api/master-plants-i18n/${selected._id}`, {
                method: "DELETE",
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as { error?: string };
                throw new Error(body.error ?? "Cannot delete i18n");
            }
            setSelectedId(null);
            void load();
            return "Translation deleted locally";
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot delete i18n");
        } finally {
            setSaving(false);
        }
        return null;
    }

    async function createTranslation(input: {
        plantId: string;
        locale: string;
        commonName: string;
        description?: string;
        careContent?: string;
        contentVersion?: number;
        source?: string;
        sourceUrl?: string;
        contentStatus?: I18nFormState["contentStatus"];
        reviewStatus?: I18nFormState["reviewStatus"];
        reviewedBy?: string;
    }) {
        const response = await authedFetch("/api/master-plants-i18n", {
            method: "POST",
            body: JSON.stringify({
                master_plant_id: Number(input.plantId),
                locale: input.locale,
                common_name: input.commonName,
                description: input.description,
                care_content_json: parseCareContent(input.careContent ?? ""),
                content_version: input.contentVersion,
                source: input.source,
                source_url: input.sourceUrl,
                content_status: input.contentStatus,
                review_status: input.reviewStatus,
                reviewed_by: input.reviewedBy,
                content_origin: "authored",
            }),
        });
        const body = await response.json().catch(() => ({})) as { data?: BackendI18nRow; error?: string };
        if (!response.ok || !body.data) throw new Error(body.error ?? "Cannot create i18n");
        return { rowId: String(body.data.id) };
    }

    return {
        rows,
        loading,
        saving,
        error,
        setError,
        selected,
        selectedId,
        mode,
        form,
        setForm,
        search,
        setSearch,
        filtered,
        load,
        select,
        startCreate,
        startEdit,
        cancel,
        save,
        remove,
        createTranslation,
    };
}
