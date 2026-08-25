import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Sidebar } from "./Sidebar";
import { DataHealth } from "./DataHealth";
import { dataHealthAlertClass, defaultDataHealthFilters, type DataHealthState } from "../dataHealth";
import { dataHealthStatusPath, useDataHealth } from "../hooks/useDataHealth";

function state(overrides: Partial<DataHealthState> = {}): DataHealthState {
  return {
    generatedAt: "2026-08-25T00:00:00.000Z",
    freshness: {
      state: "incomplete",
      reason: "snapshot_incomplete",
      sqliteCatalogRevision: "7",
      sqliteOutboxWatermark: 12,
      snapshotRevision: "convex-6",
      expectedCount: 3,
      receivedCount: 2,
      snapshotComplete: false,
      lastRun: {
        runId: "cid7-test-run",
        source: "convex",
        mode: "audit",
        status: "incomplete",
        startedAt: "2026-08-25T00:00:00.000Z",
        finishedAt: "2026-08-25T00:01:00.000Z",
        error: null,
        snapshotComplete: false,
        findingCount: 1,
      },
    },
    health: {
      status: "incomplete",
      counts: { healthy: 2, warning: 1, blocked: 1, info: 0 },
      activeFindingCount: 2,
      affectedIdentityCount: 1,
    },
    findings: [{
      id: 5,
      fingerprint: "finding-5",
      runId: "cid7-test-run",
      severity: "blocked",
      code: "TEST_BLOCK",
      category: "identity",
      canonicalKey: "tomato-key",
      sqliteIdentities: [{ sourceSystem: "sqlite", sourceId: "tomato-1554" }],
      convexIdentities: [],
      evidence: { rowId: 1554 },
      resolutionStatus: "open",
      firstSeenAt: "2026-08-25T00:00:00.000Z",
      lastSeenAt: "2026-08-25T00:01:00.000Z",
      occurrenceCount: 1,
      resolvedAt: null,
      resolvedBy: null,
      resolutionReason: null,
      sqliteCatalogRevision: "7",
      sqliteDataRevision: "sqlite-7",
      outboxWatermark: 12,
      snapshotRevision: "convex-6",
    }],
    affectedIdentities: [{ key: "tomato-key", canonicalKey: "tomato-key", identities: [{ sourceSystem: "sqlite", sourceId: "tomato-1554" }], findingIds: [5], severities: ["blocked"] }],
    outbox: {
      counts: { pending: 1, processing: 0, applied: 0, failed: 0, blocked: 1, superseded: 1 },
      items: [{
        id: 12,
        dedupeKey: "upsert:tomato",
        entityType: "master_plant",
        sourceSystem: "sqlite",
        sourceId: "tomato-1554",
        operation: "upsert_i18n",
        locale: "en",
        status: "blocked",
        attemptCount: 0,
        nextAttemptAt: "2026-08-25T00:00:00.000Z",
        lastAttemptAt: null,
        lastError: null,
        blockedFindingId: 5,
        blockedAt: "2026-08-25T00:01:00.000Z",
        blockedBy: null,
        blockedReason: "blocked_by_finding:5",
        overrideId: null,
        overrideReason: null,
        overrideExpiresAt: null,
        supersededBy: null,
        supersededAt: null,
        createdAt: "2026-08-25T00:00:00.000Z",
        updatedAt: "2026-08-25T00:01:00.000Z",
        payload: { id: 1554 },
      }, ...(["processing", "failed", "applied"] as const).map((status, index) => ({
        id: 13 + index,
        dedupeKey: `upsert:tomato:${status}`,
        entityType: "master_plant",
        sourceSystem: "sqlite",
        sourceId: `tomato-${status}`,
        operation: "upsert_plant",
        locale: "en",
        status,
        attemptCount: 1,
        nextAttemptAt: "2026-08-25T00:00:00.000Z",
        lastAttemptAt: null,
        lastError: status === "failed" ? "temporary failure" : null,
        blockedFindingId: null,
        blockedAt: null,
        blockedBy: null,
        blockedReason: null,
        overrideId: null,
        overrideReason: null,
        overrideExpiresAt: null,
        supersededBy: null,
        supersededAt: null,
        createdAt: "2026-08-25T00:00:00.000Z",
        updatedAt: "2026-08-25T00:01:00.000Z",
        payload: { id: index },
      }))],
    },
    proposals: [{
      id: 3,
      proposalId: "proposal-3",
      runId: "cid7-test-run",
      action: "republish",
      status: "proposed",
      payload: { sourceId: "tomato-1554" },
      evidence: { findingId: 5 },
      sqliteCatalogRevision: "7",
      sqliteDataRevision: "sqlite-7",
      outboxWatermark: 12,
      snapshotRevision: "convex-6",
      createdBy: "editor@example.com",
      createdAt: "2026-08-25T00:00:00.000Z",
      approvedBy: null,
      approvedAt: null,
      approvalReason: null,
      appliedBy: null,
      appliedAt: null,
      rejectionReason: null,
      updatedAt: "2026-08-25T00:00:00.000Z",
    }],
    controls: { canResolve: true, canDismiss: true, canRequeue: true, canOverride: true, canCreateProposal: true, canApproveProposal: true },
    ...overrides,
  };
}

