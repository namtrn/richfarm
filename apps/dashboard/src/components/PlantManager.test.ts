import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CareContent } from "./PlantManager";
import { CareGuideModal } from "./CareGuideModal";
import { buildCareContentPayload } from "../hooks/useI18n";

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
