import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Plant, PlantFormState, Mode, PlantListPage } from "../types";
import {
    convexAdminMutation,
    convexAdminQuery,
    emptyPlantForm,
    getLocaleRow,
    parsePurposes,
    computeScientificName,
    parseOptionalNumber,
    DEFAULT_CULTIVAR_NORMALIZED,
    type AuthedFetch,
} from "../constants";

type BackendPlantRow = {
    id: string | number;
    plant_code?: string;
    common_name?: string;
    scientific_name?: string | null;
    category?: string;
    group?: string;
    family?: string | null;
    purposes?: string[];
    typical_days_to_harvest?: number | null;
    germination_days?: number | null;
    spacing_cm?: number | null;
    water_liters_per_m2?: number | null;
    yield_kg_per_m2?: number | null;
    image_url?: string | null;
    is_active?: boolean;
    notes?: string | null;
    metadata_json?: Record<string, unknown>;
    i18n?: Partial<Record<"vi" | "en", { common_name?: string; description?: string }>>;
};

type BackendPlantListResponse = {
    data: BackendPlantRow[];
    pagination: {
        page: number;
        page_size: number;
        total: number;
    };
    groupOptions?: string[];
};

function parseTaxonomy(scientificName: string) {
    const [genus = "", species = ""] = scientificName.trim().split(/\s+/);
    return { genus, species };
}

function mapBackendPlant(row: BackendPlantRow): Plant {
    const scientificName = row.scientific_name || row.plant_code || row.common_name || "";
    const taxonomy = parseTaxonomy(scientificName);
    const i18nRows = (["vi", "en"] as const).map((locale) => {
        const localeRow = row.i18n?.[locale];
        return {
            locale,
            commonName: localeRow?.common_name || (locale === "vi" ? row.common_name : scientificName) || "",
            description: localeRow?.description,
        };
    });

    return {
        _id: String(row.id),
        genus: taxonomy.genus,
        species: taxonomy.species,
        scientificName,
        group: row.group || row.category || "other",
        family: row.family ?? undefined,
        description: row.notes ?? undefined,
        imageUrl: row.image_url ?? null,
        purposes: row.purposes ?? [],
        typicalDaysToHarvest: row.typical_days_to_harvest ?? undefined,
        germinationDays: row.germination_days ?? undefined,
        spacingCm: row.spacing_cm ?? undefined,
        waterLitersPerM2: row.water_liters_per_m2 ?? undefined,
        yieldKgPerM2: row.yield_kg_per_m2 ?? undefined,
        source: "backend",
        cultivar: typeof row.metadata_json?.cultivar === "string" ? row.metadata_json.cultivar : undefined,
        i18nRows,
    };
}

async function loadBackendPlantPage(
    authedFetch: AuthedFetch,
    page: number,
    pageSize: number,
    search: string,
): Promise<PlantListPage> {
    const params = new URLSearchParams({
        page: String(page),
        page_size: String(Math.min(pageSize, 100)),
        source: "sqlite",
    });
    if (search.trim()) {
        params.set("search", search.trim());
    }

    const response = await authedFetch(`/api/master-plants?${params.toString()}`);
    const body = (await response.json().catch(() => ({}))) as Partial<BackendPlantListResponse> & { error?: string };
    if (!response.ok || !body.data || !body.pagination) {
        throw new Error(body.error ?? "Cannot load backend plants");
    }

    const items = body.data.map(mapBackendPlant);
    return {
        items,
        page: body.pagination.page,
        pageSize: body.pagination.page_size,
        totalItems: body.pagination.total,
        totalPages: Math.max(1, Math.ceil(body.pagination.total / body.pagination.page_size)),
        groupOptions: body.groupOptions ?? Array.from(new Set(items.map((plant) => plant.group).filter(Boolean))).sort(),
        stats: {
            total: body.pagination.total,
            missingI18n: items.filter((plant) => !getLocaleRow(plant.i18nRows, "vi")?.commonName || !getLocaleRow(plant.i18nRows, "en")?.commonName).length,
            missingImages: items.filter((plant) => !plant.imageUrl).length,
        },
    };
}

function slugifyPlantCode(value: string) {
    return value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/×/g, "x")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_")
        .toUpperCase();
}