function fakeHealth(current: DataHealthState) {
  return {
    state: current,
    filters: defaultDataHealthFilters,
    setFilters: () => undefined,
    loading: false,
    error: "",
    mutationError: "",
    refresh: async () => undefined,
    resolveFinding: async () => true,
    dismissFinding: async () => true,
    requeueOutbox: async () => true,
    overrideOutbox: async () => true,
    approveProposal: async () => true,
  } as unknown as ReturnType<typeof useDataHealth>;
}

describe("dashboard Data Health", () => {
  it("builds a bounded read-only status request from finding filters", () => {
    const url = dataHealthStatusPath({ findingSeverity: "blocked", findingStatus: "open", findingSearch: " tomato " });
    expect(url).toContain("/api/sync-reconciliation/status?");
    expect(url).toContain("finding_severity=blocked");
    expect(url).toContain("finding_status=open");
    expect(url).toContain("finding_search=tomato");
    expect(url).toContain("finding_limit=500");
  });

  it("renders incomplete evidence, identities, outbox safety, and admin controls", () => {
    const html = renderToStaticMarkup(<DataHealth health={fakeHealth(state())} isAdmin />);
    expect(html).toContain("Incomplete snapshot");
    expect(html).toContain("tomato-key");
    expect(html).toContain("Requeue after resolve");
    expect(html).toContain("Temporary override");
    expect(html).toContain("Approve proposal");
    expect(html).toContain("Dismiss");
    expect(html).toContain("processing");
    expect(html).toContain("failed");
    expect(html).toContain("applied");
    expect(html).toContain("snapshot_incomplete");
  });

  it("combines freshness and health when choosing the alert tone", () => {
    expect(dataHealthAlertClass("fresh", "healthy")).toBe("health-alert-ok");
    expect(dataHealthAlertClass("fresh", "warning")).toBe("health-alert-warning");
    expect(dataHealthAlertClass("fresh", "blocked")).toBe("health-alert-danger");
    expect(dataHealthAlertClass("stale", "healthy")).toBe("health-alert-danger");
  });

  it("keeps editor rendering read-only", () => {
    const editorState = state({ controls: { canResolve: false, canDismiss: false, canRequeue: false, canOverride: false, canCreateProposal: false, canApproveProposal: false } });
    const html = renderToStaticMarkup(<DataHealth health={fakeHealth(editorState)} isAdmin={false} />);
    expect(html).toContain("Editor read-only");
    expect(html).not.toContain("Resolve</button>");
    expect(html).not.toContain("Dismiss</button>");
    expect(html).not.toContain("Temporary override");
    expect(html).not.toContain("Approve proposal");
  });

  it("exposes the Data Health navigation item", () => {
    const html = renderToStaticMarkup(<Sidebar activePage="data-health" onNavigate={() => undefined} email="editor@example.com" />);
    expect(html).toContain("Data Health");
    expect(html).toContain("active");
  });
});
