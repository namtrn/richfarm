import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GeographyEditor } from "./GeographyEditor";
import { TaxonomyManager } from "./TaxonomyManager";
import type { ResolvedGeography } from "../types";
import { withPlantFormDefaults } from "../constants";
import type { useAdaptationTerms } from "../hooks/useAdaptationTerms";

const emptyForm = withPlantFormDefaults({
    genus: "",
    species: "",
    cultivar: "",
    group: "other",
    basePlantId: "",
    commonNameGroupKey: "",
    commonNameGroupVi: "",
    commonNameGroupEn: "",
    commonGenusNameVi: "",
    commonGenusNameEn: "",
    commonSpeciesNameVi: "",
    commonSpeciesNameEn: "",
    imageUrl: "",
    purposes: "",
    originCountries: [],
    originCountrySourceRefs: {},
    provenRegions: [],
    adaptationTermCodes: [],
    adaptationTermSourceRefs: {},
    viCommonName: "",
    viDescription: "",
    enCommonName: "",
    enDescription: "",
    typicalDaysToHarvest: "",
    wateringFrequencyDays: "",
    fertilizingFrequencyDays: "",
    germinationDays: "",
    spacingCm: "",
    lightRequirements: "",
    maxPlantsPerM2: "",
    seedRatePerM2: "",
    waterLitersPerM2: "",
    yieldKgPerM2: "",
    soilPhMin: "",
    soilPhMax: "",
    moistureTarget: "",
    lightHours: "",
    family: "",
    notes: "",
    isActive: true,
    growthStage: "seedling",
    source: "",
    sourceSystem: "sqlite",
    sourceId: "",
    sourceUrl: "",
    recordVersion: "1",
    contentStatus: "published",
    contentVersion: "1",
    reviewStatus: "unreviewed",
    reviewedBy: "",
    careStatus: "missing",
    careFieldEvidence: undefined,
    propagationMethods: [],
    propagationSourceRefs: [],
    propagationSourceRefsDirty: false,
});

const authedFetch = async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });

const inheritedResolved: ResolvedGeography = {
    origin_country_codes: ["VN"],
    origin_country_source: "own",
    proven_regions: [{ country_code: "US" }],
    proven_region_source: "inherited",
    adaptation_term_codes: ["warm"],
    adaptation_term_source: "inherited",
    inherited_from_id: 5,
};

describe("dashboard geography editor", () => {
    it("renders origin, proven-region, and adaptation sections with the missing-data guidance", () => {
        const html = renderToStaticMarkup(
            React.createElement(GeographyEditor, {
                form: emptyForm,
                onChange: () => undefined,
                authedFetch,
                resolved: undefined,
                isCultivar: false,
            }),
        );

        expect(html).toContain("Origin countries");
        expect(html).toContain("Proven regions");
        expect(html).toContain("Add proven region");
        expect(html).toContain("Adaptation");
        expect(html).toContain("Temperature");
        expect(html).toContain("Moisture");
        expect(html).toContain("Climate");
        expect(html).toContain("Season");
        expect(html).toContain("Unlisted countries are");
        expect(html).toContain("unknown, not unsuitable");
        // No invented suitability claim and no inheritance block for a base row.
        expect(html).not.toContain("Inherited from base species");
        expect(html).not.toContain("Suited to");
        expect(html).not.toContain("Grows well in");
    });

    it("shows inherited category chips and an override action for cultivars", () => {
        const html = renderToStaticMarkup(
            React.createElement(GeographyEditor, {
                form: { ...emptyForm, cultivar: "Cherry" },
                onChange: () => undefined,
                authedFetch,
                resolved: inheritedResolved,
                isCultivar: true,
            }),
        );

        expect(html).toContain("Inherited from base species");
        expect(html).toContain("Origin: 1 value(s), own");
        expect(html).toContain("Proven regions: 1 value(s), inherited");
        expect(html).toContain("Adaptation: 1 value(s), inherited");
        expect(html).toContain("Override: copy resolved values to own");
    });

    it("renders selected origin countries as removable chips", () => {
        const form = { ...emptyForm, originCountries: ["VN", "US"] };
        const html = renderToStaticMarkup(
            React.createElement(GeographyEditor, {
                form,
                onChange: () => undefined,
                authedFetch,
                resolved: undefined,
                isCultivar: false,
            }),
        );

        expect(html).toContain("Viet Nam (VN)");
        expect(html).toContain("United States of America (US)");
        expect(html).toContain("geo-chip-remove");
    });
});

describe("dashboard taxonomy manager", () => {
    const terms = [
        {
            _id: "term-1",
            code: "hot",
            dimension: "temperature",
            status: "active" as const,
            sortOrder: 1,
            usageCount: 3,
            translations: [
                { locale: "vi", label: "Nóng", description: "Định nghĩa.", translationStatus: "human_reviewed" as const },
                { locale: "en", label: "Hot", description: "Definition.", translationStatus: "approved" as const },
            ],
        },
        {
            _id: "term-2",
            code: "dry",
            dimension: "moisture",
            status: "archived" as const,
            sortOrder: 1,
            usageCount: 0,
            translations: [
                { locale: "vi", label: "Khô", translationStatus: "human_reviewed" as const },
                { locale: "en", label: "Dry", translationStatus: "human_reviewed" as const },
            ],
        },
    ];

    function hookStub(overrides: Record<string, unknown> = {}) {
        return {
            terms,
            loading: false,
            saving: false,
            refreshing: false,
            error: "",
            setError: () => undefined,
            selected: null,
            selectedId: null,
            mode: "view" as const,
            form: {
                code: "",
                dimension: "temperature",
                sortOrder: "0",
                labelVi: "",
                descriptionVi: "",
                labelEn: "",
                descriptionEn: "",
            },
            setForm: () => undefined,
            groupedByDimension: [
                { dimension: "temperature", terms: [terms[0]] },
                { dimension: "moisture", terms: [terms[1]] },
            ],
            load: async () => undefined,
            select: () => undefined,
            startCreate: () => undefined,
            startEdit: () => undefined,
            cancel: () => undefined,
            save: async () => "ok",
            toggleArchive: async () => null,
            reorder: async () => null,
            refreshMirror: async () => null,
            ...overrides,
        } as unknown as ReturnType<typeof useAdaptationTerms>;
    }

    it("groups terms by dimension with translation status and usage counts", () => {
        const html = renderToStaticMarkup(
            React.createElement(TaxonomyManager, {
                t: hookStub(),
                isAdmin: false,
                onToast: () => undefined,
            }),
        );

        expect(html).toContain("Adaptation Taxonomy");
        expect(html).toContain("Temperature");
        expect(html).toContain("Moisture");
        expect(html).toContain("hot");
        expect(html).toContain("dry");
        expect(html).toContain("Nóng");
        expect(html).toContain("Hot");
        expect(html).toContain("Human reviewed");
        expect(html).toContain("Approved");
        expect(html).toContain("archived");
        expect(html).toContain("3");
        // Create + mirror-sync controls are admin-only.
        expect(html).not.toContain("+ New Term");
        expect(html).not.toContain("Sync SQLite mirror");
    });

    it("shows admin-only create and mirror-sync actions for admins", () => {
        const html = renderToStaticMarkup(
            React.createElement(TaxonomyManager, {
                t: hookStub(),
                isAdmin: true,
                onToast: () => undefined,
            }),
        );

        expect(html).toContain("+ New Term");
        expect(html).toContain("Sync SQLite mirror");
        expect(html).toContain("Refresh");
    });
});
