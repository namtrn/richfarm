import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CareContent, ApprovePlantPanel, localeSetIsApproved, localeApprovalDetail } from "./PlantManager";
import { CareGuideModal } from "./CareGuideModal";
import { buildCareContentPayload, resolveI18nSaveTarget } from "../hooks/useI18n";
import { fetchBackendPlantById, mergeHydratedPlant, validateDashboardCanonicalIdentity } from "../hooks/usePlants";
import { preflightImportCanonicalIdentity, validateImportCanonicalIdentity } from "../hooks/useBackendPlants";
import { csvToRows } from "./ImportModal";
import type { Plant } from "../types";

describe("dashboard canonical create/import boundary", () => {
    it("accepts explicit base identity and rejects cultivar without a parent", () => {
        expect(validateDashboardCanonicalIdentity({
            genus: "Solanum",
            species: "lycopersicum",
            infraspecificRank: "",
            infraspecificName: "",
            cultivar: "",
            identityScope: "base",
            parentMasterPlantId: "",
            parentCanonicalKey: "",
        }).ok).toBe(true);
        const missingParent = validateDashboardCanonicalIdentity({
            genus: "Solanum",
            species: "lycopersicum",
            infraspecificRank: "",
            infraspecificName: "",
            cultivar: "Cherry",
            identityScope: "cultivar",
            parentMasterPlantId: "",
            parentCanonicalKey: "",
        });
        expect(missingParent.ok).toBe(false);
        if (!missingParent.ok) expect(missingParent.code).toBe("CANONICAL_IDENTITY_PARENT_REQUIRED");
    });

    it("preflights imports without inferring scientific_name", () => {
        expect(validateImportCanonicalIdentity({ scientific_name: "Solanum lycopersicum" })).toMatch(/genus/);
        expect(validateImportCanonicalIdentity({
            genus: "Solanum",
            species: "lycopersicum",
            infraspecific_rank: null,
            infraspecific_name: null,
            cultivar: null,
            identity_scope: "base",
            parent_master_plant_id: null,
            parent_canonical_key: null,
        })).toBeNull();
    });

    it("blocks exact import matches before create and leaves near matches as suggestions", async () => {
        const calls: string[] = [];
        const exactFetch = async (path: string): Promise<Response> => {
            calls.push(path);
            return {
                ok: true,
                json: async () => ({
                    data: {
                        status: "exact",
                        exact: { id: 1554, plantCode: "TOMATO_BASE" },
                        suggestions: [],
                    },
                }),
            } as Response;
        };
        const row = {
            genus: "Solanum",
            species: "lycopersicum",
            infraspecific_rank: null,
            infraspecific_name: null,
            cultivar: null,
            identity_scope: "base",
            parent_master_plant_id: null,
            parent_canonical_key: null,
        };

        await expect(preflightImportCanonicalIdentity(exactFetch, row)).resolves.toEqual({
            ok: false,
            reason: "exact",
            error: "exact canonical match at plant 1554 (TOMATO_BASE)",
        });
        expect(calls).toEqual(["/api/master-plants/canonical-match-preview"]);

        const nearFetch = async (path: string): Promise<Response> => {
            calls.push(path);
            return {
                ok: true,
                json: async () => ({ data: { status: "near_match", exact: null, suggestions: [{ id: 1554 }] } }),
            } as Response;
        };
        await expect(preflightImportCanonicalIdentity(nearFetch, row)).resolves.toMatchObject({
            ok: true,
            preview: { status: "near_match", exact: null },
        });
        expect(calls).toEqual([
            "/api/master-plants/canonical-match-preview",
            "/api/master-plants/canonical-match-preview",
        ]);
    });

    it("hydrates an exact match outside the current page before edit", async () => {
        const calls: string[] = [];
        const authedFetch = async (path: string): Promise<Response> => {
            calls.push(path);
            return {
                ok: true,
                json: async () => ({
                    data: {
                        id: 1554,
                        plant_code: "TOMATO_BASE",
                        common_name: "Tomato",
                        scientific_name: "Solanum lycopersicum",
                        canonical_identity_version: "canonical_identity_v1",
                        canonical_key: '["v1","solanum","lycopersicum","","",""]',
                        genus: "solanum",
                        species: "lycopersicum",
                        infraspecific_rank: null,
                        infraspecific_name: null,
                        cultivar: null,
                        identity_scope: "base",
                        parent_master_plant_id: null,
                        parent_canonical_key: null,
                        i18n: {
                            vi: { common_name: "Cà chua" },
                            en: { common_name: "Tomato" },
                        },
                    },
                }),
            } as Response;
        };
        const hydrated = await fetchBackendPlantById(authedFetch, 1554);
        const currentPage = [{
            _id: "1",
            scientificName: "Capsicum annuum",
            group: "other",
            i18nRows: [],
        }] as Plant[];
        const merged = mergeHydratedPlant(currentPage, hydrated);

        expect(calls).toEqual(["/api/master-plants/1554?source=sqlite"]);
        expect(hydrated).toMatchObject({
            _id: "1554",
            genus: "solanum",
            species: "lycopersicum",
            canonicalKey: '["v1","solanum","lycopersicum","","",""]',
        });
        expect(merged.map((plant) => plant._id)).toEqual(["1554", "1"]);
        expect(merged[0]).toBe(hydrated);
    });

    it("parses canonical CSV columns without inventing missing fields", () => {
        const rows = csvToRows([
            "plant_code,genus,species,infraspecific_rank,infraspecific_name,cultivar,identity_scope,parent_master_plant_id,parent_canonical_key,vi_common_name,en_common_name",
            "TOMATO_1,Solanum,lycopersicum,,,,base,,,Cà chua,Tomato",
        ].join("\n"));
        expect(rows[0]).toMatchObject({
            plant_code: "TOMATO_1",
            genus: "Solanum",
            species: "lycopersicum",
            infraspecific_rank: null,
            cultivar: null,
            identity_scope: "base",
            parent_master_plant_id: null,
        });
    });
});

