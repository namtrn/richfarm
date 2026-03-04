import { useState, useMemo, useCallback } from "react";
import type { PlantGroup, GroupFormState, Mode } from "../types";
import { convex, convexReady, emptyGroupForm } from "../constants";

export function useGroups() {
    const [groups, setGroups] = useState<PlantGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>("view");
    const [form, setForm] = useState<GroupFormState>(emptyGroupForm);
    const [search, setSearch] = useState("");

    const load = useCallback(async () => {
        if (!convexReady) return;
        setLoading(true);
        setError("");
        try {
            const data = (await convex.query(
                "plantAdmin:listPlantGroups" as any,
                {},
            )) as PlantGroup[];
            setGroups(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot load plant groups");
        } finally {
            setLoading(false);
        }
    }, []);

    const selected = useMemo(
        () => groups.find((g) => g._id === selectedId) ?? null,
        [groups, selectedId],
    );

    const filtered = useMemo(() => {
        const normalized = search.trim().toLowerCase();
        let result = groups.slice();
        if (normalized) {
            result = result.filter((g) => {
                const haystack = [
                    g.key,
                    g.displayName?.vi ?? "",
                    g.displayName?.en ?? "",
                    g.description?.vi ?? "",
                    g.description?.en ?? "",
                ]
                    .join(" ")
                    .toLowerCase();
                return haystack.includes(normalized);
            });
        }
        return result.sort((a, b) => a.sortOrder - b.sortOrder);
    }, [groups, search]);

    function toFormState(group: PlantGroup): GroupFormState {
        return {
            key: group.key,
            displayNameVi: group.displayName?.vi ?? "",
            displayNameEn: group.displayName?.en ?? "",
            descriptionVi: group.description?.vi ?? "",
            descriptionEn: group.description?.en ?? "",
            iconUrl: group.iconUrl ?? "",
            sortOrder: String(group.sortOrder ?? 0),
        };
    }

    function select(group: PlantGroup) {
        setSelectedId(group._id);
        if (mode !== "create") setMode("view");
    }

    function startCreate() {
        setMode("create");
        setForm(emptyGroupForm);
        setSelectedId(null);
        setError("");
    }

    function startEdit(group: PlantGroup) {
        setMode("edit");
        setForm(toFormState(group));
        setSelectedId(group._id);
        setError("");
    }

    function cancel() {
        if (selected) {
            setForm(toFormState(selected));
        } else {
            setForm(emptyGroupForm);
        }
        setMode("view");
    }

    async function save(): Promise<string | null> {
        if (saving) return null;

        const sortOrder = Number(form.sortOrder);
        if (!form.key.trim()) {
            setError("Group key is required.");
            return null;
        }
        if (!form.displayNameVi.trim() || !form.displayNameEn.trim()) {
            setError("Both VI and EN display names are required.");
            return null;
        }
        if (!Number.isFinite(sortOrder)) {
            setError("Sort order must be a number.");
            return null;
        }

        setSaving(true);
        setError("");
        try {
            const payload = {
                key: form.key.trim(),
                displayNameVi: form.displayNameVi.trim(),
                displayNameEn: form.displayNameEn.trim(),
                descriptionVi: form.descriptionVi.trim() || undefined,
                descriptionEn: form.descriptionEn.trim() || undefined,
                iconUrl: form.iconUrl.trim() || undefined,
                sortOrder,
            };

            if (mode === "create") {
                const result = (await convex.mutation(
                    "plantAdmin:createPlantGroup" as any,
                    payload,
                )) as { groupId: string };
                await load();
                setSelectedId(result.groupId);
                setMode("view");
                return "Group created successfully";
            } else if (mode === "edit" && selected) {
                await convex.mutation("plantAdmin:updatePlantGroup" as any, {
                    groupId: selected._id,
                    ...payload,
                });
                await load();
                setMode("view");
                return "Group updated successfully";
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot save group");
        } finally {
            setSaving(false);
        }
        return null;
    }

    async function remove(): Promise<string | null> {
        if (!selected || saving) return null;
        if (!confirm(`Delete group "${selected.key}"? This cannot be undone.`)) return null;

        setSaving(true);
        setError("");
        try {
            await convex.mutation("plantAdmin:deletePlantGroup" as any, {
                groupId: selected._id,
            });
            setSelectedId(null);
            await load();
            return "Group deleted";
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot delete group");
        } finally {
            setSaving(false);
        }
        return null;
    }

    return {
        groups,
        loading,
        saving,
        error,
        setError,
        selected,
        selectedId,
        mode,
        form,
        setForm,
        search,
        setSearch,
        filtered,
        load,
        select,
        startCreate,
        startEdit,
        cancel,
        save,
        remove,
    };
}
