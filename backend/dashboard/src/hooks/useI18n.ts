import { useState, useMemo, useCallback } from "react";
import type { PlantI18nRow, I18nFormState, Mode, Plant } from "../types";
import { convex, convexReady, emptyI18nForm } from "../constants";

function toFormState(row: PlantI18nRow): I18nFormState {
    return {
        plantId: row.plantId,
        locale: row.locale,
        commonName: row.commonName ?? "",
        description: row.description ?? "",
        careContent: row.careContent ?? "",
        contentVersion: row.contentVersion ? String(row.contentVersion) : "",
    };
}

export function useI18n() {
    const [rows, setRows] = useState<PlantI18nRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>("view");
    const [form, setForm] = useState<I18nFormState>(emptyI18nForm);
    const [search, setSearch] = useState("");

    const load = useCallback(async () => {
        if (!convexReady) return;
        setLoading(true);
        setError("");
        try {
            const data = (await convex.query(
                "plantAdmin:listPlantI18n" as any,
                {},
            )) as PlantI18nRow[];
            setRows(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot load plant i18n");
        } finally {
            setLoading(false);
        }
    }, []);

    const selected = useMemo(
        () => rows.find((r) => r._id === selectedId) ?? null,
        [rows, selectedId],
    );

    const filtered = useMemo(() => {
        const normalized = search.trim().toLowerCase();
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
                    .join(" ")
                    .toLowerCase();
                return haystack.includes(normalized);
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
                plantId: form.plantId as any,
                locale: form.locale.trim(),
                commonName: form.commonName.trim(),
                description: form.description.trim() || undefined,
                careContent: form.careContent.trim() || undefined,
                contentVersion,
            };

            if (mode === "create") {
                const result = (await convex.mutation(
                    "plantAdmin:createPlantI18n" as any,
                    payload,
                )) as { rowId: string };
                await load();
                setSelectedId(result.rowId);
                setMode("view");
                return "Translation created successfully";
            } else if (mode === "edit" && selected) {
                await convex.mutation("plantAdmin:updatePlantI18n" as any, {
                    rowId: selected._id,
                    ...payload,
                });
                await load();
                setMode("view");
                return "Translation updated successfully";
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
            await convex.mutation("plantAdmin:deletePlantI18n" as any, {
                rowId: selected._id,
            });
            setSelectedId(null);
            await load();
            return "Translation deleted";
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot delete i18n");
        } finally {
            setSaving(false);
        }
        return null;
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
    };
}
