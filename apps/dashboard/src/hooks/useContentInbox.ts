import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthedFetch } from "../constants";
import {
  buildEventsPath,
  CONTENT_INBOX_POLL_INTERVAL_MS,
  CONTENT_MONITOR_STATUS_POLL_INTERVAL_MS,
  defaultContentInboxFilters,
  type ContentEventPreview,
  type ContentEventsPage,
  type ContentInboxFilters,
  type ContentMonitorStatusResponse,
} from "../contentReview";

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
  if (!response.ok) throw new Error(body.error ?? body.message ?? "Content review request failed");
  return body as T;
}

export function useContentInbox(authedFetch: AuthedFetch, enabled: boolean) {
  const [events, setEvents] = useState<ContentEventsPage>({ items: [], total: 0, limit: 50, offset: 0 });
  const [filters, setFilters] = useState<ContentInboxFilters>(defaultContentInboxFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ContentEventPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [lastApplyOutcome, setLastApplyOutcome] = useState<{ status: string; code?: string; detail?: string } | null>(null);

  const loadSequence = useRef(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const load = useCallback(async () => {
    if (!enabled) return;
    const sequence = loadSequence.current + 1;
    loadSequence.current = sequence;
    setLoading(true);
    setError("");
    try {
      const response = await authedFetch(buildEventsPath(filtersRef.current));
      const body = await parseResponse<ContentEventsPage>(response);
      // Stale-response protection: only the newest request may commit.
      if (loadSequence.current === sequence) {
        setEvents(body);
        setLastLoadedAt(new Date().toISOString());
      }
    } catch (caught) {
      if (loadSequence.current === sequence) {
        setError(caught instanceof Error ? caught.message : "Unable to load content events");
      }
    } finally {
      if (loadSequence.current === sequence) setLoading(false);
    }
  }, [authedFetch, enabled]);

  useEffect(() => {
    void load();
  }, [load, filters]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => void load(), CONTENT_INBOX_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, load]);

  const select = useCallback(async (eventId: string | null) => {
    setSelectedEventId(eventId);
    setPreview(null);
    if (!eventId) return;
    setPreviewLoading(true);
    try {
      const response = await authedFetch(
        `/api/content-review/events/${encodeURIComponent(eventId)}/preview`,
      );
      const body = await parseResponse<ContentEventPreview>(response);
      setPreview(body);
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : "Unable to load preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [authedFetch]);

  const post = useCallback(async (path: string, body: Record<string, unknown>) => {
    setMutationError("");
    try {
      const response = await authedFetch(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const parsed = await parseResponse<Record<string, unknown>>(response);
      await load();
      return parsed;
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : "Content review action failed");
      return null;
    }
  }, [authedFetch, load]);

  const approveSelected = useCallback(async (eventIds: readonly string[], reason: string) => {
    if (eventIds.length === 0) return null;
    const result = await post("/api/content-review/approve", { eventIds: [...eventIds], reason });
    const proposalId = typeof result?.proposalId === "string" ? result.proposalId : null;
    setActiveProposalId(proposalId);
    return result;
  }, [post]);

  const dismissEventsByIds = useCallback(async (eventIds: readonly string[], reason: string) => {
    if (eventIds.length === 0) return null;
    return post("/api/content-review/dismiss", { eventIds: [...eventIds], reason });
  }, [post]);

  const applyActiveProposal = useCallback(async (reason: string) => {
    if (!activeProposalId) return null;
    setLastApplyOutcome(null);
    const response = await authedFetch(
      `/api/content-review/proposals/${encodeURIComponent(activeProposalId)}/apply`,
      { method: "POST", body: JSON.stringify({ reason }) },
    );
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const outcome = {
      status: String(body.status ?? (response.ok ? "applied" : "rejected")),
      code: typeof body.code === "string" ? body.code : undefined,
      detail: typeof body.detail === "string" ? body.detail : undefined,
    };
    setLastApplyOutcome(outcome);
    if (outcome.status === "applied") {
      setActiveProposalId(null);
    }
    await load();
    return outcome;
  }, [activeProposalId, authedFetch, load]);

  return {
    events,
    total: events.total,
    filters,
    setFilters,
    loading,
    error,
    mutationError,
    lastLoadedAt,
    selectedEventId,
    select,
    preview,
    previewLoading,
    activeProposalId,
    reason,
    setReason,
    lastApplyOutcome,
    refresh: load,
    approveSelected,
    dismissEventsByIds,
    applyActiveProposal,
  };
}

export function useContentMonitorStatus(
  authedFetch: AuthedFetch,
  enabled: boolean,
): ContentMonitorStatusResponse | null {
  const [status, setStatus] = useState<ContentMonitorStatusResponse | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const loadOnce = async () => {
      const current = ++sequence.current;
      try {
        const response = await authedFetch("/api/content-review/monitor-status");
        const body = await parseResponse<ContentMonitorStatusResponse>(response);
        if (!cancelled && sequence.current === current) setStatus(body);
      } catch {
        // Transient polling errors surface via the strip's unavailable state.
      }
    };
    void loadOnce();
    const timer = setInterval(() => void loadOnce(), CONTENT_MONITOR_STATUS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [authedFetch, enabled]);

  return status;
}
