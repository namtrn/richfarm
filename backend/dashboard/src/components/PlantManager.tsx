import type { usePlants } from "../hooks/usePlants";
import type { useI18n } from "../hooks/useI18n";
import { getDisplayName, getLocaleRow } from "../constants";

type PlantHook = ReturnType<typeof usePlants>;
type I18nHook = ReturnType<typeof useI18n>;

export function PlantManager({
    p,
    i18n,
    onToast,
}: {
    p: PlantHook;
    i18n: I18nHook;
    onToast: (type: "success" | "error", msg: string) => void;
}) {
    function renderI18nBadge(
        rows: { locale: string; commonName: string }[],
        locale: "vi" | "en",
    ) {
        const row = rows.find((r) => r.locale === locale);
        const ok = Boolean(row?.commonName);
        return <span className={`badge ${ok ? "ok" : "warn"}`}>{locale.toUpperCase()}</span>;
    }

    async function handleSave() {
        const msg = await p.save();
        if (msg) onToast("success", msg);
    }

    async function handleDelete() {
        const msg = await p.remove();
        if (msg) onToast("success", msg);
    }

    return (
        <div className="page-content">
            {/* Page header */}
            <div className="page-header">
                <div>
                    <h2 className="page-title">Plants Master</h2>
                    <p className="page-desc">
                        Manage plant database, translations, and metadata
                    </p>
                </div>
                <div className="actions">
                    <button
                        className="btn secondary"
                        onClick={() => void p.load()}
                        disabled={p.loading}
                    >
                        ↻ Refresh
                    </button>
                    <button className="btn primary" onClick={p.startCreate}>
                        + New Plant
                    </button>
                </div>
            </div>

            {p.error && <p className="error-message">{p.error}</p>}

            <div className="layout">
                {/* Left: table */}
                <section className="card">
                    <div className="section-title">
                        <h3>All Plants</h3>
                        <span className="muted">{p.filtered.length} results</span>
                    </div>

                    <div className="filters">
                        <input
                            className="search-input"
                            placeholder="🔍 Search by name, scientific, group, purpose..."
                            value={p.search}
                            onChange={(e) => p.setSearch(e.target.value)}
                        />
                        <select
                            className="filter-select"
                            value={p.groupFilter}
                            onChange={(e) => p.setGroupFilter(e.target.value)}
                        >
                            <option value="all">All groups</option>
                            {p.groupOptions.map((g) => (
                                <option key={g} value={g}>
                                    {g}
                                </option>
                            ))}
                        </select>
                        <label className="checkbox">
                            <input
                                type="checkbox"
                                checked={p.filterMissingI18n}
                                onChange={(e) => p.setFilterMissingI18n(e.target.checked)}
                            />
                            Missing i18n
                        </label>
                        <label className="checkbox">
                            <input
                                type="checkbox"
                                checked={p.filterNoImage}
                                onChange={(e) => p.setFilterNoImage(e.target.checked)}
                            />
                            Missing image
                        </label>
                    </div>

                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Group</th>
                                    <th>I18n</th>
                                    <th>Image</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {p.filtered.map((plant) => (
                                    <tr
                                        key={plant._id}
                                        className={plant._id === p.selectedId ? "selected" : ""}
                                        onClick={() => p.select(plant)}
                                    >
                                        <td>
                                            <div className="row-title">{getDisplayName(plant)}</div>
                                            <div className="row-sub">{plant.scientificName}</div>
                                        </td>
                                        <td>
                                            <span className="pill">{plant.group}</span>
                                        </td>
                                        <td className="badge-group">
                                            {renderI18nBadge(plant.i18nRows, "vi")}
                                            {renderI18nBadge(plant.i18nRows, "en")}
                                        </td>
                                        <td>
                                            {plant.imageUrl ? (
                                                <span className="badge ok">✓</span>
                                            ) : (
                                                <span className="badge warn">✕</span>
                                            )}
                                        </td>
                                        <td>
                                            <button
                                                className="btn ghost"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    p.startEdit(plant);
                                                }}
                                            >
                                                Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {p.filtered.length === 0 && (
                            <p className="empty">No plants found for current filters.</p>
                        )}
                    </div>
                </section>

                {/* Right: detail / form */}
                <section className="card">
                    <div className="section-title">
                        <h3>
                            {p.mode === "create"
                                ? "Create Plant"
                                : p.mode === "edit"
                                    ? "Edit Plant"
                                    : "Plant Details"}
                        </h3>
                        {p.mode === "view" && p.selected && (
                            <div className="actions">
                                <button
                                    className="btn secondary"
                                    onClick={() => p.startEdit(p.selected!)}
                                >
                                    Edit
                                </button>
                                <button
                                    className="btn danger"
                                    onClick={() => void handleDelete()}
                                    disabled={p.saving}
                                >
                                    Delete
                                </button>
                            </div>
                        )}
                    </div>

                    {p.mode === "view" ? (
                        p.selected ? (
                            <div className="detail">
                                {/* Header */}
                                <div className="detail-header">
                                    <div>
                                        <h3>{getDisplayName(p.selected)}</h3>
                                        <p className="muted">{p.selected.scientificName}</p>
                                        <div className="badge-group" style={{ marginTop: 8 }}>
                                            {renderI18nBadge(p.selected.i18nRows, "vi")}
                                            {renderI18nBadge(p.selected.i18nRows, "en")}
                                            <span
                                                className={`badge ${p.selected.imageUrl ? "ok" : "warn"}`}
                                            >
                                                Image
                                            </span>
                                        </div>
                                    </div>
                                    {p.selected.imageUrl ? (
                                        <img
                                            src={p.selected.imageUrl}
                                            alt="plant"
                                            className="thumb"
                                        />
                                    ) : (
                                        <div className="thumb placeholder">No image</div>
                                    )}
                                </div>

                                {/* Overview + Growth */}
                                <div className="detail-grid">
                                    <div>
                                        <h4>Overview</h4>
                                        <p className="muted">Group: {p.selected.group}</p>
                                        <p>{p.selected.description || "No description"}</p>
                                        <p className="muted">
                                            Purposes:{" "}
                                            {(p.selected.purposes ?? []).length > 0
                                                ? p.selected.purposes?.join(", ")
                                                : "—"}
                                        </p>
                                        <p className="muted">
                                            Source: {p.selected.source ?? "—"}
                                        </p>
                                    </div>
                                    <div>
                                        <h4>Growth Data</h4>
                                        <ul className="meta-list">
                                            <li>
                                                Days to harvest:{" "}
                                                {p.selected.typicalDaysToHarvest ?? "—"}
                                            </li>
                                            <li>
                                                Watering (days):{" "}
                                                {p.selected.wateringFrequencyDays ?? "—"}
                                            </li>
                                            <li>
                                                Light: {p.selected.lightRequirements ?? "—"}
                                            </li>
                                            <li>
                                                Germination: {p.selected.germinationDays ?? "—"}
                                            </li>
                                            <li>
                                                Spacing (cm): {p.selected.spacingCm ?? "—"}
                                            </li>
                                            <li>
                                                Max plants/m²: {p.selected.maxPlantsPerM2 ?? "—"}
                                            </li>
                                            <li>
                                                Seed rate/m²: {p.selected.seedRatePerM2 ?? "—"}
                                            </li>
                                            <li>
                                                Water liters/m²: {p.selected.waterLitersPerM2 ?? "—"}
                                            </li>
                                            <li>
                                                Yield kg/m²: {p.selected.yieldKgPerM2 ?? "—"}
                                            </li>
                                        </ul>
                                    </div>
                                </div>

                                {/* Inline i18n */}
                                <div className="i18n-inline">
                                    <div className="i18n-inline-header">
                                        <h4>🌐 Translations</h4>
                                    </div>
                                    <div className="i18n-grid">
                                        <div className="i18n-lang-card">
                                            <div className="i18n-lang-header">
                                                <span className="i18n-flag">🇻🇳</span>
                                                <span className="i18n-lang-name">Vietnamese</span>
                                                {getLocaleRow(p.selected.i18nRows, "vi") ? (
                                                    <span className="badge ok small">Complete</span>
                                                ) : (
                                                    <span className="badge warn small">Missing</span>
                                                )}
                                            </div>
                                            <p className="i18n-common-name">
                                                {getLocaleRow(p.selected.i18nRows, "vi")?.commonName ??
                                                    "—"}
                                            </p>
                                            <p className="i18n-desc">
                                                {getLocaleRow(p.selected.i18nRows, "vi")?.description ??
                                                    "No description"}
                                            </p>
                                        </div>
                                        <div className="i18n-lang-card">
                                            <div className="i18n-lang-header">
                                                <span className="i18n-flag">🇬🇧</span>
                                                <span className="i18n-lang-name">English</span>
                                                {getLocaleRow(p.selected.i18nRows, "en") ? (
                                                    <span className="badge ok small">Complete</span>
                                                ) : (
                                                    <span className="badge warn small">Missing</span>
                                                )}
                                            </div>
                                            <p className="i18n-common-name">
                                                {getLocaleRow(p.selected.i18nRows, "en")?.commonName ??
                                                    "—"}
                                            </p>
                                            <p className="i18n-desc">
                                                {getLocaleRow(p.selected.i18nRows, "en")?.description ??
                                                    "No description"}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="empty">Select a plant to see details.</p>
                        )
                    ) : (
                        /* Create / Edit form */
                        <div className="form">
                            <div className="grid-2">
                                <label>
                                    Vietnamese common name *
                                    <input
                                        value={p.form.viCommonName}
                                        onChange={(e) =>
                                            p.setForm({ ...p.form, viCommonName: e.target.value })
                                        }
                                    />
                                </label>
                                <label>
                                    English common name *
                                    <input
                                        value={p.form.enCommonName}
                                        onChange={(e) =>
                                            p.setForm({ ...p.form, enCommonName: e.target.value })
                                        }
                                    />
                                </label>
                            </div>
                            <div className="grid-2">
                                <label>
                                    Vietnamese description
                                    <textarea
                                        rows={3}
                                        value={p.form.viDescription}
                                        onChange={(e) =>
                                            p.setForm({ ...p.form, viDescription: e.target.value })
                                        }
                                    />
                                </label>
                                <label>
                                    English description
                                    <textarea
                                        rows={3}
                                        value={p.form.enDescription}
                                        onChange={(e) =>
                                            p.setForm({ ...p.form, enDescription: e.target.value })
                                        }
                                    />
                                </label>
                            </div>
                            <div className="grid-2">
                                <label>
                                    Scientific name *
                                    <input
                                        value={p.form.scientificName}
                                        onChange={(e) =>
                                            p.setForm({
                                                ...p.form,
                                                scientificName: e.target.value,
                                            })
                                        }
                                    />
                                </label>
                                <label>
                                    Group
                                    <input
                                        value={p.form.group}
                                        onChange={(e) =>
                                            p.setForm({ ...p.form, group: e.target.value })
                                        }
                                    />
                                </label>
                            </div>
                            <label>
                                Description
                                <textarea
                                    rows={3}
                                    value={p.form.description}
                                    onChange={(e) =>
                                        p.setForm({ ...p.form, description: e.target.value })
                                    }
                                />
                            </label>
                            <label>
                                Purposes (comma separated)
                                <input
                                    value={p.form.purposes}
                                    onChange={(e) =>
                                        p.setForm({ ...p.form, purposes: e.target.value })
                                    }
                                />
                            </label>
                            <label>
                                Image URL
                                <input
                                    value={p.form.imageUrl}
                                    onChange={(e) =>
                                        p.setForm({ ...p.form, imageUrl: e.target.value })
                                    }
                                />
                            </label>

                            <div className="form-actions">
                                <button
                                    className="btn secondary"
                                    onClick={p.cancel}
                                    type="button"
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn primary"
                                    onClick={() => void handleSave()}
                                    disabled={p.saving}
                                    type="button"
                                >
                                    {p.saving
                                        ? "Saving..."
                                        : p.mode === "create"
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
