import { useCallback, useEffect, useState } from "react";
import type { AuthedFetch } from "../constants";
import {
  defaultDataHealthFilters,
  type DataHealthFilters,
  type DataHealthState,
} from "../dataHealth";

type StateResponse = { ok: true; state: DataHealthState };

export function dataHealthStatusPath(filters: DataHealthFilters): string {
  const params = new URLSearchParams({
    finding_severity: filters.findingSeverity,
    finding_status: filters.findingStatus,
    finding_search: filters.findingSearch.trim(),
    finding_limit: "500",
    outbox_limit: "200",
    proposal_limit: "100",
  });
  return `/api/sync-reconciliation/status?${params.toString()}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
  if (!response.ok) throw new Error(body.error ?? body.message ?? "Data Health request failed");
  return body as T;
}

export function useDataHealth(authedFetch: AuthedFetch, enabled: boolean) {
  const [state, setState] = useState<DataHealthState | null>(null);
  const [filters, setFilters] = useState<DataHealthFilters>(defaultDataHealthFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mutationError, setMutationError] = useState("");

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const response = await authedFetch(dataHealthStatusPath(filters));
      const body = await parseResponse<StateResponse>(response);
      setState(body.state);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Data Health");
    } finally {
      setLoading(false);
    }
  }, [authedFetch, enabled, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(async (path: string, body: Record<string, unknown>) => {
    setMutationError("");
    try {
      const response = await authedFetch(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await parseResponse(response);
      await load();
      return true;
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : "Data Health action failed");
      return false;
    }
  }, [authedFetch, load]);

  const resolveFinding = useCallback((findingId: number, reason: string) => (
    post(`/api/sync-reconciliation/findings/${findingId}/resolve`, { reason })
  ), [post]);
  const dismissFinding = useCallback((findingId: number, reason: string) => (
    post(`/api/sync-reconciliation/findings/${findingId}/dismiss`, { reason })
  ), [post]);
  const requeueOutbox = useCallback((outboxId: number, reason: string) => (
    post(`/api/sync-reconciliation/outbox/${outboxId}/requeue`, { reason })
  ), [post]);
  const overrideOutbox = useCallback((outboxId: number, reason: string, expiresAt: string) => (
    post(`/api/sync-reconciliation/outbox/${outboxId}/override`, { reason, expires_at: expiresAt })
  ), [post]);
  const approveProposal = useCallback((proposalId: string, reason: string) => (
    post(`/api/sync-reconciliation/proposals/${encodeURIComponent(proposalId)}/approve`, { reason })
  ), [post]);

  return {
    state,
    filters,
    setFilters,
    loading,
    error,
    mutationError,
    refresh: load,
    resolveFinding,
    dismissFinding,
    requeueOutbox,
    overrideOutbox,
    approveProposal,
  };
}
