import type { usePhotos } from "../hooks/usePhotos";

type PhotoHook = ReturnType<typeof usePhotos>;

export function PhotoManager({
    ph,
    onToast,
}: {
    ph: PhotoHook;
    onToast: (type: "success" | "error", msg: string) => void;
}) {
    async function handleSave() {
        const msg = await ph.save();
        if (msg) onToast("success", msg);
    }

    async function handleDelete() {
        const msg = await ph.remove();
        if (msg) onToast("success", msg);
    }

    return (
        <div className="page-content">
            <div className="page-header">
                <div>
                    <h2 className="page-title">Plant Photos</h2>
                    <p className="page-desc">
                        Manage user-submitted plant photos and AI analysis
                    </p>
                </div>
                <div className="actions">
                    <button
                        className="btn secondary"
                        onClick={() => void ph.load()}
                        disabled={ph.loading}
                    >
                        ↻ Refresh
                    </button>
                    <button className="btn primary" onClick={ph.startCreate}>
                        + New Photo
                    </button>
                </div>
            </div>

            {ph.error && <p className="error-message">{ph.error}</p>}

            <div className="layout">
                <section className="card">
                    <div className="section-title">
                        <h3>All Photos</h3>
                        <span className="muted">{ph.filtered.length} results</span>
                    </div>
                    <div className="filters">
                        <input
                            className="search-input"
                            placeholder="🔍 Search plant id, user id, status..."
                            value={ph.search}
                            onChange={(e) => ph.setSearch(e.target.value)}
                        />
                    </div>
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Photo</th>
                                    <th>User Plant</th>
                                    <th>Status</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {ph.filtered.map((photo) => (
                                    <tr
                                        key={photo._id}
                                        className={
                                            photo._id === ph.selectedId ? "selected" : ""
                                        }
                                        onClick={() => ph.select(photo)}
                                    >
                                        <td>
                                            <div className="row-title" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {photo.photoUrl}
                                            </div>
                                            <div className="row-sub">
                                                {new Date(photo.takenAt).toLocaleString()}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="row-title" style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {photo.userPlantId}
                                            </div>
                                            <div className="row-sub" style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {photo.userId}
                                            </div>
                                        </td>
                                        <td>
                                            <span
                                                className={`badge ${photo.analysisStatus === "completed" ? "ok" : "warn"}`}
                                            >
                                                {photo.analysisStatus}
                                            </span>
                                        </td>
                                        <td>
                                            <button
                                                className="btn ghost"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    ph.startEdit(photo);
                                                }}
                                            >
                                                Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {ph.filtered.length === 0 && (
                            <p className="empty">No photos found.</p>
                        )}
                    </div>
                </section>

                <section className="card">
                    <div className="section-title">
                        <h3>
                            {ph.mode === "create"
                                ? "Create Photo"
                                : ph.mode === "edit"
                                    ? "Edit Photo"
                                    : "Photo Details"}
                        </h3>
                        {ph.mode === "view" && ph.selected && (
                            <div className="actions">
                                <button
                                    className="btn secondary"
                                    onClick={() => ph.startEdit(ph.selected!)}
                                >
                                    Edit
                                </button>
                                <button
                                    className="btn danger"
                                    onClick={() => void handleDelete()}
                                    disabled={ph.saving}
                                >
                                    Delete
                                </button>
                            </div>
                        )}
                    </div>

                    {ph.mode === "view" ? (
                        ph.selected ? (
                            <div className="detail">
                                {ph.selected.photoUrl && (
                                    <img
                                        src={ph.selected.photoUrl}
                                        alt="plant photo"
                                        className="photo-preview"
                                    />
                                )}
                                <div>
                                    <h3 style={{ wordBreak: "break-all" }}>{ph.selected.photoUrl}</h3>
                                    <p className="muted">
                                        User plant: {ph.selected.userPlantId}
                                    </p>
                                    <p className="muted">User: {ph.selected.userId}</p>
                                </div>
                                <div className="detail-grid">
                                    <div>
                                        <p>
                                            Status:{" "}
                                            <span
                                                className={`badge ${ph.selected.analysisStatus === "completed" ? "ok" : "warn"}`}
                                            >
                                                {ph.selected.analysisStatus}
                                            </span>
                                        </p>
                                        <p>Source: {ph.selected.source}</p>
                                        <p>Primary: {ph.selected.isPrimary ? "Yes" : "No"}</p>
                                    </div>
                                    <div>
                                        <p>
                                            Taken: {new Date(ph.selected.takenAt).toLocaleString()}
                                        </p>
                                        <p>
                                            Uploaded:{" "}
                                            {new Date(ph.selected.uploadedAt).toLocaleString()}
                                        </p>
                                        <p>Storage ID: {ph.selected.storageId ?? "—"}</p>
                                    </div>
                                </div>
                                <div>
                                    <h4>Analysis Result</h4>
                                    <pre className="code-block">
                                        {ph.selected.analysisResult
                                            ? JSON.stringify(ph.selected.analysisResult, null, 2)
                                            : "—"}
                                    </pre>
                                </div>
                            </div>
                        ) : (
                            <p className="empty">Select a photo to see details.</p>
                        )
                    ) : (
                        <div className="form">
                            <div className="grid-2">
                                <label>
                                    User plant id *
                                    <input
                                        value={ph.form.userPlantId}
                                        onChange={(e) =>
                                            ph.setForm({
                                                ...ph.form,
                                                userPlantId: e.target.value,
                                            })
                                        }
                                    />
                                </label>
                                <label>
                                    User id *
                                    <input
                                        value={ph.form.userId}
                                        onChange={(e) =>
                                            ph.setForm({ ...ph.form, userId: e.target.value })
                                        }
                                    />
                                </label>
                            </div>
                            <label>
                                Photo URL *
                                <input
                                    value={ph.form.photoUrl}
                                    onChange={(e) =>
                                        ph.setForm({ ...ph.form, photoUrl: e.target.value })
                                    }
                                />
                            </label>
                            <div className="grid-2">
                                <label>
                                    Taken at (ms)
                                    <input
                                        value={ph.form.takenAt}
                                        onChange={(e) =>
                                            ph.setForm({ ...ph.form, takenAt: e.target.value })
                                        }
                                    />
                                </label>
                                <label>
                                    Uploaded at (ms)
                                    <input
                                        value={ph.form.uploadedAt}
                                        onChange={(e) =>
                                            ph.setForm({
                                                ...ph.form,
                                                uploadedAt: e.target.value,
                                            })
                                        }
                                    />
                                </label>
                            </div>
                            <div className="grid-2">
                                <label>
                                    Source
                                    <input
                                        value={ph.form.source}
                                        onChange={(e) =>
                                            ph.setForm({ ...ph.form, source: e.target.value })
                                        }
                                    />
                                </label>
                                <label>
                                    Analysis status
                                    <input
                                        value={ph.form.analysisStatus}
                                        onChange={(e) =>
                                            ph.setForm({
                                                ...ph.form,
                                                analysisStatus: e.target.value,
                                            })
                                        }
                                    />
                                </label>
                            </div>
                            <div className="grid-2">
                                <label>
                                    Thumbnail URL
                                    <input
                                        value={ph.form.thumbnailUrl}
                                        onChange={(e) =>
                                            ph.setForm({
                                                ...ph.form,
                                                thumbnailUrl: e.target.value,
                                            })
                                        }
                                    />
                                </label>
                                <label>
                                    Storage ID
                                    <input
                                        value={ph.form.storageId}
                                        onChange={(e) =>
                                            ph.setForm({
                                                ...ph.form,
                                                storageId: e.target.value,
                                            })
                                        }
                                    />
                                </label>
                            </div>
                            <label>
                                Analysis result (JSON)
                                <textarea
                                    rows={4}
                                    value={ph.form.analysisResult}
                                    onChange={(e) =>
                                        ph.setForm({
                                            ...ph.form,
                                            analysisResult: e.target.value,
                                        })
                                    }
                                />
                            </label>
                            <label className="checkbox">
                                <input
                                    type="checkbox"
                                    checked={ph.form.isPrimary}
                                    onChange={(e) =>
                                        ph.setForm({
                                            ...ph.form,
                                            isPrimary: e.target.checked,
                                        })
                                    }
                                />
                                Primary photo
                            </label>
                            <label>
                                AI model version
                                <input
                                    value={ph.form.aiModelVersion}
                                    onChange={(e) =>
                                        ph.setForm({
                                            ...ph.form,
                                            aiModelVersion: e.target.value,
                                        })
                                    }
                                />
                            </label>
                            <label>
                                Local ID
                                <input
                                    value={ph.form.localId}
                                    onChange={(e) =>
                                        ph.setForm({ ...ph.form, localId: e.target.value })
                                    }
                                />
                            </label>

                            <div className="form-actions">
                                <button
                                    className="btn secondary"
                                    onClick={ph.cancel}
                                    type="button"
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn primary"
                                    onClick={() => void handleSave()}
                                    disabled={ph.saving}
                                    type="button"
                                >
                                    {ph.saving
                                        ? "Saving..."
                                        : ph.mode === "create"
                                            ? "Create"
                                            : "Save"}
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