describe("dashboard Markdown care editor", () => {
    it("shows a deterministic empty state without invented care content", () => {
        const html = renderToStaticMarkup(React.createElement(CareContent, { content: "   " }));
        expect(html).toContain("No care guide yet.");
        expect(html).not.toContain("LOREM");
        expect(html).not.toContain("raw JSON");
    });

    it("keeps non-empty care bytes and makes whitespace-only input an explicit clear", () => {
        const markdown = "  # Heading\n\nUnicode: ẩm.\n";
        expect(buildCareContentPayload(markdown)).toBe(markdown);
        expect(buildCareContentPayload("")).toBeNull();
        expect(buildCareContentPayload(" \n\t ")).toBeNull();
    });
});

describe("i18n save target resolution", () => {
    const selectedRow = {
        _id: "101",
        plantId: "42",
        locale: "en",
        commonName: "Existing translation",
    };
    const sourceRow = {
        _id: "202",
        plantId: "42",
        locale: "vi",
        commonName: "Care guide translation",
    };

    it("uses the explicit source row for PATCH when React state is still stale", () => {
        const target = resolveI18nSaveTarget("create", selectedRow, sourceRow);

        expect(target.mode).toBe("edit");
        expect(target.row).toBe(sourceRow);
        expect(target.row?._id).toBe("202");
    });

    it("keeps ordinary create and selected-row edit saves unchanged", () => {
        expect(resolveI18nSaveTarget("create", null)).toEqual({ mode: "create", row: null });
        expect(resolveI18nSaveTarget("edit", selectedRow)).toEqual({ mode: "edit", row: selectedRow });
        expect(resolveI18nSaveTarget("view", null)).toEqual({ mode: "none", row: null });
    });
});

describe("CAP approve panel", () => {
    const approvedPlant = {
        _id: "921",
        scientificName: "Bougainvillea glabra",
        group: "other",
        i18nRows: [
            { locale: "en", commonName: "Bougainvillea", careContent: "en care", reviewStatus: "reviewed", contentStatus: "published", reviewedBy: "1:admin", reviewedAt: "2026-08-31T08:00:00.000Z" },
            { locale: "vi", commonName: "Hoa giấy", careContent: "vi care", reviewStatus: "reviewed", contentStatus: "published", reviewedBy: "1:admin", reviewedAt: "2026-08-31T08:00:00.000Z" },
        ],
    };
    const draftPlant = {
        ...approvedPlant,
        i18nRows: [
            { locale: "en", commonName: "Bougainvillea", careContent: "en care", reviewStatus: "unreviewed", contentStatus: "needs_review" },
            { locale: "vi", commonName: "Hoa giấy", careContent: "vi care", reviewStatus: "unreviewed", contentStatus: "needs_review" },
        ],
    };

    it("treats a locale set as approved only when every care locale carries full audit metadata", () => {
        expect(localeSetIsApproved(approvedPlant.i18nRows)).toBe(true);
        expect(localeSetIsApproved(draftPlant.i18nRows)).toBe(false);
        expect(localeSetIsApproved([{ careContent: undefined }, { careContent: undefined }])).toBe(true);
        expect(localeSetIsApproved([{ ...draftPlant.i18nRows[0], reviewedAt: undefined }])).toBe(false);
    });

    it("shows the approved state instead of the approve action when everything is reviewed", () => {
        const html = renderToStaticMarkup(
            React.createElement(ApprovePlantPanel, {
                plant: approvedPlant as Plant,
                i18n: { approvePlant: async () => ({ ok: true, message: "" }) } as never,
                reload: async () => undefined,
                onToast: () => undefined,
            }),
        );
        expect(html).toContain("Approved ✓");
        expect(html).not.toContain("Approve &amp; queue");
    });

    it("offers the approve action and blocks approval when care locales lack provenance", () => {
        const html = renderToStaticMarkup(
            React.createElement(ApprovePlantPanel, {
                plant: draftPlant as Plant,
                i18n: { approvePlant: async () => ({ ok: false, message: "" }) } as never,
                reload: async () => undefined,
                onToast: () => undefined,
            }),
        );
        expect(html).toContain("Approve &amp; queue");
        expect(html).toContain("Care locales without source references cannot be approved");
        expect(html).toContain("en, vi");
    });

    it("lists care byte counts and source references before approval", () => {
        expect(localeApprovalDetail({ locale: "vi", careContent: "vi care", sourceRefs: [{ sourceLocator: "plans/priority.md" }] }))
            .toBe("care 7 bytes · refs: plans/priority.md");
        expect(localeApprovalDetail({ locale: "en", careContent: "" })).toBe("no care · no source refs");
        const withRefs = {
            ...draftPlant,
            i18nRows: [
                { locale: "en", commonName: "Bougainvillea", careContent: "en care", reviewStatus: "unreviewed", contentStatus: "needs_review", sourceRefs: [{ sourceLocator: "plans/priority.md" }] },
                { locale: "vi", commonName: "Hoa giấy", careContent: "vi care", reviewStatus: "unreviewed", contentStatus: "needs_review", sourceRefs: [{ sourceLocator: "plans/priority.md" }] },
            ],
        };
        const html = renderToStaticMarkup(
            React.createElement(ApprovePlantPanel, {
                plant: withRefs as Plant,
                i18n: { approvePlant: async () => ({ ok: true, message: "" }) } as never,
                reload: async () => undefined,
                onToast: () => undefined,
            }),
        );
        expect(html).toContain("Approve &amp; queue");
        expect(html).not.toContain("cannot be approved");
    });
});

