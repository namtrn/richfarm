import { useState, useMemo, useCallback } from "react";
import type { PlantPhoto, PhotoFormState, Mode } from "../types";
import { convexAdminMutation, convexAdminQuery, emptyPhotoForm, type AuthedFetch } from "../constants";

function toFormState(photo: PlantPhoto): PhotoFormState {
    return {
        userPlantId: photo.userPlantId,
        userId: photo.userId,
        localId: photo.localId ?? "",
        photoUrl: photo.photoUrl ?? "",
        thumbnailUrl: photo.thumbnailUrl ?? "",
        storageId: photo.storageId ?? "",
        takenAt: String(photo.takenAt ?? ""),
        uploadedAt: String(photo.uploadedAt ?? ""),
        isPrimary: photo.isPrimary,
        source: photo.source ?? "camera",
        analysisStatus: photo.analysisStatus ?? "pending",
        analysisResult: photo.analysisResult ? JSON.stringify(photo.analysisResult) : "",
        aiModelVersion: photo.aiModelVersion ?? "",
    };
}

export function usePhotos(authedFetch: AuthedFetch) {
    const [photos, setPhotos] = useState<PlantPhoto[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>("view");
    const [form, setForm] = useState<PhotoFormState>(emptyPhotoForm);
    const [search, setSearch] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await convexAdminQuery<PlantPhoto[]>(authedFetch, "plantAdmin:listPlantPhotos");
            setPhotos(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot load plant photos");
        } finally {
            setLoading(false);
        }
    }, [authedFetch]);

    const selected = useMemo(
        () => photos.find((p) => p._id === selectedId) ?? null,
        [photos, selectedId],
    );

    const filtered = useMemo(() => {
        const normalized = search.trim().toLowerCase();
        let result = photos.slice();
        if (normalized) {
            result = result.filter((photo) => {
                const haystack = [
                    photo.userPlantId,
                    photo.userId,
                    photo.photoUrl,
                    photo.source,
                    photo.analysisStatus,
                ]
                    .join(" ")
                    .toLowerCase();
                return haystack.includes(normalized);
            });
        }
        return result.sort((a, b) => b.takenAt - a.takenAt);
    }, [photos, search]);

    function select(photo: PlantPhoto) {
        setSelectedId(photo._id);
        if (mode !== "create") setMode("view");
    }

    function startCreate() {
        setMode("create");
        setForm({
            ...emptyPhotoForm,
            takenAt: String(Date.now()),
            uploadedAt: String(Date.now()),
        });
        setSelectedId(null);
        setError("");
    }

    function startEdit(photo: PlantPhoto) {
        setMode("edit");
        setForm(toFormState(photo));
        setSelectedId(photo._id);
        setError("");
    }

    function cancel() {
        if (selected) {
            setForm(toFormState(selected));
        } else {
            setForm(emptyPhotoForm);
        }
        setMode("view");
    }

    async function save(): Promise<string | null> {
        if (saving) return null;

        if (!form.userPlantId.trim()) {
            setError("User plant ID is required.");
            return null;
        }
        if (!form.userId.trim()) {
            setError("User ID is required.");
            return null;
        }
        if (!form.photoUrl.trim()) {
            setError("Photo URL is required.");
            return null;
        }

        setSaving(true);
        setError("");
        try {
            const payload: any = {
                userPlantId: form.userPlantId.trim(),
                userId: form.userId.trim(),
                localId: form.localId.trim() || undefined,
                photoUrl: form.photoUrl.trim(),
                thumbnailUrl: form.thumbnailUrl.trim() || undefined,
                storageId: form.storageId.trim() || undefined,
                takenAt: Number(form.takenAt) || Date.now(),
                uploadedAt: Number(form.uploadedAt) || Date.now(),
                isPrimary: form.isPrimary,
                source: form.source.trim() || "camera",
                analysisStatus: form.analysisStatus.trim() || "pending",
                aiModelVersion: form.aiModelVersion.trim() || undefined,
            };

            if (form.analysisResult.trim()) {
                try {
                    payload.analysisResult = JSON.parse(form.analysisResult);
                } catch {
                    setError("Analysis result must be valid JSON.");
                    setSaving(false);
                    return null;
                }
            }

            if (mode === "create") {
                const result = await convexAdminMutation<{ photoId: string }>(
                    authedFetch,
                    "plantAdmin:createPlantPhoto",
                    payload,
                );
                await load();
                setSelectedId(result.photoId);
                setMode("view");
                return "Photo created successfully";
            } else if (mode === "edit" && selected) {
                await convexAdminMutation<void>(authedFetch, "plantAdmin:updatePlantPhoto", {
                    photoId: selected._id,
                    ...payload,
                });
                await load();
                setMode("view");
                return "Photo updated successfully";
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot save photo");
        } finally {
            setSaving(false);
        }
        return null;
    }

    async function remove(): Promise<string | null> {
        if (!selected || saving) return null;
        if (!confirm("Delete this photo? This cannot be undone.")) return null;

        setSaving(true);
        setError("");
        try {
            await convexAdminMutation<void>(authedFetch, "plantAdmin:deletePlantPhoto", {
                photoId: selected._id,
            });
            setSelectedId(null);
            await load();
            return "Photo deleted";
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cannot delete photo");
        } finally {
            setSaving(false);
        }
        return null;
    }

    return {
        photos,
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
