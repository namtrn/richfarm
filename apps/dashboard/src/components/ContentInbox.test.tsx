import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildEventsPath,
  CONTENT_INBOX_POLL_INTERVAL_MS,
  defaultContentInboxFilters,
  detectorLabel,
  monitorPhasePillClass,
  reviewStateBadgeClass,
  type ContentEventsPage,
  type ContentMonitorStatusResponse,
} from "../contentReview";
import { ContentInbox, ContentSourceHealthBadge } from "./ContentInbox";

function eventsPage(overrides: Partial<ContentEventsPage["items"][number]> = {}): ContentEventsPage {
  return {
    items: [{
      id: 1,
      event_id: "evt-1",
      correlation_group_id: null,
      root_key: "plants",
      path: "content/plants/tomato/vi.md",
      owning_manifest_path: "content/plants/tomato/content.json",
      entity_kind: "plant",
      entity_key: "tomato",
      locale: "vi",
      event_type: "modified",
      old_sha256: "a".repeat(64),
      new_sha256: "b".repeat(64),
      detector_source: "startup_catchup",
      evidence_revision: 3,
      findings_json: "{}",
      review_state: "pending",
      reviewer_id: null,
      review_reason: null,
      reviewed_at: null,
      proposal_id: null,
      superseded_by_event_id: null,
      coalesced_count: 2,
      first_detected_at: "2026-08-25T09:00:00.000Z",
      last_detected_at: "2026-08-25T09:05:00.000Z",
      ...overrides,
    }],
    total: 1,
    limit: 50,
    offset: 0,
  };
}

const emptyInboxBase = {
  events: { items: [], total: 0, limit: 50, offset: 0 } as ContentEventsPage,
  total: 0,
  filters: defaultContentInboxFilters,
  setFilters: () => undefined,
  loading: false,
  error: "",
  mutationError: "",
  lastLoadedAt: null,
  selectedEventId: null as string | null,
  select: () => Promise.resolve(),
  preview: null,
  previewLoading: false,
  activeProposalId: null as string | null,
  reason: "",
  setReason: () => undefined,
  lastApplyOutcome: null,
  refresh: () => Promise.resolve(),
  approveSelected: () => Promise.resolve(null),
  dismissEventsByIds: () => Promise.resolve(null),
  applyActiveProposal: () => Promise.resolve(null),
};

describe("MCD-6 inbox contract helpers", () => {
  it("polls well inside the 30-second visibility SLA", () => {
    expect(CONTENT_INBOX_POLL_INTERVAL_MS).toBeGreaterThan(0);
    expect(CONTENT_INBOX_POLL_INTERVAL_MS).toBeLessThanOrEqual(30_000);
  });

  it("encodes filters into the persisted-state query path", () => {
    expect(buildEventsPath(defaultContentInboxFilters)).toBe(
      "/api/content-review/events?limit=50&offset=0&reviewState=pending",
    );
    expect(buildEventsPath({ ...defaultContentInboxFilters, reviewState: "", entityKind: "plant", offset: 25 }))
      .toBe("/api/content-review/events?limit=50&offset=25&entityKind=plant");
  });

  it("maps badges and detector labels deterministically", () => {
    expect(reviewStateBadgeClass("pending")).toBe("badge-pending");
    expect(reviewStateBadgeClass("applied")).toBe("badge-active");
    expect(reviewStateBadgeClass("superseded")).toBe("badge-superseded");
    expect(detectorLabel("watcher")).toBe("Live watcher");
    expect(detectorLabel("periodic_reconcile")).toBe("Reconcile");
    expect(monitorPhasePillClass("passive")).toContain("passive");
    expect(monitorPhasePillClass("degraded")).toContain("warn");
  });
});

it("shows the CAP draft note after a successful apply", () => {
    const inbox = {
        ...emptyInboxBase,
        events: eventsPage(),
        total: 1,
        lastApplyOutcome: { status: "applied" as const, proposalId: "prop-1", updatedLocales: 2, queuedOutbox: 0 },
    };
    const html = renderToStaticMarkup(
        React.createElement(ContentInbox, { inbox, status: null, isAdmin: true }),
    );
    expect(html).toContain("Imported 2 locale(s) as drafts in SQLite.");
    expect(html).toContain("Publish approved");
    expect(html).not.toContain("Apply rejected");
});

