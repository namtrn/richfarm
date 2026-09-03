import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Plant, PlantFormState, Mode, PlantListPage } from "../types";
import type { CareSourceRef } from "../../../../packages/shared/src";
import { normalizePropagationMethods } from "../../../../packages/shared/src/plantPropagation";
import { validateCanonicalPlantIdentity } from "../../../../packages/shared/src/canonicalPlantIdentity";
import {
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
    canonical_identity_version?: string | null;
    canonical_key?: string | null;
    genus?: string | null;
    species?: string | null;
    infraspecific_rank?: string | null;
    infraspecific_name?: string | null;
    cultivar?: string | null;
    identity_scope?: "base" | "cultivar" | null;
    parent_master_plant_id?: number | null;
    parent_canonical_key?: string | null;
    canonical_status?: string | null;
    source_system?: string;
    source_id?: string | null;
    record_version?: number;
    category?: string;
    group?: string;
    family?: string | null;
    purposes?: string[];
    typical_days_to_harvest?: number | null;
    germination_days?: number | null;
    watering_frequency_days?: number | null;
    fertilizing_frequency_days?: number | null;
    soil_ph_min?: number | null;
    soil_ph_max?: number | null;
    moisture_target?: number | null;
    light_hours?: number | null;
    light_requirements?: string | null;
    max_plants_per_m2?: number | null;
    seed_rate_per_m2?: number | null;
    spacing_cm?: number | null;
    water_liters_per_m2?: number | null;
    yield_kg_per_m2?: number | null;
    growth_stage?: string | null;
    image_url?: string | null;
    is_active?: boolean;
    notes?: string | null;
    source_url?: string | null;
    content_status?: Plant["contentStatus"];
    content_version?: number;
    review_status?: Plant["reviewStatus"];
    reviewed_at?: string | null;
    reviewed_by?: string | null;
    sync_origin?: string;
    care_status?: string;
    care_field_evidence?: Record<string, unknown>;
    propagation_methods?: string[];
    propagationMethods?: string[];
    origin_countries?: string[];
    origin_country_source_refs?: Record<string, CareSourceRef[]>;
    proven_regions?: Array<{ country_code: string; subdivision_code?: string }>;
    adaptation_term_codes?: string[];
    adaptation_term_source_refs?: Record<string, CareSourceRef[]>;
    resolved_geography?: {
        origin_country_codes: string[];
        origin_country_source: "own" | "inherited" | "none";
        proven_regions: Array<{ country_code: string; subdivision_code?: string }>;
        proven_region_source: "own" | "inherited" | "none";
        adaptation_term_codes: string[];
        adaptation_term_source: "own" | "inherited" | "none";
        inherited_from_id: number | null;
    };
    metadata_json?: Record<string, unknown>;
    i18n?: Record<string, {
        common_name?: string;
        description?: string;
        care_content?: string;
        content_version?: number;
        source?: string;
        source_url?: string;
        content_status?: string;
        review_status?: string;
        reviewed_at?: string;
        reviewed_by?: string;
        content_origin?: string;
        source_refs?: Array<{
            sourceSystem?: string;
            sourceName?: string;
            sourceUrl?: string;
            sourceLocator?: string;
        }>;
        sourceRefs?: Array<{
            sourceSystem?: string;
            sourceName?: string;
            sourceUrl?: string;
            sourceLocator?: string;
        }>;
    }>;
};

type BackendPlantListResponse = {
    data: BackendPlantRow[];
    pagination: {
        page: number;
        page_size: number;
        total: number;
    };
    groupOptions?: string[];
    stats?: {
        total: number;
        missingVi: number;
        missingEn: number;
        missingI18n?: number;
        missingImage: number;
    };
};

function parseTaxonomy(scientificName: string) {
    const [genus = "", species = ""] = scientificName.trim().split(/\s+/);
    return { genus, species };
}

