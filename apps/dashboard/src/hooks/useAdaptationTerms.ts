import { useState, useMemo, useCallback } from "react";
import type { AdaptationTerm } from "../types";
import { convexAdminMutation, convexAdminQuery, type AuthedFetch } from "../constants";

export type AdaptationTermFormState = {
    code: string;
    dimension: string;
    sortOrder: string;
    labelVi: string;
    descriptionVi: string;
    labelEn: string;
    descriptionEn: string;
};

export const emptyAdaptationTermForm: AdaptationTermFormState = {
    code: "",
    dimension: "temperature",
    sortOrder: "0",
    labelVi: "",
    descriptionVi: "",
    labelEn: "",
    descriptionEn: "",
};

export function useAdaptationTerms(authedFetch: AuthedFetch) {
    const [terms, setTerms] = useState<AdaptationTerm[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mode, setMode] = useState<"view" | "edit" | "create">("view");
    const [form, setForm] = useState<AdaptationTermFormState>(emptyAdaptationTermForm);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await convexAdminQuery<AdaptationTerm[]>(
                authedFetch,
                "plantAdmin:listAdaptationTerms",
            );
            setTerms(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot load adaptation terms");
        } finally {
            setLoading(false);
        }
    }, [authedFetch]);

    const selected = useMemo(
        () => terms.find((term) => term._id === selectedId) ?? null,
        [terms, selectedId],
    );

    const groupedByDimension = useMemo(() => {
        const order = ["temperature", "moisture", "climate", "season"];
        const groups: Array<{ dimension: string; terms: AdaptationTerm[] }> = [];
        for (const dimension of order) {
            const dimensionTerms = terms.filter((term) => term.dimension === dimension);
            if (dimensionTerms.length === 0) continue;
            groups.push({ dimension, terms: dimensionTerms });
        }
        return groups;
    }, [terms]);

    function toFormState(term: AdaptationTerm): AdaptationTermFormState {
        const vi = term.translations.find((translation) => translation.locale === "vi");
        const en = term.translations.find((translation) => translation.locale === "en");
        return {
            code: term.code,
            dimension: term.dimension,
            sortOrder: String(term.sortOrder ?? 0),
            labelVi: vi?.label ?? "",
            descriptionVi: vi?.description ?? "",
            labelEn: en?.label ?? "",
            descriptionEn: en?.description ?? "",
        };
    }

    function select(term: AdaptationTerm) {
        setSelectedId(term._id);
        if (mode !== "create") setMode("view");
    }

    function startCreate() {
        setMode("create");
        setForm(emptyAdaptationTermForm);
        setSelectedId(null);
        setError("");
    }

    function startEdit(term: AdaptationTerm) {
        setMode("edit");
        setForm(toFormState(term));
        setSelectedId(term._id);
        setError("");
    }

    function cancel() {
        if (selected) {
            setForm(toFormState(selected));
        } else {
            setForm(emptyAdaptationTermForm);
        }
        setMode("view");
    }

    async function save(): Promise<string | null> {
        if (saving) return null;
        if (!form.labelVi.trim() || !form.labelEn.trim()) {
            setError("Both VI and EN labels are required before a term can be active.");
            return null;
        }

        setSaving(true);
        setError("");
        try {
            if (mode === "create") {
                const sortOrder = Number(form.sortOrder);
                if (!Number.isFinite(sortOrder)) {
                    setError("Sort order must be a number.");
                    return null;
                }
                await convexAdminMutation<{ termId: string }>(
                    authedFetch,
                    "plantAdmin:createAdaptationTerm",
                    {
                        code: form.code.trim(),
                        dimension: form.dimension,
                        sortOrder,
                        labelVi: form.labelVi.trim(),
                        labelEn: form.labelEn.trim(),
                        descriptionVi: form.descriptionVi.trim() || undefined,
                        descriptionEn: form.descriptionEn.trim() || undefined,
                    },
                );
                await load();
                setMode("view");
                return "Adaptation term created";
            }
            if (mode === "edit" && selected) {
                await convexAdminMutation<void>(
                    authedFetch,
                    "plantAdmin:updateAdaptationTerm",
                    {
                        termId: selected._id,
                        labelVi: form.labelVi.trim(),
                        labelEn: form.labelEn.trim(),
                        descriptionVi: form.descriptionVi.trim() || undefined,
                        descriptionEn: form.descriptionEn.trim() || undefined,
                    },
                );
                await load();
                setMode("view");
                return "Adaptation term updated";
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot save adaptation term");
        } finally {
            setSaving(false);
        }
        return null;
    }

    async function toggleArchive(term: AdaptationTerm): Promise<string | null> {
        if (saving) return null;
        const goingArchived = term.status !== "archived";
        if (goingArchived && term.usageCount > 0) {
            if (!confirm(
                `Archive term "${term.code}"? ${term.usageCount} plant(s) currently use it; ` +
                "existing assignments are preserved and displayed as archived, but no new assignments are allowed.",
            )) {
                return null;
            }
        }
        setSaving(true);
        setError("");
        try {
            await convexAdminMutation<void>(authedFetch, "plantAdmin:archiveAdaptationTerm", {
                termId: term._id,
                archived: goingArchived,
            });
            await load();
            return goingArchived ? "Adaptation term archived" : "Adaptation term restored";
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot update term status");
            return null;
        } finally {
            setSaving(false);
        }
    }

    async function reorder(dimension: string, termIds: string[]): Promise<string | null> {
        if (saving || termIds.length === 0) return null;
        setSaving(true);
        setError("");
        try {
            await convexAdminMutation<void>(authedFetch, "plantAdmin:reorderAdaptationTerms", {
                dimension,
                termIds,
            });
            await load();
            return "Term order updated";
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot reorder terms");
            return null;
        } finally {
            setSaving(false);
        }
    }

    /** Re-hydrate the SQLite mirror from Convex (admin-only route). */
    async function refreshMirror(): Promise<string | null> {
        if (refreshing) return null;
        setRefreshing(true);
        setError("");
        try {
            const response = await authedFetch("/api/adaptation-terms/refresh", {
                method: "POST",
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body.error ?? "Cannot refresh taxonomy mirror");
            }
            return "Taxonomy mirror refreshed";
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot refresh taxonomy mirror");
            return null;
        } finally {
            setRefreshing(false);
        }
    }

    return {
        terms,
        loading,
        saving,
        refreshing,
        error,
        setError,
        selected,
        selectedId,
        mode,
        form,
        setForm,
        groupedByDimension,
        load,
        select,
        startCreate,
        startEdit,
        cancel,
        save,
        toggleArchive,
        reorder,
        refreshMirror,
    };
}
