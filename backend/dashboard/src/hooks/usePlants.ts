import { useState, useMemo, useCallback } from "react";
import type { Plant, PlantFormState, Mode, I18nRow } from "../types";
import {
    convex,
    convexReady,
    emptyPlantForm,
    getLocaleRow,
    parsePurposes,
} from "../constants";

export function usePlants() {
    const [plants, setPlants] = useState<Plant[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>("view");
    const [form, setForm] = useState<PlantFormState>(emptyPlantForm);
    const [search, setSearch] = useState("");
    const [groupFilter, setGroupFilter] = useState("all");
    const [filterMissingI18n, setFilterMissingI18n] = useState(false);
    const [filterNoImage, setFilterNoImage] = useState(false);

    const load = useCallback(async () => {
        if (!convexReady) {
            setError("Missing Convex URL. Set EXPO_PUBLIC_CONVEX_URL or VITE_CONVEX_URL.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const data = (await convex.query("plantAdmin:listPlants" as any, {})) as Plant[];
            setPlants(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot load plants");
        } finally {
            setLoading(false);
        }
    }, []);

    const selected = useMemo(
        () => plants.find((p) => p._id === selectedId) ?? null,
        [plants, selectedId],
    );

    const groupOptions = useMemo(() => {
        const unique = new Set<string>();
        for (const plant of plants) {
            if (plant.group) unique.add(plant.group);
        }
        return Array.from(unique).sort((a, b) => a.localeCompare(b));
    }, [plants]);

    const filtered = useMemo(() => {
        const normalized = search.trim().toLowerCase();
        let result = plants.slice();

        if (groupFilter !== "all") {
            result = result.filter((p) => p.group === groupFilter);
        }
        if (filterMissingI18n) {
            result = result.filter((p) => {
                const vi = getLocaleRow(p.i18nRows, "vi");
                const en = getLocaleRow(p.i18nRows, "en");
                return !vi || !en;
            });
        }
        if (filterNoImage) {
            result = result.filter((p) => !p.imageUrl);
        }
        if (normalized) {
            result = result.filter((p) => {
                const vi = getLocaleRow(p.i18nRows, "vi")?.commonName ?? "";
                const en = getLocaleRow(p.i18nRows, "en")?.commonName ?? "";
                const haystack = [
                    p.scientificName,
                    p.group,
                    p.description ?? "",
                    vi,
                    en,
                    ...(p.purposes ?? []),
                ]
                    .join(" ")
                    .toLowerCase();
                return haystack.includes(normalized);
            });
        }

        return result.sort((a, b) => a.scientificName.localeCompare(b.scientificName));
    }, [plants, search, groupFilter, filterMissingI18n, filterNoImage]);

    const stats = useMemo(() => {
        const missingI18n = plants.filter((p) => {
            const vi = getLocaleRow(p.i18nRows, "vi");
            const en = getLocaleRow(p.i18nRows, "en");
            return !vi || !en;
        }).length;
        const missingImages = plants.filter((p) => !p.imageUrl).length;
        return { total: plants.length, missingI18n, missingImages };
    }, [plants]);

    function toFormState(plant: Plant): PlantFormState {
        const vi = getLocaleRow(plant.i18nRows, "vi");
        const en = getLocaleRow(plant.i18nRows, "en");
        return {
            scientificName: plant.scientificName ?? "",
            group: plant.group ?? "other",
            description: plant.description ?? "",
            imageUrl: plant.imageUrl ?? "",
            purposes: (plant.purposes ?? []).join(", "),
            viCommonName: vi?.commonName ?? "",
            viDescription: vi?.description ?? "",
            enCommonName: en?.commonName ?? "",
            enDescription: en?.description ?? "",
        };
    }

    function select(plant: Plant) {
        setSelectedId(plant._id);
        if (mode !== "create") setMode("view");
    }

    function startCreate() {
        setMode("create");
        setForm(emptyPlantForm);
        setSelectedId(null);
        setError("");
    }

    function startEdit(plant: Plant) {
        setMode("edit");
        setForm(toFormState(plant));
        setSelectedId(plant._id);
        setError("");
    }

    function cancel() {
        if (selected) {
            setForm(toFormState(selected));
        } else {
            setForm(emptyPlantForm);
        }
        setMode("view");
    }

    async function save(): Promise<string | null> {
        if (saving) return null;

        const payload = {
            scientificName: form.scientificName.trim(),
            group: form.group.trim() || "other",
            description: form.description.trim() || undefined,
            imageUrl: form.imageUrl.trim() ? form.imageUrl.trim() : null,
            purposes: parsePurposes(form.purposes),
            viCommonName: form.viCommonName.trim(),
            viDescription: form.viDescription.trim() || undefined,
            enCommonName: form.enCommonName.trim(),
            enDescription: form.enDescription.trim() || undefined,
        };

        if (!payload.scientificName) {
            setError("Scientific name is required.");
            return null;
        }
        if (!payload.viCommonName || !payload.enCommonName) {
            setError("Both VI and EN common names are required.");
            return null;
        }

        setSaving(true);
        setError("");
        try {
            if (mode === "create") {
                const result = (await convex.mutation("plantAdmin:createPlant" as any, payload)) as {
                    plantId: string;
                };
                await load();
                setSelectedId(result.plantId);
                setMode("view");
                return "Plant created successfully";
            } else if (mode === "edit" && selected) {
                await convex.mutation("plantAdmin:updatePlant" as any, {
                    plantId: selected._id,
                    ...payload,
                });
                await load();
                setMode("view");
                return "Plant updated successfully";
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot save plant");
        } finally {
            setSaving(false);
        }
        return null;
    }

    async function remove(): Promise<string | null> {
        if (!selected || saving) return null;
        if (!confirm(`Delete "${selected.scientificName}"? This cannot be undone.`)) return null;

        setSaving(true);
        setError("");
        try {
            await convex.mutation("plantAdmin:deletePlant" as any, { plantId: selected._id });
            setSelectedId(null);
            await load();
            return "Plant deleted";
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot delete plant");
        } finally {
            setSaving(false);
        }
        return null;
    }

    return {
        plants,
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
        groupFilter,
        setGroupFilter,
        filterMissingI18n,
        setFilterMissingI18n,
        filterNoImage,
        setFilterNoImage,
        groupOptions,
        filtered,
        stats,
        load,
        select,
        startCreate,
        startEdit,
        cancel,
        save,
        remove,
    };
}