export function validateDashboardCanonicalIdentity(input: {
    genus: string;
    species: string;
    infraspecificRank: string;
    infraspecificName: string;
    cultivar: string;
    identityScope: "base" | "cultivar";
    parentMasterPlantId: string;
    parentCanonicalKey: string;
}) {
    const parentId = input.parentMasterPlantId.trim();
    const parsedParentId = parentId ? Number(parentId) : null;
    return validateCanonicalPlantIdentity({
        genus: input.genus.trim(),
        species: input.species.trim(),
        rank: input.infraspecificRank.trim() || null,
        infraspecificName: input.infraspecificName.trim() || null,
        cultivar: input.cultivar.trim() || null,
        scope: input.identityScope,
        parentMasterPlantId: parsedParentId,
        parentCanonicalKey: input.parentCanonicalKey.trim() || null,
    });
}

function mapBackendPlant(row: BackendPlantRow): Plant {
    const scientificName = row.scientific_name || row.plant_code || row.common_name || "";
    const taxonomy = parseTaxonomy(scientificName);
    const metadata = row.metadata_json ?? {};
    const i18nRows = Object.entries(row.i18n ?? {}).map(([locale, localeRow]) => {
        return {
            locale,
            commonName: localeRow?.common_name || (locale === "vi" ? row.common_name : scientificName) || "",
            description: localeRow?.description,
            careContent: localeRow?.care_content ?? undefined,
            contentVersion: localeRow?.content_version,
            source: localeRow?.source,
            sourceUrl: localeRow?.source_url,
            contentStatus: localeRow?.content_status as Plant["contentStatus"],
            reviewStatus: localeRow?.review_status as Plant["reviewStatus"],
            reviewedAt: localeRow?.reviewed_at,
            reviewedBy: localeRow?.reviewed_by,
            contentOrigin: localeRow?.content_origin as "authored" | "inherited" | "imported" | undefined,
            sourceRefs: localeRow?.source_refs ?? localeRow?.sourceRefs,
        };
    });

    return {
        _id: String(row.id),
        genus: row.genus ?? taxonomy.genus,
        species: row.species ?? taxonomy.species,
        infraspecificRank: row.infraspecific_rank ?? undefined,
        infraspecificName: row.infraspecific_name ?? undefined,
        scientificName,
        sourceSystem: row.source_system,
        sourceId: row.source_id ?? undefined,
        recordVersion: row.record_version,
        group: row.group || row.category || "other",
        family: row.family ?? undefined,
        basePlantId: typeof metadata.basePlantId === "string" ? metadata.basePlantId : undefined,
        commonNameGroupKey: typeof metadata.commonNameGroupKey === "string" ? metadata.commonNameGroupKey : undefined,
        commonNameGroupVi: typeof metadata.commonNameGroupVi === "string" ? metadata.commonNameGroupVi : undefined,
        commonNameGroupEn: typeof metadata.commonNameGroupEn === "string" ? metadata.commonNameGroupEn : undefined,
        commonGenusNameVi: typeof metadata.commonGenusNameVi === "string" ? metadata.commonGenusNameVi : undefined,
        commonGenusNameEn: typeof metadata.commonGenusNameEn === "string" ? metadata.commonGenusNameEn : undefined,
        commonSpeciesNameVi: typeof metadata.commonSpeciesNameVi === "string" ? metadata.commonSpeciesNameVi : undefined,
        commonSpeciesNameEn: typeof metadata.commonSpeciesNameEn === "string" ? metadata.commonSpeciesNameEn : undefined,
        description: row.notes ?? undefined,
        imageUrl: row.image_url ?? null,
        purposes: row.purposes ?? [],
        typicalDaysToHarvest: row.typical_days_to_harvest ?? undefined,
        germinationDays: row.germination_days ?? undefined,
        wateringFrequencyDays: row.watering_frequency_days ?? undefined,
        fertilizingFrequencyDays: row.fertilizing_frequency_days ?? undefined,
        soilPhMin: row.soil_ph_min ?? undefined,
        soilPhMax: row.soil_ph_max ?? undefined,
        moistureTarget: row.moisture_target ?? undefined,
        lightHours: row.light_hours ?? undefined,
        lightRequirements: row.light_requirements ?? undefined,
        spacingCm: row.spacing_cm ?? undefined,
        maxPlantsPerM2: row.max_plants_per_m2 ?? undefined,
        waterLitersPerM2: row.water_liters_per_m2 ?? undefined,
        yieldKgPerM2: row.yield_kg_per_m2 ?? undefined,
        growthStage: row.growth_stage ?? undefined,
        source: typeof metadata.source === "string" ? metadata.source : row.source_system ?? "backend",
        sourceUrl: row.source_url ?? undefined,
        isActive: row.is_active ?? true,
        contentStatus: row.content_status,
        contentVersion: row.content_version,
        reviewStatus: row.review_status,
        reviewedAt: row.reviewed_at ?? undefined,
        reviewedBy: row.reviewed_by ?? undefined,
        careStatus: row.care_status as Plant["careStatus"],
        careFieldEvidence: row.care_field_evidence,
        notes: row.notes ?? undefined,
        propagationMethods: normalizePropagationMethods(row.propagation_methods ?? row.propagationMethods),
        originCountries: row.origin_countries ?? [],
        originCountrySourceRefs: row.origin_country_source_refs ?? {},
        provenRegions: row.proven_regions ?? [],
        adaptationTermCodes: row.adaptation_term_codes ?? [],
        adaptationTermSourceRefs: row.adaptation_term_source_refs ?? {},
        resolvedGeography: row.resolved_geography,
        cultivar: row.cultivar ?? (typeof metadata.cultivar === "string" ? metadata.cultivar : undefined),
        identityScope: row.identity_scope ?? undefined,
        parentMasterPlantId: row.parent_master_plant_id ?? undefined,
        parentCanonicalKey: row.parent_canonical_key ?? undefined,
        canonicalKey: row.canonical_key ?? undefined,
        canonicalIdentityComplete: Boolean(row.canonical_identity_version && row.canonical_key),
        i18nRows,
    };
}

