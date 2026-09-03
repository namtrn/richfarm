import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CareApprovalNotification } from "./CareApprovalNotification";

describe("CareApprovalNotification", () => {
    it("identifies the exact plant and locales waiting for second approval", () => {
        const html = renderToStaticMarkup(
            React.createElement(CareApprovalNotification, {
                approvals: [{
                    plantId: 921,
                    plantCode: "BOUGAINVILLEA_GL_BASIS",
                    displayName: "Hoa giấy",
                    scientificName: "Bougainvillea glabra",
                    locales: ["en", "vi"],
                    updatedAt: "2026-09-01T00:00:00.000Z",
                }],
                onOpenPlant: () => undefined,
            }),
        );

        expect(html).toContain("Care content awaiting second approval");
        expect(html).toContain("Hoa giấy");
        expect(html).toContain("Bougainvillea glabra · BOUGAINVILLEA_GL_BASIS");
        expect(html).toContain("locales: EN, VI");
        expect(html).toContain("2 locales waiting for the second approval.");
        expect(html).toContain('data-testid="care-approval-item-921"');
    });

    it("stays quiet while the list is empty or unavailable", () => {
        expect(renderToStaticMarkup(
            React.createElement(CareApprovalNotification, { approvals: [], onOpenPlant: () => undefined }),
        )).toBe("");
        expect(renderToStaticMarkup(
            React.createElement(CareApprovalNotification, { approvals: null, onOpenPlant: () => undefined }),
        )).toBe("");
    });
});
