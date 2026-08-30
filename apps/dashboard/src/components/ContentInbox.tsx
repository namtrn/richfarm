import type { ContentEventPreview, ContentMonitorStatusResponse } from "../contentReview";
import {
  detectorLabel,
  monitorPhasePillClass,
  reviewStateBadgeClass,
} from "../contentReview";
import type { useContentInbox, useContentMonitorStatus } from "../hooks/useContentInbox";

type Inbox = ReturnType<typeof useContentInbox>;
type Status = ReturnType<typeof useContentMonitorStatus>;

function MonitorStrip({ status }: { status: Status }) {
  if (!status || !status.health) {
    return (
      <section className="card content-monitor-strip" data-testid="monitor-strip">
        <span className="pill muted">monitor unavailable</span>
        <span className="muted-text">Content source monitor status has not loaded yet.</span>
      </section>
    );
  }
  const health = status.health;
  const auditAgeHours =
    health.fullHashAudit.ageMs === null ? null : Math.floor(health.fullHashAudit.ageMs / 3_600_000);
  return (
    <section className="card content-monitor-strip" data-testid="monitor-strip">
      <span className={monitorPhasePillClass(health.phase)} data-testid="monitor-phase">
        {health.phase}
      </span>
      {!health.watching && health.phase === "passive" && (
        <span className="muted-text">Passive instance — another API process owns the watch lease.</span>
      )}
      {health.degradedReasons.map((reason) => (
        <span key={reason} className="pill warn">{reason}</span>
      ))}
      <span className="muted-text">
        pending {health.pendingEvents} · audit{" "}
        {health.fullHashAudit.lastCompleteAt
          ? `${auditAgeHours ?? "?"}h ago`
          : "never completed"}{" "}
        · quarantined {health.coverage.unresolvedQuarantined}
      </span>
    </section>
  );
}

function PreviewPanel({ preview, loading }: { preview: ContentEventPreview | null; loading: boolean }) {
  if (loading) return <aside className="card inbox-preview"><p>Loading preview…</p></aside>;
  if (!preview) {
    return (
      <aside className="card inbox-preview">
        <p className="muted-text">Select an event to preview incoming content.</p>
      </aside>
    );
  }
  const findingKeys = Object.keys(preview.findings ?? {});
  return (
    <aside className="card inbox-preview" data-testid="inbox-preview">
      <h3>{preview.path}</h3>
      <dl className="preview-meta">
        <dt>entity</dt><dd>{preview.entityKind}{preview.entityKey ? ` · ${preview.entityKey}` : ""}</dd>
        <dt>locale</dt><dd>{preview.locale ?? "—"}</dd>
        <dt>detector</dt><dd>{detectorLabel(preview.detectorSource)}</dd>
        <dt>manifest</dt><dd>{preview.owningManifestPath ?? "none"}</dd>
        {preview.manifestIdentity && (
          <dt>identity</dt>
        )}
      </dl>
      {preview.manifestIdentity && (
        <pre className="identity-json">{JSON.stringify(preview.manifestIdentity)}</pre>
      )}
      {findingKeys.length > 0 && (
        <ul className="preview-findings">
          {findingKeys.map((key) => (
            <li key={key}><span className="pill warn">{key}</span></li>
          ))}
        </ul>
      )}
      <h4>incoming (Git)</h4>
      <pre className="diff-box">{preview.incomingExcerpt ?? "(file missing on disk)"}</pre>
      <h4>staged in SQLite{preview.stagedLocaleExists ? "" : " (no row yet)"}</h4>
      <pre className="diff-box">{preview.stagedBefore ?? "(empty)"}</pre>
    </aside>
  );
}

