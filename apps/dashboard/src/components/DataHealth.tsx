import { useState } from "react";
import type { useDataHealth } from "../hooks/useDataHealth";
import {
  dataHealthAlertClass,
  dataHealthStatusLabel,
  formatEvidence,
  identityDisplay,
} from "../dataHealth";

type DataHealthHook = ReturnType<typeof useDataHealth>;

function compactDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function actionReason(
  values: Record<string, string>,
  setValues: (value: Record<string, string>) => void,
  key: string,
  value: string,
): void {
  setValues({ ...values, [key]: value });
}

function StatusBadge({ value }: { value: string }) {
  const tone = value === "blocked" || value === "stale" || value === "incomplete"
    ? "health-badge health-badge-danger"
    : value === "warning" || value === "failed"
      ? "health-badge health-badge-warning"
      : value === "healthy" || value === "fresh" || value === "resolved" || value === "applied"
        ? "health-badge health-badge-ok"
        : "health-badge";
  return <span className={tone}>{value}</span>;
}

export function DataHealth({ health, isAdmin }: { health: DataHealthHook; isAdmin: boolean }) {
  const [findingReasons, setFindingReasons] = useState<Record<string, string>>({});
  const [outboxReasons, setOutboxReasons] = useState<Record<string, string>>({});
  const [outboxExpiries, setOutboxExpiries] = useState<Record<string, string>>({});
  const [proposalReasons, setProposalReasons] = useState<Record<string, string>>({});

  const state = health.state;
  const canResolve = Boolean(state?.controls.canResolve && isAdmin);
  const canDismiss = Boolean(state?.controls.canDismiss && isAdmin);
  const canOutbox = Boolean(isAdmin && (state?.controls.canRequeue || state?.controls.canOverride));
  const canApprove = Boolean(state?.controls.canApproveProposal && isAdmin);

  if (!state && health.loading) {
    return <div className="page-content"><div className="card health-empty">Loading Data Health…</div></div>;
  }
  if (!state && health.error) {
    return (
      <div className="page-content">
        <div className="page-header">
          <div><h2 className="page-title">Data Health</h2><p className="page-desc">Reconciliation evidence and outbox safety.</p></div>
          <button className="btn secondary" type="button" onClick={() => void health.refresh()}>Retry</button>
        </div>
        <div className="card health-alert health-alert-danger" role="alert">{health.error}</div>
      </div>
    );
  }
  if (!state) return null;

  const freshness = state.freshness;
  const status = state.health.status;
  const reasonFor = (value: string): string => value.trim();

  const resolve = async (findingId: number) => {
    const reason = reasonFor(findingReasons[String(findingId)] ?? "");
    if (!reason) return;
    if (await health.resolveFinding(findingId, reason)) {
      setFindingReasons((current) => ({ ...current, [String(findingId)]: "" }));
    }
  };
  const dismiss = async (findingId: number) => {
    const reason = reasonFor(findingReasons[String(findingId)] ?? "");
    if (!reason) return;
    if (await health.dismissFinding(findingId, reason)) {
      setFindingReasons((current) => ({ ...current, [String(findingId)]: "" }));
    }
  };
  const requeue = async (outboxId: number) => {
    const reason = reasonFor(outboxReasons[String(outboxId)] ?? "");
    if (!reason) return;
    if (await health.requeueOutbox(outboxId, reason)) {
      setOutboxReasons((current) => ({ ...current, [String(outboxId)]: "" }));
    }
  };
  const override = async (outboxId: number) => {
    const key = String(outboxId);
    const reason = reasonFor(outboxReasons[key] ?? "");
    const expiryInput = outboxExpiries[key] ?? "";
    if (!reason || !expiryInput) return;
    const expiry = new Date(expiryInput).toISOString();
    if (await health.overrideOutbox(outboxId, reason, expiry)) {
      setOutboxReasons((current) => ({ ...current, [key]: "" }));
      setOutboxExpiries((current) => ({ ...current, [key]: "" }));
    }
  };
  const approve = async (proposalId: string) => {
    const reason = reasonFor(proposalReasons[proposalId] ?? "");
    if (!reason) return;
    if (await health.approveProposal(proposalId, reason)) {
      setProposalReasons((current) => ({ ...current, [proposalId]: "" }));
    }
  };

  const countCards = [
    { label: "Healthy", value: state.health.counts.healthy, icon: "✓", tone: "health-ok" },
    { label: "Warnings", value: state.health.counts.warning, icon: "!", tone: "health-warning" },
    { label: "Blocked", value: state.health.counts.blocked, icon: "×", tone: "health-blocked" },
    { label: "Info", value: state.health.counts.info, icon: "i", tone: "health-info" },
  ];

  return (
    <div className="page-content data-health-page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Data Health</h2>
          <p className="page-desc">Read-only reconciliation evidence, identity findings, and outbox safety.</p>
        </div>
        <div className="actions">
          {!isAdmin && <span className="health-readonly">Editor read-only</span>}
          <button className="btn secondary" type="button" disabled={health.loading} onClick={() => void health.refresh()}>
            {health.loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className={`health-alert ${dataHealthAlertClass(freshness.state, status)}`} role="status">
        <div>
          <strong>{dataHealthStatusLabel(status)}</strong>
          <span className="health-alert-copy">
            {freshness.state === "fresh"
              ? ` Snapshot ${freshness.snapshotRevision ?? "—"} matches SQLite catalog revision ${freshness.sqliteCatalogRevision}.`
              : freshness.reason ?? "No complete, fresh reconciliation evidence is available."}
          </span>
        </div>
        <div className="health-alert-meta">
          {freshness.receivedCount ?? "—"}/{freshness.expectedCount ?? "—"} rows · watermark {freshness.sqliteOutboxWatermark}
        </div>
      </div>

      <div className="health-count-grid">
        {countCards.map((card) => (
          <div className="health-count-card" key={card.label}>
            <span className={`health-count-icon ${card.tone}`}>{card.icon}</span>
            <div><strong>{card.value}</strong><span>{card.label}</span></div>
          </div>
        ))}
      </div>

      <div className="health-grid">
        <section className="card">
          <div className="section-title"><h3>Last reconciliation</h3><StatusBadge value={freshness.state} /></div>
          {freshness.lastRun ? (
            <dl className="health-definition-list">
              <div><dt>Run</dt><dd>{freshness.lastRun.runId ?? "—"}</dd></div>
              <div><dt>Status</dt><dd><StatusBadge value={freshness.lastRun.status} /></dd></div>
              <div><dt>Started</dt><dd>{compactDate(freshness.lastRun.startedAt)}</dd></div>
              <div><dt>Finished</dt><dd>{compactDate(freshness.lastRun.finishedAt)}</dd></div>
              <div><dt>Findings</dt><dd>{freshness.lastRun.findingCount}</dd></div>
            </dl>
          ) : <p className="muted">No persisted reconciliation run yet. Run an audit before treating this database as healthy.</p>}
        </section>
        <section className="card">
          <div className="section-title"><h3>Freshness boundary</h3><span className="muted">local read</span></div>
          <dl className="health-definition-list">
            <div><dt>Snapshot revision</dt><dd>{freshness.snapshotRevision ?? "—"}</dd></div>
            <div><dt>SQLite catalog</dt><dd>{freshness.sqliteCatalogRevision}</dd></div>
            <div><dt>Snapshot complete</dt><dd>{freshness.snapshotComplete ? "yes" : "no"}</dd></div>
            <div><dt>Active findings</dt><dd>{state.health.activeFindingCount}</dd></div>
            <div><dt>Affected identities</dt><dd>{state.health.affectedIdentityCount}</dd></div>
          </dl>
        </section>
      </div>

      {health.error && <div className="health-alert health-alert-danger" role="alert">{health.error}</div>}
      {health.mutationError && <div className="health-alert health-alert-danger" role="alert">{health.mutationError}</div>}

      <section className="card">
        <div className="section-title"><h3>Findings</h3><span className="muted">{state.findings.length} shown · {state.health.activeFindingCount} active</span></div>
        <div className="filters health-filters">
          <label>Severity
            <select value={health.filters.findingSeverity} onChange={(event) => health.setFilters((current) => ({ ...current, findingSeverity: event.target.value as typeof current.findingSeverity }))}>
              <option value="all">All severities</option><option value="blocked">Blocked</option><option value="warning">Warning</option><option value="info">Info</option>
            </select>
          </label>
          <label>Status
            <select value={health.filters.findingStatus} onChange={(event) => health.setFilters((current) => ({ ...current, findingStatus: event.target.value as typeof current.findingStatus }))}>
              <option value="all">All statuses</option><option value="open">Open</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option>
            </select>
          </label>
          <label className="health-search">Search
            <input value={health.filters.findingSearch} onChange={(event) => health.setFilters((current) => ({ ...current, findingSearch: event.target.value }))} placeholder="code, key, category, evidence" />
          </label>
        </div>
        {state.findings.length === 0 ? <p className="muted">No findings match the current filters.</p> : (
          <div className="health-list">
            {state.findings.map((finding) => {
              const key = String(finding.id);
              return (
                <article className="health-item" key={`${finding.id}-${finding.fingerprint}`}>
                  <div className="health-item-header">
                    <div><StatusBadge value={finding.severity} /> <strong>{finding.code}</strong><span className="health-item-category">{finding.category}</span></div>
                    <StatusBadge value={finding.resolutionStatus} />
                  </div>
                  <div className="health-item-meta">{finding.canonicalKey ?? "No canonical key"} · seen {compactDate(finding.lastSeenAt)} · {finding.occurrenceCount} occurrence(s)</div>
                  {finding.sqliteIdentities.length > 0 && <div className="health-identities"><strong>SQLite:</strong> {finding.sqliteIdentities.map(identityDisplay).join(", ")}</div>}
                  {finding.convexIdentities.length > 0 && <div className="health-identities"><strong>Convex:</strong> {finding.convexIdentities.map(identityDisplay).join(", ")}</div>}
                  <details><summary>Evidence</summary><pre className="health-evidence">{formatEvidence(finding.evidence)}</pre></details>
                  {(canResolve || canDismiss) && finding.resolutionStatus === "open" && (
                    <div className="health-action-row">
                      <input value={findingReasons[key] ?? ""} onChange={(event) => actionReason(findingReasons, setFindingReasons, key, event.target.value)} placeholder="Resolution or dismissal reason" aria-label={`Finding reason ${finding.id}`} />
                      {canResolve && <button className="btn secondary" type="button" disabled={!findingReasons[key]?.trim()} onClick={() => void resolve(finding.id)}>Resolve</button>}
                      {canDismiss && <button className="btn danger" type="button" disabled={!findingReasons[key]?.trim()} onClick={() => void dismiss(finding.id)}>Dismiss</button>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="health-grid">
        <section className="card">
          <div className="section-title"><h3>Affected identities</h3><span className="muted">{state.affectedIdentities.length}</span></div>
          {state.affectedIdentities.length === 0 ? <p className="muted">No active affected identities.</p> : (
            <div className="health-identity-list">
              {state.affectedIdentities.map((identity) => (
                <div className="health-identity-item" key={identity.key}>
                  <strong>{identity.canonicalKey ?? identity.key}</strong>
                  <span>{identity.identities.map(identityDisplay).join(", ") || "No row identity"}</span>
                  <small>{identity.findingIds.length} finding(s) · {identity.severities.join(", ")}</small>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card">
          <div className="section-title"><h3>Outbox</h3><span className="muted">pending work stays local until explicitly published</span></div>
          <div className="outbox-counts">{Object.entries(state.outbox.counts).map(([name, count]) => <span key={name}><strong>{count}</strong> {name}</span>)}</div>
          {state.outbox.items.length === 0 ? <p className="muted">No outbox rows returned.</p> : (
            <div className="health-list">
              {state.outbox.items.map((item) => {
                const key = String(item.id);
                return (
                  <article className="health-item" key={item.id}>
                    <div className="health-item-header"><div><strong>#{item.id}</strong> {item.operation} <span className="health-item-category">{item.sourceSystem}:{item.sourceId}{item.locale ? ` · ${item.locale}` : ""}</span></div><StatusBadge value={item.status} /></div>
                    {item.blockedReason && <div className="health-item-meta">{item.blockedReason} · finding {item.blockedFindingId ?? "—"}</div>}
                    {item.supersededBy && <div className="health-item-meta">Superseded by #{item.supersededBy}; stale payload will not publish.</div>}
                    {canOutbox && item.status === "blocked" && (
                      <div className="health-action-stack">
                        <input value={outboxReasons[key] ?? ""} onChange={(event) => actionReason(outboxReasons, setOutboxReasons, key, event.target.value)} placeholder="Admin reason" aria-label={`Outbox reason ${item.id}`} />
                        <label>Override expiry<input type="datetime-local" value={outboxExpiries[key] ?? ""} onChange={(event) => actionReason(outboxExpiries, setOutboxExpiries, key, event.target.value)} aria-label={`Override expiry ${item.id}`} /></label>
                        <div className="actions"><button className="btn secondary" type="button" disabled={!outboxReasons[key]?.trim()} onClick={() => void requeue(item.id)}>Requeue after resolve</button><button className="btn danger" type="button" disabled={!outboxReasons[key]?.trim() || !outboxExpiries[key]} onClick={() => void override(item.id)}>Temporary override</button></div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <div className="section-title"><h3>Repair proposals</h3><span className="muted">approval never applies a proposal</span></div>
        {state.proposals.length === 0 ? <p className="muted">No repair proposals.</p> : (
          <div className="health-list">
            {state.proposals.map((proposal) => (
              <article className="health-item" key={proposal.proposalId}>
                <div className="health-item-header"><div><strong>{proposal.proposalId}</strong> · {proposal.action}</div><StatusBadge value={proposal.status} /></div>
                <div className="health-item-meta">Created by {proposal.createdBy} · run {proposal.runId} · {compactDate(proposal.createdAt)}</div>
                <details><summary>Proposal evidence</summary><pre className="health-evidence">{formatEvidence(proposal.evidence)}</pre></details>
                {canApprove && proposal.status === "proposed" && (
                  <div className="health-action-row"><input value={proposalReasons[proposal.proposalId] ?? ""} onChange={(event) => actionReason(proposalReasons, setProposalReasons, proposal.proposalId, event.target.value)} placeholder="Approval reason" aria-label={`Approval reason ${proposal.proposalId}`} /><button className="btn secondary" type="button" disabled={!proposalReasons[proposal.proposalId]?.trim()} onClick={() => void approve(proposal.proposalId)}>Approve proposal</button></div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
