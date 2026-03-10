import type { useGroups } from "../hooks/useGroups";

type GroupHook = ReturnType<typeof useGroups>;

export function GroupManager({
    g,
    onToast,
}: {
    g: GroupHook;
    onToast: (type: "success" | "error", msg: string) => void;
}) {
    async function handleSave() {
        const msg = await g.save();
        if (msg) onToast("success", msg);
    }

    async function handleDelete() {
        const msg = await g.remove();
        if (msg) onToast("success", msg);
    }

    return (
        <div className="page-content">
            <div className="page-header">
                <div>
                    <h2 className="page-title">Plant Groups</h2>
                    <p className="page-desc">
                        Organize plants into categories with multilingual names
                    </p>
                </div>
                <div className="actions">
                    <button
                        className="btn secondary"
                        onClick={() => void g.load()}
                        disabled={g.loading}
                    >
                        ↻ Refresh
                    </button>
                    <button className="btn primary" onClick={g.startCreate}>
                        + New Group
                    </button>
                </div>
            </div>

            {g.error && <p className="error-message">{g.error}</p>}

            <div className="layout">
                <section className="card">
                    <div className="section-title">
                        <h3>All Groups</h3>
                        <span className="muted">{g.filtered.length} results</span>
                    </div>
                    <div className="filters">
                        <input
                            className="search-input"
                            placeholder="🔍 Search group key, display name..."
                            value={g.search}
                            onChange={(e) => g.setSearch(e.target.value)}
                        />
                    </div>
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Key</th>
                                    <th>Display Name</th>
                                    <th>Order</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {g.filtered.map((group) => (
                                    <tr
                                        key={group._id}
                                        className={group._id === g.selectedId ? "selected" : ""}
                                        onClick={() => g.select(group)}
                                    >
                                        <td>
                                            <div className="row-title">{group.key}</div>
                                            <div className="row-sub">{group.iconUrl || "No icon"}</div>
                                        </td>
                                        <td>
                                            <div className="row-title">
                                                🇻🇳 {group.displayName?.vi ?? "—"}
                                            </div>
                                            <div className="row-sub">
                                                🇬🇧 {group.displayName?.en ?? "—"}
                                            </div>
                                        </td>
                                        <td>{group.sortOrder}</td>
                                        <td>
                                            <button
                                                className="btn ghost"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    g.startEdit(group);
                                                }}
                                            >
                                                Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {g.filtered.length === 0 && (
                            <p className="empty">No groups found.</p>
                        )}
                    </div>
                </section>

                <section className="card">
                    <div className="section-title">
                        <h3>
                            {g.mode === "create"
                                ? "Create Group"
                                : g.mode === "edit"
                                    ? "Edit Group"
                                    : "Group Details"}
                        </h3>
                        {g.mode === "view" && g.selected && (
                            <div className="actions">
                                <button
                                    className="btn secondary"
                                    onClick={() => g.startEdit(g.selected!)}
                                >
                                    Edit
                                </button>
                                <button
                                    className="btn danger"
                                    onClick={() => void handleDelete()}
                                    disabled={g.saving}
                                >
                                    Delete
                                </button>
                            </div>
                        )}
                    </div>

                    {g.mode === "view" ? (
                        g.selected ? (
                            <div className="detail">
                                <div>
                                    <h3>{g.selected.key}</h3>
                                    <p className="muted">Order: {g.selected.sortOrder}</p>
                                    <p className="muted">
                                        Icon: {g.selected.iconUrl ?? "—"}
                                    </p>
                                </div>
                                <div className="i18n-grid">
                                    <div className="i18n-lang-card">
                                        <div className="i18n-lang-header">
                                            <span className="i18n-flag">🇻🇳</span>
                                            <span className="i18n-lang-name">Vietnamese</span>
                                        </div>
                                        <p className="i18n-common-name">
                                            {g.selected.displayName?.vi ?? "—"}
                                        </p>
                                        <p className="i18n-desc">
                                            {g.selected.description?.vi ?? "No description"}
                                        </p>
                                    </div>
                                    <div className="i18n-lang-card">
                                        <div className="i18n-lang-header">
                                            <span className="i18n-flag">🇬🇧</span>
                                            <span className="i18n-lang-name">English</span>
                                        </div>
                                        <p className="i18n-common-name">
                                            {g.selected.displayName?.en ?? "—"}
                                        </p>
                                        <p className="i18n-desc">
                                            {g.selected.description?.en ?? "No description"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="empty">Select a group to see details.</p>
                        )
                    ) : (
                        <div className="form">
                            <div className="grid-2">
                                <label>
                                    Key *
                                    <input
                                        value={g.form.key}
                                        onChange={(e) =>
                                            g.setForm({ ...g.form, key: e.target.value })
                                        }
                                    />
                                </label>
                                <label>
                                    Sort order
                                    <input
                                        value={g.form.sortOrder}
                                        onChange={(e) =>
                                            g.setForm({ ...g.form, sortOrder: e.target.value })
                                        }
                                    />
                                </label>
                            </div>
                            <div className="grid-2">
                                <label>
                                    Display name (VI) *
                                    <input
                                        value={g.form.displayNameVi}
                                        onChange={(e) =>
                                            g.setForm({
                                                ...g.form,
                                                displayNameVi: e.target.value,
                                            })
                                        }
                                    />
                                </label>
                                <label>
                                    Display name (EN) *
                                    <input
                                        value={g.form.displayNameEn}
                                        onChange={(e) =>
                                            g.setForm({
                                                ...g.form,
                                                displayNameEn: e.target.value,
                                            })
                                        }
                                    />
                                </label>
                            </div>
                            <div className="grid-2">
                                <label>
                                    Description (VI)
                                    <textarea
                                        rows={3}
                                        value={g.form.descriptionVi}
                                        onChange={(e) =>
                                            g.setForm({
                                                ...g.form,
                                                descriptionVi: e.target.value,
                                            })
                                        }
                                    />
                                </label>
                                <label>
                                    Description (EN)
                                    <textarea
                                        rows={3}
                                        value={g.form.descriptionEn}
                                        onChange={(e) =>
                                            g.setForm({
                                                ...g.form,
                                                descriptionEn: e.target.value,
                                            })
                                        }
                                    />
                                </label>
                            </div>
                            <label>
                                Icon URL
                                <input
                                    value={g.form.iconUrl}
                                    onChange={(e) =>
                                        g.setForm({ ...g.form, iconUrl: e.target.value })
                                    }
                                />
                            </label>
                            <div className="form-actions">
                                <button
                                    className="btn secondary"
                                    onClick={g.cancel}
                                    type="button"
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn primary"
                                    onClick={() => void handleSave()}
                                    disabled={g.saving}
                                    type="button"
                                >
                                    {g.saving
                                        ? "Saving..."
                                        : g.mode === "create"
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