/** Fetch one SQLite row for exact-match hydration when it is off the current page. */
export async function fetchBackendPlantById(
    authedFetch: AuthedFetch,
    id: string | number,
): Promise<Plant> {
    const normalizedId = String(id).trim();
    if (!/^[1-9]\d*$/.test(normalizedId)) {
        throw new Error("Canonical match did not return a valid SQLite plant id.");
    }
    const response = await authedFetch(`/api/master-plants/${normalizedId}?source=sqlite`);
    const body = (await response.json().catch(() => ({}))) as { data?: BackendPlantRow; error?: string };
    if (!response.ok || !body.data) {
        throw new Error(body.error ?? "Cannot load the exact canonical match");
    }
    return mapBackendPlant(body.data);
}

/** Insert or replace one hydrated row without disturbing the current page order. */
export function mergeHydratedPlant(plants: Plant[], hydrated: Plant): Plant[] {
    const index = plants.findIndex((plant) => plant._id === hydrated._id);
    if (index < 0) return [hydrated, ...plants];
    return plants.map((plant, currentIndex) => currentIndex === index ? hydrated : plant);
}

async function loadBackendPlantPage(
    authedFetch: AuthedFetch,
    page: number,
    pageSize: number,
    search: string,
    groupFilter: string,
    filterMissingI18n: boolean,
    filterNoImage: boolean,
    viewMode: "common" | "family",
): Promise<PlantListPage> {
    const params = new URLSearchParams({
        page: String(page),
        page_size: String(Math.min(pageSize, 100)),
        source: "sqlite",
        view_mode: viewMode,
    });
    if (search.trim()) {
        params.set("search", search.trim());
    }
    if (groupFilter !== "all") {
        params.set("group", groupFilter);
    }
    if (filterMissingI18n) {
        params.set("missing_i18n", "true");
    }
    if (filterNoImage) {
        params.set("no_image", "true");
    }

    const response = await authedFetch(`/api/master-plants?${params.toString()}`);
    const body = (await response.json().catch(() => ({}))) as Partial<BackendPlantListResponse> & { error?: string };
    if (!response.ok || !body.data || !body.pagination) {
        throw new Error(body.error ?? "Cannot load backend plants");
    }

    const items = body.data.map(mapBackendPlant);
    const backendStats = body.stats;
    return {
        items,
        page: body.pagination.page,
        pageSize: body.pagination.page_size,
        totalItems: body.pagination.total,
        totalPages: Math.max(1, Math.ceil(body.pagination.total / body.pagination.page_size)),
        groupOptions: body.groupOptions ?? Array.from(new Set(items.map((plant) => plant.group).filter(Boolean))).sort(),
        stats: {
            total: backendStats?.total ?? body.pagination.total,
            // A row is missing i18n when either required locale is absent.
            missingI18n: backendStats
                ? (backendStats.missingI18n ?? Math.max(backendStats.missingVi, backendStats.missingEn))
                : items.filter((plant) => !getLocaleRow(plant.i18nRows, "vi")?.commonName || !getLocaleRow(plant.i18nRows, "en")?.commonName).length,
            missingImages: backendStats?.missingImage ?? items.filter((plant) => !plant.imageUrl).length,
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
    const requestSequence = useRef(0);
    const modeRef = useRef<Mode>("view");
    const [viewMode, setViewMode] = useState<"common" | "family">("common");
    const [plants, setPlants] = useState<Plant[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>("view");
    const [form, setForm] = useState<PlantFormState>(emptyPlantForm);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [groupFilter, setGroupFilter] = useState("all");
    const [filterMissingI18n, setFilterMissingI18n] = useState(false);
    const [filterNoImage, setFilterNoImage] = useState(false);
    const [page, setPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [groupOptions, setGroupOptions] = useState<string[]>([]);
    const [stats, setStats] = useState({ total: 0, missingI18n: 0, missingImages: 0 });

    useEffect(() => {
        modeRef.current = mode;
    }, [mode]);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
        return () => window.clearTimeout(timer);
    }, [search]);

    const load = useCallback(async () => {
        const requestId = ++requestSequence.current;
        if (!enabled) {
            setLoading(false);
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
            const data = await loadBackendPlantPage(
                authedFetch,
                page,
                pageSize,
                debouncedSearch,
                groupFilter,
                filterMissingI18n,
                filterNoImage,
                viewMode,
            );
            // Search/page/filter requests can resolve out of order. Only the
            // newest request may publish state into the dashboard.
            if (requestId !== requestSequence.current) return;
            setPlants(data.items);
            setTotalItems(data.totalItems);
            setTotalPages(data.totalPages);
            setGroupOptions(data.groupOptions);
            setStats(data.stats);
            setSelectedId((currentSelectedId) => {
                if (currentSelectedId && !data.items.some((item) => item._id === currentSelectedId)) {
                    return data.items[0]?._id ?? null;
                }
                if (!currentSelectedId && data.items.length > 0 && modeRef.current !== "create") {
                    return data.items[0]._id;
                }
                return currentSelectedId;
            });
            if (data.page !== page) {
                setPage(data.page);
            }
        } catch (err) {
            if (requestId === requestSequence.current) {
                setError(err instanceof Error ? err.message : "Cannot load plants");
            }
        } finally {
            if (requestId === requestSequence.current) setLoading(false);
        }
    }, [authedFetch, debouncedSearch, enabled, filterMissingI18n, filterNoImage, groupFilter, page, viewMode]);

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
            infraspecificRank: plant.infraspecificRank ?? "",
            infraspecificName: plant.infraspecificName ?? "",
            cultivar: plant.cultivar ?? "",
            identityScope: plant.identityScope ?? (plant.cultivar ? "cultivar" : "base"),
            parentMasterPlantId: plant.parentMasterPlantId !== undefined ? String(plant.parentMasterPlantId) : "",
            parentCanonicalKey: plant.parentCanonicalKey ?? "",
            canonicalIdentityComplete: plant.canonicalIdentityComplete === true,
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
            fertilizingFrequencyDays: plant.fertilizingFrequencyDays !== undefined ? String(plant.fertilizingFrequencyDays) : "",
            germinationDays: plant.germinationDays !== undefined ? String(plant.germinationDays) : "",
            spacingCm: plant.spacingCm !== undefined ? String(plant.spacingCm) : "",
            lightRequirements: plant.lightRequirements ?? "",
            maxPlantsPerM2: plant.maxPlantsPerM2 !== undefined ? String(plant.maxPlantsPerM2) : "",
            seedRatePerM2: plant.seedRatePerM2 !== undefined ? String(plant.seedRatePerM2) : "",
            waterLitersPerM2: plant.waterLitersPerM2 !== undefined ? String(plant.waterLitersPerM2) : "",
            yieldKgPerM2: plant.yieldKgPerM2 !== undefined ? String(plant.yieldKgPerM2) : "",
            soilPhMin: plant.soilPhMin !== undefined ? String(plant.soilPhMin) : "",
            soilPhMax: plant.soilPhMax !== undefined ? String(plant.soilPhMax) : "",
            moistureTarget: plant.moistureTarget !== undefined ? String(plant.moistureTarget) : "",
            lightHours: plant.lightHours !== undefined ? String(plant.lightHours) : "",
            notes: plant.notes ?? "",
            isActive: plant.isActive !== false,
            growthStage: plant.growthStage ?? "seedling",
            source: plant.source ?? "",
            sourceSystem: plant.sourceSystem ?? "sqlite",
            sourceId: plant.sourceId ?? "",
            sourceUrl: plant.sourceUrl ?? "",
            recordVersion: plant.recordVersion !== undefined ? String(plant.recordVersion) : "1",
            contentStatus: plant.contentStatus ?? "published",
            contentVersion: plant.contentVersion !== undefined ? String(plant.contentVersion) : "1",
            reviewStatus: plant.reviewStatus ?? "unreviewed",
            reviewedBy: plant.reviewedBy ?? "",
            careStatus: plant.careStatus ?? "missing",
            careFieldEvidence: plant.careFieldEvidence,
            propagationMethods: normalizePropagationMethods(plant.propagationMethods) ?? [],
            propagationSourceRefs: (() => {
                const evidence = plant.careFieldEvidence?.propagationMethods;
                return evidence && typeof evidence === "object" && !Array.isArray(evidence) && Array.isArray((evidence as any).sourceRefs)
                    ? (evidence as any).sourceRefs
                    : [];
            })(),
            propagationSourceRefsDirty: false,
            originCountries: plant.originCountries ?? [],
            originCountrySourceRefs: plant.originCountrySourceRefs ?? {},
            provenRegions: plant.provenRegions ?? [],
            adaptationTermCodes: plant.adaptationTermCodes ?? [],
            adaptationTermSourceRefs: plant.adaptationTermSourceRefs ?? {},
        };
    }


    function select(plant: Plant) {
        requestSequence.current += 1;
        setSelectedId(plant._id);
        if (mode !== "create") setMode("view");
    }

    function startCreate() {
        requestSequence.current += 1;
        setMode("create");
        setForm(emptyPlantForm);
        setSelectedId(null);
        setError("");
    }

    function startEdit(plant: Plant) {
        requestSequence.current += 1;
        setMode("edit");
        setForm(toFormState(plant));
        setSelectedId(plant._id);
        setError("");
    }

    function cancel() {
        requestSequence.current += 1;
        if (selected) {
            setForm(toFormState(selected));
        } else {
            setForm(emptyPlantForm);
        }
        setMode("view");
    }

    async function openExactCanonicalMatch(id: number | string, targetMode: "view" | "edit" = "edit"): Promise<boolean> {
        const requestId = ++requestSequence.current;
        try {
            const hydrated = await fetchBackendPlantById(authedFetch, id);
            if (requestId !== requestSequence.current) return false;
            setPlants((current) => mergeHydratedPlant(current, hydrated));
            setSelectedId(hydrated._id);
            setForm(toFormState(hydrated));
            setMode(targetMode);
            return true;
        } catch (err) {
            if (requestId === requestSequence.current) {
                setError(err instanceof Error ? err.message : "Cannot load the exact canonical match");
            }
            return false;
        }
    }

    async function openPlantDetail(id: number | string): Promise<boolean> {
        return openExactCanonicalMatch(id, "view");
    }

    async function save(): Promise<string | null> {
        if (saving) return null;

        const isEdit = mode === "edit" && selected !== null;
        const genus = form.genus.trim();
        const species = form.species.trim();
        const rank = form.infraspecificRank.trim() || null;
        const infraspecificName = form.infraspecificName.trim() || null;
        const cultivar = form.cultivar.trim() || null;
        const scientificName = [
            computeScientificName(genus, species),
            rank && infraspecificName ? `${rank} ${infraspecificName}` : "",
        ].filter(Boolean).join(" ");

        if (!genus || !species) {
            setError("Genus and Species are required.");
            return null;
        }
        if (!form.viCommonName.trim() || !form.enCommonName.trim()) {
            setError("Both VI and EN common names are required.");
            return null;
        }

        const canonicalIdentityInput = {
            genus,
            species,
            infraspecificRank: rank ?? "",
            infraspecificName: infraspecificName ?? "",
            cultivar: cultivar ?? "",
            identityScope: form.identityScope,
            parentMasterPlantId: form.parentMasterPlantId,
            parentCanonicalKey: form.parentCanonicalKey,
        } as const;
        // New rows and already-canonical rows always send the complete
        // structured tuple.  A legacy existing row may use the narrowly
        // scoped scientific_name compatibility path for an unrelated edit.
        const sendStructuredIdentity = !isEdit || selected?.canonicalIdentityComplete === true;
        if (sendStructuredIdentity) {
            const validation = validateDashboardCanonicalIdentity(canonicalIdentityInput);
            if (!validation.ok) {
                setError(validation.issues.map((issue) => issue.message).join("; "));
                return null;
            }
        }

        const numericFields: Array<[string, string]> = [
            ["Days to harvest", form.typicalDaysToHarvest],
            ["Watering frequency", form.wateringFrequencyDays],
            ["Fertilizing frequency", form.fertilizingFrequencyDays],
            ["Germination days", form.germinationDays],
            ["Spacing", form.spacingCm],
            ["Max plants/m²", form.maxPlantsPerM2],
            ["Seed rate/m²", form.seedRatePerM2],
            ["Water liters/m²", form.waterLitersPerM2],
            ["Yield kg/m²", form.yieldKgPerM2],
            ["Soil pH minimum", form.soilPhMin],
            ["Soil pH maximum", form.soilPhMax],
            ["Moisture target", form.moistureTarget],
            ["Light hours", form.lightHours],
            ["Record version", form.recordVersion],
            ["Content version", form.contentVersion],
        ];
        for (const [label, value] of numericFields) {
            if (value.trim() && parseOptionalNumber(value) === undefined) {
                setError(`${label} must be a valid number.`);
                return null;
            }
        }
        const soilPhMin = parseOptionalNumber(form.soilPhMin);
        const soilPhMax = parseOptionalNumber(form.soilPhMax);
        if (soilPhMin !== undefined && soilPhMax !== undefined && soilPhMin > soilPhMax) {
            setError("Soil pH minimum must be less than or equal to maximum.");
            return null;
        }
        if (form.sourceUrl.trim()) {
            try {
                const sourceUrl = new URL(form.sourceUrl.trim());
                if (!/^https?:$/.test(sourceUrl.protocol)) throw new Error("unsupported protocol");
            } catch {
                setError("Source URL must be a valid http(s) URL.");
                return null;
            }
        }

        const backendPayload = {
            plant_code: [
                slugifyPlantCode(scientificName),
                cultivar ? slugifyPlantCode(cultivar) : "",
            ].filter(Boolean).join("_").slice(0, 120),
            common_name: form.viCommonName.trim(),
            scientific_name: scientificName,
            ...(sendStructuredIdentity
                ? {
                    genus,
                    species,
                    infraspecific_rank: rank,
                    infraspecific_name: infraspecificName,
                    cultivar,
                    identity_scope: form.identityScope,
                    parent_master_plant_id: form.parentMasterPlantId.trim() ? Number(form.parentMasterPlantId) : null,
                    parent_canonical_key: form.parentCanonicalKey.trim() || null,
                }
                : {}),
            category: form.group.trim() || "other",
            group: form.group.trim() || "other",
            family: form.family.trim() || null,
            purposes: parsePurposes(form.purposes),
            growth_stage: form.growthStage.trim() || "seedling",
            typical_days_to_harvest: parseOptionalNumber(form.typicalDaysToHarvest) ?? null,
            germination_days: parseOptionalNumber(form.germinationDays) ?? null,
            watering_frequency_days: parseOptionalNumber(form.wateringFrequencyDays) ?? null,
            fertilizing_frequency_days: parseOptionalNumber(form.fertilizingFrequencyDays) ?? null,
            soil_ph_min: parseOptionalNumber(form.soilPhMin) ?? null,
            soil_ph_max: parseOptionalNumber(form.soilPhMax) ?? null,
            moisture_target: parseOptionalNumber(form.moistureTarget) ?? null,
            light_hours: parseOptionalNumber(form.lightHours) ?? null,
            light_requirements: form.lightRequirements.trim() || null,
            spacing_cm: parseOptionalNumber(form.spacingCm) ?? null,
            max_plants_per_m2: parseOptionalNumber(form.maxPlantsPerM2) ?? null,
            seed_rate_per_m2: parseOptionalNumber(form.seedRatePerM2) ?? null,
            water_liters_per_m2: parseOptionalNumber(form.waterLitersPerM2) ?? null,
            yield_kg_per_m2: parseOptionalNumber(form.yieldKgPerM2) ?? null,
            image_url: form.imageUrl.trim() || null,
            is_active: form.isActive,
            notes: form.notes.trim() || null,
            source_system: form.sourceSystem.trim() || "sqlite",
            source_id: form.sourceId.trim() || null,
            record_version: parseOptionalNumber(form.recordVersion) ?? 1,
            source_url: form.sourceUrl.trim() || null,
            content_status: form.contentStatus,
            content_version: parseOptionalNumber(form.contentVersion) ?? 1,
            review_status: form.reviewStatus,
            reviewed_by: form.reviewedBy.trim() || null,
            care_status: form.careStatus,
            propagation_methods: form.propagationMethods,
            origin_countries: form.originCountries,
            origin_country_source_refs: form.originCountrySourceRefs,
            proven_regions: form.provenRegions,
            adaptation_term_codes: form.adaptationTermCodes,
            adaptation_term_source_refs: form.adaptationTermSourceRefs,
            ...(form.propagationSourceRefsDirty
                ? {
                    care_field_evidence: {
                        ...(form.careFieldEvidence ?? {}),
                        propagationMethods: {
                            ...((form.careFieldEvidence?.propagationMethods as Record<string, unknown> | undefined) ?? {}),
                            status: ((form.careFieldEvidence?.propagationMethods as Record<string, unknown> | undefined)?.status as string)
                                ?? (form.careStatus === "verified" || form.careStatus === "not_applicable" ? form.careStatus : "awaiting_review"),
                            sourceRefs: form.propagationSourceRefs,
                        },
                    },
                }
                : {}),
            metadata_json: {
                ...(form.source.trim() ? { source: form.source.trim() } : {}),
                ...(cultivar ? { cultivar } : {}),
                ...(form.basePlantId.trim() ? { basePlantId: form.basePlantId.trim() } : {}),
                ...(form.commonNameGroupKey.trim() ? { commonNameGroupKey: form.commonNameGroupKey.trim() } : {}),
                ...(form.commonNameGroupVi.trim() ? { commonNameGroupVi: form.commonNameGroupVi.trim() } : {}),
                ...(form.commonNameGroupEn.trim() ? { commonNameGroupEn: form.commonNameGroupEn.trim() } : {}),
                ...(form.commonGenusNameVi.trim() ? { commonGenusNameVi: form.commonGenusNameVi.trim() } : {}),
                ...(form.commonGenusNameEn.trim() ? { commonGenusNameEn: form.commonGenusNameEn.trim() } : {}),
                ...(form.commonSpeciesNameVi.trim() ? { commonSpeciesNameVi: form.commonSpeciesNameVi.trim() } : {}),
                ...(form.commonSpeciesNameEn.trim() ? { commonSpeciesNameEn: form.commonSpeciesNameEn.trim() } : {}),
            },
            i18n: {
                vi: {
                    common_name: form.viCommonName.trim(),
                    description: form.viDescription.trim() || undefined,
                    source: form.source.trim() || undefined,
                    source_url: form.sourceUrl.trim() || undefined,
                    content_status: form.contentStatus,
                    content_version: parseOptionalNumber(form.contentVersion) ?? 1,
                    review_status: form.reviewStatus,
                    reviewed_by: form.reviewedBy.trim() || undefined,
                    content_origin: "authored",
                },
                en: {
                    common_name: form.enCommonName.trim(),
                    description: form.enDescription.trim() || undefined,
                    source: form.source.trim() || undefined,
                    source_url: form.sourceUrl.trim() || undefined,
                    content_status: form.contentStatus,
                    content_version: parseOptionalNumber(form.contentVersion) ?? 1,
                    review_status: form.reviewStatus,
                    reviewed_by: form.reviewedBy.trim() || undefined,
                    content_origin: "authored",
                },
            },
        };

        setSaving(true);
        setError("");
        try {
            if (isEdit && !/^\d+$/.test(selected._id)) {
                throw new Error("Selected plant does not have a numeric SQLite id.");
            }
            if (!isEdit) {
                const previewResponse = await authedFetch("/api/master-plants/canonical-match-preview", {
                    method: "POST",
                    body: JSON.stringify(backendPayload),
                });
                const previewBody = await previewResponse.json().catch(() => ({}));
                if (!previewResponse.ok) {
                    throw new Error(previewBody.error ?? previewBody.details ?? "Cannot preview canonical identity");
                }
                const preview = previewBody.data ?? previewBody;
                if (preview.status === "exact" && preview.exact?.id !== undefined) {
                    const existingId = String(preview.exact.id);
                    const existing = plants.find((plant) => plant._id === existingId);
                    if (existing) {
                        startEdit(existing);
                    } else {
                        const opened = await openExactCanonicalMatch(preview.exact.id);
                        if (!opened) return null;
                    }
                    setError("An exact canonical match already exists; the existing plant was opened for editing.");
                    return null;
                }
            }
            const endpoint = isEdit ? `/api/master-plants/${selected._id}` : "/api/master-plants";
            const response = await authedFetch(endpoint, {
                method: isEdit ? "PATCH" : "POST",
                body: JSON.stringify(backendPayload),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body.error ?? "Cannot save plant");
            }
            const savedId = body.data?.id !== undefined ? String(body.data.id) : null;
            setSelectedId(savedId);
            setMode("view");
            // Refresh after the local commit. Convex publication is explicit
            // and does not delay the editor's save acknowledgement.
            void load();
            return isEdit ? "Plant updated locally" : "Plant created locally";
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
            if (!/^\d+$/.test(selected._id)) {
                throw new Error("Selected plant does not have a numeric SQLite id.");
            }
            const response = await authedFetch(`/api/master-plants/${selected._id}`, {
                method: "DELETE",
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error ?? "Cannot delete plant");
            }
            setSelectedId(null);
            void load();
            return "Plant deleted locally";
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
        retry: load,
        select,
        openExactCanonicalMatch,
        openPlantDetail,
        startCreate,
        startEdit,
        cancel,
        save,
        remove,
    };
}
