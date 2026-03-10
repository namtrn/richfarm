import { useState, useMemo, useCallback, useEffect } from "react";
import type { Plant, PlantFormState, Mode, PlantListPage } from "../types";
import {
    convex,
    convexReady,
    emptyPlantForm,
    getLocaleRow,
    parsePurposes,
    computeScientificName,
    parseOptionalNumber,
    DEFAULT_CULTIVAR_NORMALIZED,
} from "../constants";

export function usePlants() {
    const pageSize = 30;
    const [viewMode, setViewMode] = useState<"common" | "family">("common");
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
    const [page, setPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [groupOptions, setGroupOptions] = useState<string[]>([]);
    const [stats, setStats] = useState({ total: 0, missingI18n: 0, missingImages: 0 });

    const load = useCallback(async () => {
        if (!convexReady) {
            setError("Missing Convex URL. Set EXPO_PUBLIC_CONVEX_URL or VITE_CONVEX_URL.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const data = (await convex.query("plantAdmin:listPlants" as any, {
                page,
                pageSize,
                viewMode,
                search: search.trim() || undefined,
                groupFilter,
                filterMissingI18n,
                filterNoImage,
            })) as PlantListPage;
            setPlants(data.items);
            setTotalItems(data.totalItems);
            setTotalPages(data.totalPages);
            setGroupOptions(data.groupOptions);
            setStats(data.stats);
            if (selectedId && !data.items.some((item) => item._id === selectedId)) {
                setSelectedId(data.items[0]?._id ?? null);
            } else if (!selectedId && data.items.length > 0 && mode !== "create") {
                setSelectedId(data.items[0]._id);
            }
            if (data.page !== page) {
                setPage(data.page);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot load plants");
        } finally {
            setLoading(false);
        }
    }, [filterMissingI18n, filterNoImage, groupFilter, mode, page, search, selectedId, viewMode]);

    const selected = useMemo(
        () => plants.find((p) => p._id === selectedId) ?? null,
        [plants, selectedId],
    );

    useEffect(() => {
        void load();
    }, [load]);

    function toFormState(plant: Plant): PlantFormState {
        const vi = getLocaleRow(plant.i18nRows, "vi");
        const en = getLocaleRow(plant.i18nRows, "en");

        // Taxonomy: use stored fields, fallback to parsing scientificName for legacy rows
        let genus = plant.genus ?? "";
        let species = plant.species ?? "";
        if (!genus && plant.scientificName) {
            // "Solanum lycopersicum" → genus="Solanum" species="lycopersicum"
            const parts = plant.scientificName.trim().split(/\s+/);
            genus = parts[0] ?? "";
            species = parts[1] ?? "";
        }

        return {
            family: plant.family ?? "",
            genus,
            species,
            cultivar: plant.cultivar ?? "",
            group: plant.group ?? "other",
            basePlantId: plant.basePlantId ?? "",
            commonNameGroupKey: plant.commonNameGroupKey ?? "",
            commonNameGroupVi: plant.commonNameGroupVi ?? "",
            commonNameGroupEn: plant.commonNameGroupEn ?? "",
            commonGenusNameVi: plant.commonGenusNameVi ?? "",
            commonGenusNameEn: plant.commonGenusNameEn ?? "",
            commonSpeciesNameVi: plant.commonSpeciesNameVi ?? "",
            commonSpeciesNameEn: plant.commonSpeciesNameEn ?? "",
            imageUrl: plant.imageUrl ?? "",
            purposes: (plant.purposes ?? []).join(", "),
            viCommonName: vi?.commonName ?? "",
            viDescription: vi?.description ?? "",
            enCommonName: en?.commonName ?? "",
            enDescription: en?.description ?? "",
            typicalDaysToHarvest: plant.typicalDaysToHarvest !== undefined ? String(plant.typicalDaysToHarvest) : "",
            wateringFrequencyDays: plant.wateringFrequencyDays !== undefined ? String(plant.wateringFrequencyDays) : "",
            germinationDays: plant.germinationDays !== undefined ? String(plant.germinationDays) : "",
            spacingCm: plant.spacingCm !== undefined ? String(plant.spacingCm) : "",
            lightRequirements: plant.lightRequirements ?? "",
            maxPlantsPerM2: plant.maxPlantsPerM2 !== undefined ? String(plant.maxPlantsPerM2) : "",
            seedRatePerM2: plant.seedRatePerM2 !== undefined ? String(plant.seedRatePerM2) : "",
            waterLitersPerM2: plant.waterLitersPerM2 !== undefined ? String(plant.waterLitersPerM2) : "",
            yieldKgPerM2: plant.yieldKgPerM2 !== undefined ? String(plant.yieldKgPerM2) : "",
            // Advanced fields (may not be on Convex schema — default to empty)
            soilPhMin: "",
            soilPhMax: "",
            moistureTarget: "",
            lightHours: "",
            notes: "",
            isActive: true,
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

        const genus = form.genus.trim();
        const species = form.species.trim();
        const cultivar = form.cultivar.trim() || undefined;
        const scientificName = computeScientificName(genus, species);

        if (!genus || !species) {
            setError("Genus and Species are required.");
            return null;
        }
        if (!form.viCommonName.trim() || !form.enCommonName.trim()) {
            setError("Both VI and EN common names are required.");
            return null;
        }

        const payload = {
            scientificName,
            cultivar,
            family: form.family.trim() || undefined,
            group: form.group.trim() || "other",
            basePlantId: form.basePlantId.trim() || undefined,
            commonNameGroupKey: form.commonNameGroupKey.trim() || undefined,
            commonNameGroupVi: form.commonNameGroupVi.trim() || undefined,
            commonNameGroupEn: form.commonNameGroupEn.trim() || undefined,
            commonGenusNameVi: form.commonGenusNameVi.trim() || undefined,
            commonGenusNameEn: form.commonGenusNameEn.trim() || undefined,
            commonSpeciesNameVi: form.commonSpeciesNameVi.trim() || undefined,
            commonSpeciesNameEn: form.commonSpeciesNameEn.trim() || undefined,
            imageUrl: form.imageUrl.trim() ? form.imageUrl.trim() : null,
            purposes: parsePurposes(form.purposes),
            viCommonName: form.viCommonName.trim(),
            viDescription: form.viDescription.trim() || undefined,
            enCommonName: form.enCommonName.trim(),
            enDescription: form.enDescription.trim() || undefined,
            // Growing params: parse string → number | undefined
            typicalDaysToHarvest: parseOptionalNumber(form.typicalDaysToHarvest),
            wateringFrequencyDays: parseOptionalNumber(form.wateringFrequencyDays),
            germinationDays: parseOptionalNumber(form.germinationDays),
            spacingCm: parseOptionalNumber(form.spacingCm),
            lightRequirements: form.lightRequirements.trim() || undefined,
            maxPlantsPerM2: parseOptionalNumber(form.maxPlantsPerM2),
            seedRatePerM2: parseOptionalNumber(form.seedRatePerM2),
            waterLitersPerM2: parseOptionalNumber(form.waterLitersPerM2),
            yieldKgPerM2: parseOptionalNumber(form.yieldKgPerM2),
        };

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
        const displayName = selected.cultivar
            ? `${selected.scientificName} '${selected.cultivar}'`
            : selected.scientificName;
        if (!confirm(`Delete "${displayName}"? This cannot be undone.`)) return null;

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

    function goToPage(nextPage: number) {
        setPage(Math.max(1, Math.min(nextPage, totalPages)));
    }

    function resetAndSetSearch(value: string) {
        setSearch(value);
        setPage(1);
    }

    function resetAndSetGroupFilter(value: string) {
        setGroupFilter(value);
        setPage(1);
    }

    function resetAndSetFilterMissingI18n(value: boolean) {
        setFilterMissingI18n(value);
        setPage(1);
    }

    function resetAndSetFilterNoImage(value: boolean) {
        setFilterNoImage(value);
        setPage(1);
    }

    function resetAndSetViewMode(value: "common" | "family") {
        setViewMode(value);
        setPage(1);
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
        setSearch: resetAndSetSearch,
        groupFilter,
        setGroupFilter: resetAndSetGroupFilter,
        filterMissingI18n,
        setFilterMissingI18n: resetAndSetFilterMissingI18n,
        filterNoImage,
        setFilterNoImage: resetAndSetFilterNoImage,
        groupOptions,
        stats,
        page,
        pageSize,
        totalItems,
        totalPages,
        viewMode,
        setViewMode: resetAndSetViewMode,
        goToPage,
        load,
        select,
        startCreate,
        startEdit,
        cancel,
        save,
        remove,
    };
}