export function ContentInbox({
  inbox,
  status,
  isAdmin,
}: {
  inbox: Inbox;
  status: Status;
  isAdmin: boolean;
}) {

  return (
    <div className="page content-inbox-page">
      <header className="page-header">
        <h2>Content Inbox</h2>
        <p className="muted-text">
          Git Markdown changes awaiting review. Approval applies through the
          manifest dry-run/apply pipeline; Convex publication stays separate.
        </p>
      </header>

      <MonitorStrip status={status} />

      <div className="card inbox-toolbar">
        <label>
          State{" "}
          <select
            value={inbox.filters.reviewState}
            onChange={(event) =>
              inbox.setFilters({ ...inbox.filters, reviewState: event.target.value as typeof inbox.filters.reviewState })
            }
          >
            <option value="">all</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="applied">applied</option>
            <option value="dismissed">dismissed</option>
            <option value="superseded">superseded</option>
          </select>
        </label>
        <label>
          Kind{" "}
          <select
            value={inbox.filters.entityKind}
            onChange={(event) =>
              inbox.setFilters({ ...inbox.filters, entityKind: event.target.value as typeof inbox.filters.entityKind })
            }
          >
            <option value="">all</option>
            <option value="plant">plant</option>
            <option value="pest_disease">pest/disease</option>
          </select>
        </label>
        <button className="btn ghost" onClick={() => void inbox.refresh()} type="button">Refresh</button>
        <input
          className="inbox-reason"
          placeholder="reason for actions"
          value={inbox.reason}
          onChange={(event) => inbox.setReason(event.target.value)}
        />
        <button
          className="btn"
          disabled={!isAdmin || !inbox.selectedEventId}
          onClick={() => {
            if (inbox.selectedEventId) void inbox.approveSelected([inbox.selectedEventId], inbox.reason || "approved from inbox");
          }}
          type="button"
        >
          Approve selected
        </button>
        <button
          className="btn ghost"
          disabled={!isAdmin || !inbox.selectedEventId}
          onClick={() => {
            if (inbox.selectedEventId) void inbox.dismissEventsByIds([inbox.selectedEventId], inbox.reason || "dismissed from inbox");
          }}
          type="button"
        >
          Dismiss selected
        </button>
        <button
          className="btn primary"
          disabled={!isAdmin || !inbox.activeProposalId}
          onClick={() => void inbox.applyActiveProposal(inbox.reason || "applied from inbox")}
          type="button"
        >
          Apply approved batch
        </button>
      </div>

      {(inbox.error || inbox.mutationError || inbox.lastApplyOutcome?.status === "rejected") && (
        <p className="error-text" role="alert">
          {inbox.error || inbox.mutationError ||
            `Apply rejected: ${inbox.lastApplyOutcome?.code ?? "unknown"}${inbox.lastApplyOutcome?.detail ? ` — ${inbox.lastApplyOutcome.detail}` : ""}`}
        </p>
      )}
      {inbox.activeProposalId && (
        <p className="muted-text" data-testid="active-proposal">
          Approved batch ready to apply: {inbox.activeProposalId}
        </p>
      )}

      <div className="inbox-grid">
        <table className="card inbox-list" data-testid="inbox-list">
          <thead>
            <tr><th>path</th><th>change</th><th>source</th><th>state</th><th>detected</th></tr>
          </thead>
          <tbody>
            {inbox.events.items.length === 0 && (
              <tr><td colSpan={5}>No events match this filter.</td></tr>
            )}
            {inbox.events.items.map((event) => (
              <tr
                key={event.event_id}
                className={event.event_id === inbox.selectedEventId ? "selected" : ""}
                onClick={() => void inbox.select(event.event_id)}
              >
                <td>{event.path}{event.locale ? ` (${event.locale})` : ""}</td>
                <td>{event.event_type}</td>
                <td>{detectorLabel(event.detector_source)}</td>
                <td>
                  <span className={reviewStateBadgeClass(event.review_state)}>{event.review_state}</span>
                  {event.coalesced_count > 1 && <span className="pill"> ×{event.coalesced_count}</span>}
                </td>
                <td>{new Date(event.first_detected_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <PreviewPanel preview={inbox.preview} loading={inbox.previewLoading} />
      </div>
    </div>
  );
}

export function ContentSourceHealthBadge({ status }: { status: Status }) {
  const health = status?.health ?? null;
  if (!health) return null;
  return (
    <section className="card content-monitor-strip" data-testid="data-health-content-source">
      <span className={monitorPhasePillClass(health.phase)}>{health.phase}</span>
      {health.degradedReasons.map((reason) => (
        <span key={reason} className="pill warn">{reason}</span>
      ))}
      <span className="muted-text">content source monitor</span>
    </section>
  );
}
