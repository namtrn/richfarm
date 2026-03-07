import { useState, useMemo, useCallback } from "react";
import type { Plant, PlantFormState, Mode, I18nRow } from "../types";
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

    /**
     * Sort: group variants under their base.
     * Within same (genus, species): base (__default__) first, then variants alphabetically.
     */
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
                    p.genus ?? "",
                    p.species ?? "",
                    p.cultivar ?? "",
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

        return result.sort((a, b) => {
            const aGenus = (a.genusNormalized ?? a.scientificName).toLowerCase();
            const bGenus = (b.genusNormalized ?? b.scientificName).toLowerCase();
            const aSp = a.speciesNormalized ?? "";
            const bSp = b.speciesNormalized ?? "";
            const aCult = a.cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED;
            const bCult = b.cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED;

            // Primary: genus alpha
            const genusCmp = aGenus.localeCompare(bGenus);
            if (genusCmp !== 0) return genusCmp;
            // Secondary: species alpha
            const spCmp = aSp.localeCompare(bSp);
            if (spCmp !== 0) return spCmp;
            // Tertiary: base (__default__) comes before any cultivar
            if (aCult === DEFAULT_CULTIVAR_NORMALIZED && bCult !== DEFAULT_CULTIVAR_NORMALIZED) return -1;
            if (bCult === DEFAULT_CULTIVAR_NORMALIZED && aCult !== DEFAULT_CULTIVAR_NORMALIZED) return 1;
            return aCult.localeCompare(bCult);
        });
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
            genus,
            species,
            cultivar: plant.cultivar ?? "",
            group: plant.group ?? "other",
            description: plant.description ?? "",
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
            family: "",
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
            group: form.group.trim() || "other",
            description: form.description.trim() || undefined,
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