export function usePlants(authedFetch: AuthedFetch, enabled = true) {
    const pageSize = 30;
    const adminProxyUnavailable = useRef(false);
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
        if (!enabled) {
            setPlants([]);
            setTotalItems(0);
            setTotalPages(1);
            setGroupOptions([]);
            setStats({ total: 0, missingI18n: 0, missingImages: 0 });
            setSelectedId(null);
            return;
        }
        setLoading(true);
        setError("");
        try {
            let data: PlantListPage;
            try {
                if (adminProxyUnavailable.current) {
                    data = await loadBackendPlantPage(authedFetch, page, pageSize, search);
                    setError("");
                } else {
                data = await convexAdminQuery<PlantListPage>(authedFetch, "plantAdmin:listPlants", {
                    page,
                    pageSize,
                    viewMode,
                    search: search.trim() || undefined,
                    groupFilter,
                    filterMissingI18n,
                    filterNoImage,
                });
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : "";
                if (!message.includes("Convex admin proxy is not configured")) {
                    throw err;
                }
                adminProxyUnavailable.current = true;
                data = await loadBackendPlantPage(authedFetch, page, pageSize, search);
            }
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
    }, [authedFetch, enabled, filterMissingI18n, filterNoImage, groupFilter, mode, page, search, selectedId, viewMode]);

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

        const parsedPayload = {
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
        const backendPayload = {
            plant_code: [
                slugifyPlantCode(scientificName),
                cultivar ? slugifyPlantCode(cultivar) : "",
            ].filter(Boolean).join("_").slice(0, 120),
            common_name: form.viCommonName.trim(),
            scientific_name: scientificName,
            category: form.group.trim() || "other",
            group: form.group.trim() || "other",
            family: form.family.trim() || null,
            purposes: parsePurposes(form.purposes),
            growth_stage: "seedling",
            typical_days_to_harvest: parseOptionalNumber(form.typicalDaysToHarvest) ?? null,
            germination_days: parseOptionalNumber(form.germinationDays) ?? null,
            spacing_cm: parseOptionalNumber(form.spacingCm) ?? null,
            water_liters_per_m2: parseOptionalNumber(form.waterLitersPerM2) ?? null,
            yield_kg_per_m2: parseOptionalNumber(form.yieldKgPerM2) ?? null,
            image_url: form.imageUrl.trim() || null,
            is_active: form.isActive,
            notes: form.viDescription.trim() || form.enDescription.trim() || null,
            metadata_json: {
                ...(cultivar ? { cultivar } : {}),
                lightRequirements: form.lightRequirements.trim() || undefined,
                maxPlantsPerM2: parseOptionalNumber(form.maxPlantsPerM2),
                seedRatePerM2: parseOptionalNumber(form.seedRatePerM2),
            },
            i18n: {
                vi: {
                    common_name: form.viCommonName.trim(),
                    description: form.viDescription.trim() || undefined,
                },
                en: {
                    common_name: form.enCommonName.trim(),
                    description: form.enDescription.trim() || undefined,
                },
            },
        };

        setSaving(true);
        setError("");
        try {
            if (adminProxyUnavailable.current) {
                if (mode === "edit" && selected && !/^\d+$/.test(selected._id)) {
                    throw new Error("Sync Convex to backend DB before editing this plant.");
                }
                const endpoint = mode === "edit" && selected
                    ? `/api/master-plants/${selected._id}`
                    : "/api/master-plants";
                const response = await authedFetch(endpoint, {
                    method: mode === "edit" && selected ? "PATCH" : "POST",
                    body: JSON.stringify(backendPayload),
                });
                const body = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(body.error ?? "Cannot save plant");
                }
                await load();
                setSelectedId(body.data?.id ? String(body.data.id) : null);
                setMode("view");
                return mode === "create" ? "Plant created successfully" : "Plant updated successfully";
            }

            if (mode === "create") {
                const result = await convexAdminMutation<{ plantId: string }>(
                    authedFetch,
                    "plantAdmin:createPlant",
                    parsedPayload,
                );
                await load();
                setSelectedId(result.plantId);
                setMode("view");
                return "Plant created successfully";
            } else if (mode === "edit" && selected) {
                await convexAdminMutation<void>(authedFetch, "plantAdmin:updatePlant", {
                    plantId: selected._id,
                    ...parsedPayload,
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
            if (adminProxyUnavailable.current) {
                if (!/^\d+$/.test(selected._id)) {
                    throw new Error("Sync Convex to backend DB before deleting this plant.");
                }
                const response = await authedFetch(`/api/master-plants/${selected._id}`, {
                    method: "DELETE",
                });
                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    throw new Error(body.error ?? "Cannot delete plant");
                }
            } else {
                await convexAdminMutation<void>(authedFetch, "plantAdmin:deletePlant", { plantId: selected._id });
            }
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