describe("MCD-6 Content Inbox rendering", () => {
  it("renders pending events with badges and action controls for admins", () => {
    const inbox = {
      ...emptyInboxBase,
      events: eventsPage(),
      total: 1,
      selectedEventId: "evt-1",
      activeProposalId: "prop-9",
      reason: "review reason",
    };
    const html = renderToStaticMarkup(
      React.createElement(ContentInbox, { inbox, status: null, isAdmin: true }),
    );
    expect(html).toContain("Content Inbox");
    expect(html).toContain("content/plants/tomato/vi.md");
    expect(html).toContain("badge-pending");
    expect(html).toContain("Startup catch-up");
    expect(html).toContain("×2");
    expect(html).toContain("Approve selected");
    expect(html).toContain("Apply approved batch");
    expect(html).toContain("prop-9");
    // Nothing disabled: selection + proposal exist.
    expect(html).not.toContain('disabled=""');
  });

  it("hides mutation ability from non-admin rendering via disabled buttons", () => {
    const inbox = {
      ...emptyInboxBase,
      events: eventsPage(),
      total: 1,
      selectedEventId: "evt-1",
    };
    const html = renderToStaticMarkup(
      React.createElement(ContentInbox, { inbox, status: null, isAdmin: false }),
    );
    // All three mutation controls render but are disabled for non-admins.
    expect(html).toMatch(/<button class="btn" disabled/);
    expect(html).toMatch(/<button class="btn ghost" disabled/);
    expect(html).toMatch(/<button class="btn primary" disabled/);
  });

  it("shows the monitor strip degraded reasons, passive note, and quarantine rows", () => {
    const status: ContentMonitorStatusResponse = {
      health: {
        phase: "degraded",
        instanceId: "api-a",
        isLeaseOwner: true,
        watching: true,
        baselineSealed: { plants: true, "pests-diseases": true },
        lastCatchUp: { runId: "r1", at: "2026-08-25T09:00:00.000Z", complete: true, errors: [] },
        lastReconcile: { runId: "r2", at: "2026-08-25T09:10:00.000Z", complete: true, errors: [] },
        fullHashAudit: { lastCompleteAt: null, ageMs: null },
        coverage: { complete: false, unresolvedQuarantined: 1 },
        watcher: { overflowCount: 0, lastError: null },
        pendingEvents: 4,
        degradedReasons: ["FULL_HASH_AUDIT_STALE", "QUARANTINED_PATHS_PENDING"],
      },
      quarantined: [
        { path: "content/plants/locked/vi.md", reason: "FULL_HASH_UNREADABLE", retry_count: 2, next_retry_at: "2026-08-25T10:00:00.000Z" },
      ],
    };
    const inbox = { ...emptyInboxBase };
    const html = renderToStaticMarkup(
      React.createElement(ContentInbox, { inbox, status, isAdmin: true }),
    );
    expect(html).toContain("degraded");
    expect(html).toContain("FULL_HASH_AUDIT_STALE");
    expect(html).toContain("QUARANTINED_PATHS_PENDING");
    expect(html).toContain("never completed");
    expect(html).toContain("pending 4");

    const badgeHtml = renderToStaticMarkup(
      React.createElement(ContentSourceHealthBadge, { status }),
    );
    expect(badgeHtml).toContain("data-health-content-source");
    expect(badgeHtml).toContain("degraded");
  });

  it("labels a passive instance explicitly instead of pretending readiness", () => {
    const status: ContentMonitorStatusResponse = {
      health: {
        phase: "passive",
        instanceId: "api-b",
        isLeaseOwner: false,
        watching: false,
        baselineSealed: { plants: true, "pests-diseases": true },
        lastCatchUp: null,
        lastReconcile: null,
        fullHashAudit: { lastCompleteAt: "2026-08-25T08:00:00.000Z", ageMs: 3_600_000 },
        coverage: { complete: true, unresolvedQuarantined: 0 },
        watcher: { overflowCount: 0, lastError: null },
        pendingEvents: 0,
        degradedReasons: [],
      },
      quarantined: [],
    };
    const html = renderToStaticMarkup(
      React.createElement(ContentInbox, { inbox: { ...emptyInboxBase }, status, isAdmin: true }),
    );
    expect(html).toContain("passive");
    expect(html).toContain("Passive instance — another API process owns the watch lease.");
  });
});