describe("CareGuideModal", () => {
    const locales = [
        { locale: "vi", label: "Vietnamese", careContent: "## Tưới nước\n\nGiữ **ẩm đều**." },
        { locale: "en", label: "English", careContent: "## Watering\n\nKeep **evenly moist**." },
        { locale: "es", label: "Spanish" },
    ];

    it("renders one tab per locale and focuses the initial locale", () => {
        const html = renderToStaticMarkup(
            React.createElement(CareGuideModal, {
                locales,
                initialLocale: "en",
                onSave: async () => "saved",
                onClose: () => undefined,
            }),
        );

        expect(html).toContain("Vietnamese");
        expect(html).toContain("English");
        expect(html).toContain("Spanish");
        expect(html).toMatch(/class="form-tab active"[^>]*>English<\/button>/);
        expect(html).toContain('aria-label="Care guide (en) — Markdown"');
    });

    it("loads the existing care guide into the editor in edit mode", () => {
        const html = renderToStaticMarkup(
            React.createElement(CareGuideModal, {
                locales,
                initialLocale: "vi",
                onSave: async () => "saved",
                onClose: () => undefined,
            }),
        );

        expect(html).toMatch(/class="care-editor-input care-editor-input--modal"[^>]*>## Tưới nước/);
        expect(html).toContain("Giữ");
        // Edit mode renders the raw Markdown source, not the preview.
        expect(html).not.toContain("<strong>ẩm đều</strong>");
        expect(html).not.toContain("evenly moist");
        expect(html).toContain("Import Markdown");
        expect(html).toContain('aria-label="Import Markdown care guide (vi)"');
        expect(html).toContain("Loads into this VI draft; save to apply.");
    });

    it("renders the existing care guide in preview mode", () => {
        const html = renderToStaticMarkup(
            React.createElement(CareGuideModal, {
                locales,
                initialLocale: "vi",
                initialMode: "preview",
                onSave: async () => "saved",
                onClose: () => undefined,
            }),
        );

        expect(html).toContain('class="markdown-body care-preview care-preview--modal"');
        expect(html).toContain("<strong>ẩm đều</strong>");
        expect(html).not.toContain('aria-label="Care guide (vi) — Markdown"');
    });

    it("shows the empty state preview for a locale without a care guide", () => {
        const html = renderToStaticMarkup(
            React.createElement(CareGuideModal, {
                locales,
                initialLocale: "es",
                initialMode: "preview",
                onSave: async () => "saved",
                onClose: () => undefined,
            }),
        );

        expect(html).toContain("No care guide yet.");
        expect(html).toContain("Save care guide");
    });

    it("omits the tab bar when only one locale exists", () => {
        const html = renderToStaticMarkup(
            React.createElement(CareGuideModal, {
                locales: [{ locale: "vi", label: "Vietnamese", careContent: "## Tưới nước" }],
                onSave: async () => "saved",
                onClose: () => undefined,
            }),
        );

        expect(html).not.toContain("care-guide-modal-lang-tabs");
        expect(html).toContain('aria-label="Care guide (vi) — Markdown"');
    });
});
