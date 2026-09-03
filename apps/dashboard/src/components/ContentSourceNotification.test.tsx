import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContentSourceNotification } from "./ContentSourceNotification";

const event = {
    id: 1,
    event_id: "okra-content-event",
    correlation_group_id: null,
    root_key: "plants",
    path: "content/plants/abelmoschus-esculentus/content.json",
    owning_manifest_path: "content/plants/abelmoschus-esculentus/content.json",
    entity_kind: "plant",
    entity_key: "abelmoschus-esculentus",
    locale: null,
    event_type: "created",
    old_sha256: null,
    new_sha256: "a".repeat(64),
    detector_source: "watcher",
    evidence_revision: 1,
    findings_json: "{}",
    review_state: "pending",
    reviewer_id: null,
    review_reason: null,
    reviewed_at: null,
    proposal_id: null,
    superseded_by_event_id: null,
    coalesced_count: 1,
    first_detected_at: "2026-09-01T09:00:00.000Z",
    last_detected_at: "2026-09-01T09:00:00.000Z",
};

describe("ContentSourceNotification", () => {
    it("identifies the exact plant and opens the inbox event", () => {
        let opened = "";
        const html = renderToStaticMarkup(
            React.createElement(ContentSourceNotification, {
                events: { items: [event], total: 1, limit: 50, offset: 0 },
                onOpenEvent: (eventId: string) => { opened = eventId; },
            }),
        );

        expect(html).toContain("Content changes awaiting review");
        expect(html).toContain("Plant · Abelmoschus esculentus");
        expect(html).toContain("content/plants/abelmoschus-esculentus/content.json");
        expect(html).toContain("Open Content Inbox to preview and approve the detected changes.");
        expect(html).toContain('data-testid="content-source-item-okra-content-event"');
        expect(opened).toBe("");
    });

    it("stays quiet while there are no pending source events", () => {
        expect(renderToStaticMarkup(
            React.createElement(ContentSourceNotification, { events: null, onOpenEvent: () => undefined }),
        )).toBe("");
        expect(renderToStaticMarkup(
            React.createElement(ContentSourceNotification, {
                events: { items: [], total: 0, limit: 50, offset: 0 },
                onOpenEvent: () => undefined,
            }),
        )).toBe("");
    });
});
