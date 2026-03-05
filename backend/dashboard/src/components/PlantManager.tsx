import type { usePlants } from "../hooks/usePlants";
import type { useI18n } from "../hooks/useI18n";
import { getDisplayName, getLocaleRow, computeScientificName, LIGHT_OPTIONS, DEFAULT_CULTIVAR_NORMALIZED } from "../constants";

type PlantHook = ReturnType<typeof usePlants>;
type I18nHook = ReturnType<typeof useI18n>;

function NumericInput({
    label,
    value,
    onChange,
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    return (
        <label>
            {label}
            <input
                type="number"
                min={0}
                step="any"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </label>
    );
}

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

    function isVariantRow(cultivarNormalized?: string) {
        return cultivarNormalized && cultivarNormalized !== DEFAULT_CULTIVAR_NORMALIZED;
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
                            placeholder="🔍 Search by name, genus, species, cultivar, group..."
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
                                    <th>Type</th>
                                    <th>Group</th>
                                    <th>I18n</th>
                                    <th>Image</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {p.filtered.map((plant) => {
                                    const variant = isVariantRow(plant.cultivarNormalized);
                                    return (
                                        <tr
                                            key={plant._id}
                                            className={plant._id === p.selectedId ? "selected" : ""}
                                            onClick={() => p.select(plant)}
                                        >
                                            <td>
                                                <div
                                                    className="row-title"
                                                    style={variant ? { paddingLeft: "1rem" } : undefined}
                                                >
                                                    {variant ? "· " : ""}{getDisplayName(plant)}
                                                </div>
                                                <div className="row-sub">
                                                    {plant.genus && plant.species
                                                        ? `${plant.genus} ${plant.species}${plant.cultivar ? ` '${plant.cultivar}'` : ""}`
                                                        : plant.scientificName}
                                                </div>
                                            </td>
                                            <td>
                                                {variant ? (
                                                    <span className="badge warn">VAR</span>
                                                ) : (
                                                    <span className="badge ok">BASE</span>
                                                )}
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
                                    );
                                })}
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
                                        <p className="muted">
                                            {p.selected.genus && p.selected.species
                                                ? `${p.selected.genus} ${p.selected.species}${p.selected.cultivar ? ` '${p.selected.cultivar}'` : ""}`
                                                : p.selected.scientificName}
                                        </p>
                                        {p.selected.genus && (
                                            <p className="muted" style={{ fontSize: "0.8rem" }}>
                                                Genus: {p.selected.genus} · Species: {p.selected.species}{" "}
                                                {p.selected.cultivar ? `· Cultivar: ${p.selected.cultivar}` : "· (base species)"}
                                            </p>
                                        )}
                                        <div className="badge-group" style={{ marginTop: 8 }}>
                                            {isVariantRow(p.selected.cultivarNormalized) ? (
                                                <span className="badge warn">VARIANT</span>
                                            ) : (
                                                <span className="badge ok">BASE</span>
                                            )}
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
                                            <li>Days to harvest: {p.selected.typicalDaysToHarvest ?? "—"}</li>
                                            <li>Watering (days): {p.selected.wateringFrequencyDays ?? "—"}</li>
                                            <li>Germination (days): {p.selected.germinationDays ?? "—"}</li>
                                            <li>Light: {p.selected.lightRequirements ?? "—"}</li>
                                            <li>Spacing (cm): {p.selected.spacingCm ?? "—"}</li>
                                            <li>Max plants/m²: {p.selected.maxPlantsPerM2 ?? "—"}</li>
                                            <li>Seed rate/m²: {p.selected.seedRatePerM2 ?? "—"}</li>
                                            <li>Water liters/m²: {p.selected.waterLitersPerM2 ?? "—"}</li>
                                            <li>Yield kg/m²: {p.selected.yieldKgPerM2 ?? "—"}</li>
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
                                                {getLocaleRow(p.selected.i18nRows, "vi")?.commonName ?? "—"}
                                            </p>
                                            <p className="i18n-desc">
                                                {getLocaleRow(p.selected.i18nRows, "vi")?.description ?? "No description"}
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
                                                {getLocaleRow(p.selected.i18nRows, "en")?.commonName ?? "—"}
                                            </p>
                                            <p className="i18n-desc">
                                                {getLocaleRow(p.selected.i18nRows, "en")?.description ?? "No description"}
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
                            {/* ── Section: Taxonomy ── */}
                            <div className="form-section">
                                <h4 className="form-section-title">🌿 Taxonomy</h4>
                                <div className="grid-3">
                                    <label>
                                        Genus *
                                        <input
                                            placeholder="e.g. Solanum"
                                            value={p.form.genus}
                                            onChange={(e) =>
                                                p.setForm({ ...p.form, genus: e.target.value })
                                            }
                                        />
                                    </label>
                                    <label>
                                        Species *
                                        <input
                                            placeholder="e.g. lycopersicum"
                                            value={p.form.species}
                                            onChange={(e) =>
                                                p.setForm({ ...p.form, species: e.target.value })
                                            }
                                        />
                                    </label>
                                    <label>
                                        Cultivar
                                        <input
                                            placeholder="e.g. Cherry — empty = base"
                                            value={p.form.cultivar}
                                            onChange={(e) =>
                                                p.setForm({ ...p.form, cultivar: e.target.value })
                                            }
                                        />
                                    </label>
                                </div>
                                {(p.form.genus || p.form.species) && (
                                    <p className="form-preview muted">
                                        Scientific name preview:{" "}
                                        <em>
                                            {computeScientificName(p.form.genus, p.form.species)}
                                            {p.form.cultivar.trim() ? ` '${p.form.cultivar.trim()}'` : " (base)"}
                                        </em>
                                    </p>
                                )}
                            </div>

                            {/* ── Section: I18n ── */}
                            <div className="form-section">
                                <h4 className="form-section-title">🌐 Translations</h4>
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
                            </div>

                            {/* ── Section: Classification ── */}
                            <div className="form-section">
                                <h4 className="form-section-title">📋 Classification</h4>
                                <div className="grid-2">
                                    <label>
                                        Group
                                        <input
                                            value={p.form.group}
                                            onChange={(e) =>
                                                p.setForm({ ...p.form, group: e.target.value })
                                            }
                                        />
                                    </label>
                                    <label>
                                        Purposes (comma separated)
                                        <input
                                            placeholder="e.g. vegetable, fruit"
                                            value={p.form.purposes}
                                            onChange={(e) =>
                                                p.setForm({ ...p.form, purposes: e.target.value })
                                            }
                                        />
                                    </label>
                                </div>
                                <label>
                                    Image URL
                                    <input
                                        value={p.form.imageUrl}
                                        onChange={(e) =>
                                            p.setForm({ ...p.form, imageUrl: e.target.value })
                                        }
                                    />
                                </label>
                                <label>
                                    Description
                                    <textarea
                                        rows={2}
                                        value={p.form.description}
                                        onChange={(e) =>
                                            p.setForm({ ...p.form, description: e.target.value })
                                        }
                                    />
                                </label>
                            </div>

                            {/* ── Section: Growing Data ── */}
                            <div className="form-section">
                                <h4 className="form-section-title">🌱 Growing Data</h4>
                                <div className="grid-3">
                                    <NumericInput
                                        label="Days to harvest"
                                        value={p.form.typicalDaysToHarvest}
                                        onChange={(v) => p.setForm({ ...p.form, typicalDaysToHarvest: v })}
                                        placeholder="e.g. 80"
                                    />
                                    <NumericInput
                                        label="Watering (days)"
                                        value={p.form.wateringFrequencyDays}
                                        onChange={(v) => p.setForm({ ...p.form, wateringFrequencyDays: v })}
                                        placeholder="e.g. 2"
                                    />
                                    <NumericInput
                                        label="Germination (days)"
                                        value={p.form.germinationDays}
                                        onChange={(v) => p.setForm({ ...p.form, germinationDays: v })}
                                        placeholder="e.g. 7"
                                    />
                                    <NumericInput
                                        label="Spacing (cm)"
                                        value={p.form.spacingCm}
                                        onChange={(v) => p.setForm({ ...p.form, spacingCm: v })}
                                        placeholder="e.g. 45"
                                    />
                                    <label>
                                        Light requirements
                                        <select
                                            value={p.form.lightRequirements}
                                            onChange={(e) =>
                                                p.setForm({ ...p.form, lightRequirements: e.target.value })
                                            }
                                        >
                                            {LIGHT_OPTIONS.map((opt) => (
                                                <option key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <NumericInput
                                        label="Max plants/m²"
                                        value={p.form.maxPlantsPerM2}
                                        onChange={(v) => p.setForm({ ...p.form, maxPlantsPerM2: v })}
                                        placeholder="e.g. 4"
                                    />
                                    <NumericInput
                                        label="Seed rate/m²"
                                        value={p.form.seedRatePerM2}
                                        onChange={(v) => p.setForm({ ...p.form, seedRatePerM2: v })}
                                    />
                                    <NumericInput
                                        label="Water liters/m²"
                                        value={p.form.waterLitersPerM2}
                                        onChange={(v) => p.setForm({ ...p.form, waterLitersPerM2: v })}
                                    />
                                    <NumericInput
                                        label="Yield kg/m²"
                                        value={p.form.yieldKgPerM2}
                                        onChange={(v) => p.setForm({ ...p.form, yieldKgPerM2: v })}
                                    />
                                </div>
                            </div>

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
