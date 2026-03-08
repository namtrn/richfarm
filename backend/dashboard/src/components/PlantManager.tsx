import { useState, useMemo, useEffect } from "react";
import type { usePlants } from "../hooks/usePlants";
import type { useI18n } from "../hooks/useI18n";
import type { useBackendPlants } from "../hooks/useBackendPlants";
import { buildPlantUiGroupMap } from "../../../../lib/plantUiGrouping";
import { isDisplayBasePlant } from "../../../../lib/plantBase";
import {
    getDisplayName,
    getLocaleRow,
    computeScientificName,
    LIGHT_OPTIONS,
    DEFAULT_CULTIVAR_NORMALIZED,
    convex,
} from "../constants";

type PlantHook = ReturnType<typeof usePlants>;
type I18nHook = ReturnType<typeof useI18n>;
type BackendHook = ReturnType<typeof useBackendPlants>;

type FormTab = "taxonomy" | "i18n" | "classification" | "growing" | "advanced";

const PLANT_LANGUAGE_OPTIONS = [
    { value: "vi", label: "Vietnamese" },
    { value: "en", label: "English" },
    { value: "es", label: "Spanish" },
    { value: "pt", label: "Portuguese" },
    { value: "fr", label: "French" },
    { value: "zh", label: "Chinese" },
] as const;
type PlantLanguageOption = (typeof PLANT_LANGUAGE_OPTIONS)[number]["value"];

function NumericInput({
    label,
    value,
    onChange,
    placeholder,
    step = "any",
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    step?: string;
}) {
    return (
        <label>
            {label}
            <input
                type="number"
                min={0}
                step={step}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </label>
    );
}

function isVariantRow(cultivarNormalized?: string) {
    return Boolean(cultivarNormalized) &&
        cultivarNormalized !== DEFAULT_CULTIVAR_NORMALIZED &&
        !isDisplayBasePlant({ cultivarNormalized });
}

function getUiGroupRows(plants: PlantHook["plants"]) {
    const groupMap = buildPlantUiGroupMap(plants, "vi");
    const grouped = new Map<string, {
        label: string;
        plants: PlantHook["plants"];
    }>();

    for (const plant of plants) {
        const group = groupMap.get(String(plant._id));
        const key = group?.key ?? `fallback:${plant._id}`;
        const label = group?.label ?? getDisplayName(plant);
        const existing = grouped.get(key);
        if (existing) {
            existing.plants.push(plant);
        } else {
            grouped.set(key, {
                label,
                plants: [plant],
            });
        }
    }

    const rows: Array<
        | { rowType: "header"; key: string; label: string; count: number }
        | { rowType: "plant"; key: string; plant: PlantHook["plants"][number] }
    > = [];

    const groups = Array.from(grouped.entries()).sort((a, b) =>
        a[1].label.localeCompare(b[1].label, "vi")
    );

    for (const [key, group] of groups) {
        const sortedPlants = [...group.plants].sort((a, b) => {
            const aVariant = isVariantRow(a.cultivarNormalized);
            const bVariant = isVariantRow(b.cultivarNormalized);
            if (aVariant !== bVariant) return aVariant ? 1 : -1;
            return getDisplayName(a).localeCompare(getDisplayName(b), "vi");
        });

        rows.push({
            rowType: "header",
            key: `header:${key}`,
            label: group.label,
            count: sortedPlants.length,
        });
        for (const plant of sortedPlants) {
            rows.push({
                rowType: "plant",
                key: `plant:${plant._id}`,
                plant,
            });
        }
    }

    return rows;
}

export function PlantManager({
    p,
    i18n,
    backend,
    onToast,
}: {
    p: PlantHook;
    i18n: I18nHook;
    backend: BackendHook;
    onToast: (type: "success" | "error" | "info" | "warning", msg: string) => void;
}) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showImport, setShowImport] = useState(false);

    useEffect(() => {
        setSelectedIds(new Set());
    }, [p.page, p.search, p.groupFilter, p.filterMissingI18n, p.filterNoImage]);

    // toggle single row selection
    function toggleSelect(id: string) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    // toggle all visible rows
    function toggleAll() {
        if (selectedIds.size === p.plants.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(p.plants.map((pl) => pl._id)));
        }
    }

    const selectedCount = selectedIds.size;
    const groupedRows = useMemo(() => getUiGroupRows(p.plants), [p.plants]);

    // Numeric IDs from Convex IDs are not applicable here — bulk ops use SQLite numeric IDs.
    // We surface a warning when user tries to bulk-op on Convex-only ids.
    const selectedNumericIds = useMemo(() => {
        const ids: number[] = [];
        for (const id of selectedIds) {
            const n = Number(id);
            if (!isNaN(n) && n > 0) ids.push(n);
        }
        return ids;
    }, [selectedIds]);

    async function handleBulk(action: "activate" | "deactivate" | "delete") {
        if (selectedNumericIds.length === 0) {
            onToast("warning", "Selected plants don't have numeric SQLite IDs (Convex-only data — use the backend writer for bulk ops)");
            return;
        }
        if (action === "delete" && !confirm(`Delete ${selectedNumericIds.length} plants? This cannot be undone.`)) return;
        const affected = await backend.bulkAction(action, selectedNumericIds);
        if (affected > 0) {
            onToast("success", `${action}: ${affected} plants updated`);
            setSelectedIds(new Set());
            void p.load();
            void backend.loadStats();
        }
    }

    function renderI18nBadge(rows: { locale: string; commonName: string }[], locale: "vi" | "en") {
        const row = rows.find((r) => r.locale === locale);
        const ok = Boolean(row?.commonName);
        return <span className={`badge ${ok ? "ok" : "warn"}`}>{locale.toUpperCase()}</span>;
    }

    async function handleSave() {
        const msg = await p.save();
        if (msg) {
            onToast("success", msg);
            void backend.loadStats();
        }
    }

    async function handleDelete() {
        const msg = await p.remove();
        if (msg) {
            onToast("success", msg);
            void backend.loadStats();
        }
    }


    return (
        <div className="page-content">
            {/* Page header */}
            <div className="page-header">
                <div>
                    <h2 className="page-title">Plants Master</h2>
                    <p className="page-desc">Manage plant database, translations, and metadata</p>
                </div>
                <div className="actions">
                    <button className="btn secondary" onClick={() => void backend.exportData("json")} disabled={backend.exportLoading}>
                        ⬇ JSON
                    </button>
                    <button className="btn secondary" onClick={() => void backend.exportData("csv")} disabled={backend.exportLoading}>
                        ⬇ CSV
                    </button>
                    <button className="btn secondary" onClick={() => setShowImport(true)}>
                        ⬆ Import
                    </button>
                    <button className="btn secondary" onClick={() => void p.load()} disabled={p.loading}>
                        ↻ Refresh
                    </button>
                    <button className="btn primary" onClick={p.startCreate}>
                        + New Plant
                    </button>
                </div>
            </div>

            {p.error && <p className="error-message">{p.error}</p>}
            {backend.error && <p className="error-message">{backend.error}</p>}

            {/* Bulk action toolbar */}
            {selectedCount > 0 && (
                <div className="bulk-toolbar">
                    <span className="bulk-count">{selectedCount} selected</span>
                    <button className="btn ghost" onClick={() => void handleBulk("activate")} disabled={backend.bulkLoading}>✓ Activate</button>
                    <button className="btn ghost" onClick={() => void handleBulk("deactivate")} disabled={backend.bulkLoading}>⊘ Deactivate</button>
                    <button className="btn danger" onClick={() => void handleBulk("delete")} disabled={backend.bulkLoading}>🗑 Delete</button>
                    <button className="btn ghost" onClick={() => setSelectedIds(new Set())} style={{ marginLeft: "auto" }}>✕ Clear</button>
                </div>
            )}

            {/* Import modal */}
            {showImport && (
                <ImportInline backend={backend} onClose={() => setShowImport(false)} onToast={onToast} onDone={() => void p.load()} />
            )}

            <div className="layout">
                {/* Left: table */}
                <section className="card">
                    <div className="section-title">
                        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                            <h3>All Plants</h3>
                            <span className="muted">
                                {p.totalItems} results • page {p.page}/{p.totalPages}
                            </span>
                        </div>
                        <div className="actions">
                            <button className="btn secondary icon-btn" onClick={() => p.goToPage(p.page - 1)} disabled={p.page <= 1 || p.loading} title="Previous">
                                ◀
                            </button>
                            <button className="btn secondary icon-btn" onClick={() => p.goToPage(p.page + 1)} disabled={p.page >= p.totalPages || p.loading} title="Next">
                                ▶
                            </button>
                        </div>
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
                                <option key={g} value={g}>{g}</option>
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
                                    <th style={{ width: 36 }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedCount === p.plants.length && p.plants.length > 0}
                                            onChange={toggleAll}
                                        />
                                    </th>
                                    <th>Name</th>
                                    <th>Type</th>
                                    <th>Group</th>
                                    <th>i18n</th>
                                    <th>Img</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupedRows.map((row) => {
                                    if (row.rowType === "header") {
                                        return (
                                            <tr key={row.key} className="group-header-row">
                                                <td colSpan={7}>
                                                    <div style={{ padding: "0.5rem 0", fontWeight: 700, color: "var(--text-secondary)" }}>
                                                        {row.label} ({row.count})
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    const plant = row.plant;
                                    const variant = isVariantRow(plant.cultivarNormalized);
                                    const checked = selectedIds.has(plant._id);
                                    return (
                                        <tr
                                            key={row.key}
                                            className={`${plant._id === p.selectedId ? "selected" : ""} ${checked ? "row-checked" : ""}`}
                                            onClick={() => p.select(plant)}
                                        >
                                            <td onClick={(e) => { e.stopPropagation(); toggleSelect(plant._id); }}>
                                                <input type="checkbox" checked={checked} onChange={() => toggleSelect(plant._id)} />
                                            </td>
                                            <td>
                                                <div className="row-title" style={variant ? { paddingLeft: "1rem" } : undefined}>
                                                    {variant ? "· " : ""}{getDisplayName(plant)}
                                                </div>
                                                <div className="row-sub">
                                                    {plant.genus && plant.species
                                                        ? `${plant.genus} ${plant.species}${plant.cultivar ? ` '${plant.cultivar}'` : ""}`
                                                        : plant.scientificName}
                                                </div>
                                            </td>
                                            <td>
                                                {variant
                                                    ? <span className="badge warn">VAR</span>
                                                    : <span className="badge ok">BASE</span>}
                                            </td>
                                            <td><span className="pill">{plant.group}</span></td>
                                            <td className="badge-group">
                                                {renderI18nBadge(plant.i18nRows, "vi")}
                                                {renderI18nBadge(plant.i18nRows, "en")}
                                            </td>
                                            <td>
                                                {plant.imageUrl
                                                    ? <span className="badge ok">✓</span>
                                                    : <span className="badge warn">✕</span>}
                                            </td>
                                            <td>
                                                <button className="btn ghost" onClick={(e) => { e.stopPropagation(); p.startEdit(plant); }}>
                                                    Edit
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {p.plants.length === 0 && (
                            <p className="empty">No plants found for current filters.</p>
                        )}
                    </div>
                    <div className="actions" style={{ justifyContent: "space-between", marginTop: "1rem" }}>
                        <span className="muted">30 plants per page. Taxonomy groups stay on one page.</span>
                        <div className="actions">
                            <button className="btn secondary" onClick={() => p.goToPage(p.page - 1)} disabled={p.page <= 1 || p.loading}>
                                Prev
                            </button>
                            <button className="btn secondary" onClick={() => p.goToPage(p.page + 1)} disabled={p.page >= p.totalPages || p.loading}>
                                Next
                            </button>
                        </div>
                    </div>
                </section>

                {/* Right: detail / form */}
                <section className="card">
                    <div className="section-title">
                        <h3>
                            {p.mode === "create" ? "Create Plant" : p.mode === "edit" ? "Edit Plant" : "Plant Details"}
                        </h3>
                        {p.mode === "view" && p.selected && (
                            <div className="actions">
                                <button className="btn secondary" onClick={() => p.startEdit(p.selected!)}>Edit</button>
                                <button className="btn danger" onClick={() => void handleDelete()} disabled={p.saving}>Delete</button>
                            </div>
                        )}
                        {(p.mode === "create" || p.mode === "edit") && (
                            <div className="actions">
                                <button className="btn secondary" onClick={p.cancel} disabled={p.saving}>Cancel</button>
                                <button className="btn primary" onClick={handleSave} disabled={p.saving}>
                                    {p.saving ? "Saving…" : "Save"}
                                </button>
                            </div>
                        )}
                    </div>

                    {p.mode === "view" ? (
                        p.selected ? (
                            <PlantDetail plant={p.selected} reload={p.load} onToast={onToast} />
                        ) : (
                            <p className="empty">Select a plant to see details.</p>
                        )
                    ) : (
                        <PlantForm p={p} onSave={handleSave} />
                    )}
                </section>
            </div>
        </div>
    );
}

// ── Plant Detail View ──────────────────────────────────────────────────────

function PlantDetail({
    plant,
    reload,
    onToast,
}: {
    plant: ReturnType<typeof usePlants>["selected"] & {};
    reload: () => Promise<void>;
    onToast: (type: "success" | "error" | "info" | "warning", msg: string) => void;
}) {
    if (!plant) return null;
    const vi = getLocaleRow(plant.i18nRows, "vi");
    const en = getLocaleRow(plant.i18nRows, "en");
    const variant = isVariantRow(plant.cultivarNormalized);

    return (
        <div className="detail">
            <div className="detail-header">
                <div>
                    <h3>{getDisplayName(plant)}</h3>
                    <p className="muted">
                        {plant.genus && plant.species
                            ? `${plant.genus} ${plant.species}${plant.cultivar ? ` '${plant.cultivar}'` : ""}`
                            : plant.scientificName}
                    </p>
                    {plant.genus && (
                        <p className="muted" style={{ fontSize: "0.8rem" }}>
                            Genus: {plant.genus} · Species: {plant.species}{" "}
                            {plant.cultivar ? `· Cultivar: ${plant.cultivar}` : "· (base species)"}
                        </p>
                    )}
                    <div className="badge-group" style={{ marginTop: 8 }}>
                        {variant ? <span className="badge warn">VARIANT</span> : <span className="badge ok">BASE</span>}
                        {vi ? <span className="badge ok">VI</span> : <span className="badge warn">VI</span>}
                        {en ? <span className="badge ok">EN</span> : <span className="badge warn">EN</span>}
                        <span className={`badge ${plant.imageUrl ? "ok" : "warn"}`}>Image</span>
                    </div>
                </div>
                {plant.imageUrl ? (
                    <img src={plant.imageUrl} alt="plant" className="thumb" />
                ) : (
                    <div className="thumb placeholder">No image</div>
                )}
            </div>

            <div className="detail-grid">
                <div>
                    <h4>Overview</h4>
                    <p className="muted">Group: {plant.group}</p>
                    <p>{plant.description || "No description"}</p>
                    <p className="muted">Purposes: {(plant.purposes ?? []).join(", ") || "—"}</p>
                    <p className="muted">Source: {plant.source ?? "—"}</p>
                </div>
                <div>
                    <h4>Growth Data</h4>
                    <ul className="meta-list">
                        <li>Days to harvest: {plant.typicalDaysToHarvest ?? "—"}</li>
                        <li>Watering (days): {plant.wateringFrequencyDays ?? "—"}</li>
                        <li>Germination (days): {plant.germinationDays ?? "—"}</li>
                        <li>Light: {plant.lightRequirements ?? "—"}</li>
                        <li>Spacing (cm): {plant.spacingCm ?? "—"}</li>
                        <li>Max plants/m²: {plant.maxPlantsPerM2 ?? "—"}</li>
                        <li>Seed rate/m²: {plant.seedRatePerM2 ?? "—"}</li>
                        <li>Water liters/m²: {plant.waterLitersPerM2 ?? "—"}</li>
                        <li>Yield kg/m²: {plant.yieldKgPerM2 ?? "—"}</li>
                    </ul>
                </div>
            </div>

            <div className="i18n-inline">
                <div className="i18n-inline-header">
                    <h4>🌐 Translations</h4>
                    <AddLanguageButton plant={plant} reload={reload} onToast={onToast} />
                </div>
                <div className="i18n-grid">
                    {plant.i18nRows
                        .slice()
                        .sort((a, b) => a.locale.localeCompare(b.locale))
                        .map((row) => {
                            const language = PLANT_LANGUAGE_OPTIONS.find((option) => option.value === row.locale);
                            return (
                                <div className="i18n-lang-card" key={row.locale}>
                                    <div className="i18n-lang-header">
                                        <span className="i18n-lang-name">{language?.label ?? row.locale.toUpperCase()}</span>
                                        <span className="badge ok small">{row.locale.toUpperCase()}</span>
                                    </div>
                                    <p className="i18n-common-name">{row.commonName}</p>
                                    <p className="i18n-desc">{row.description ?? "No description"}</p>
                                </div>
                            );
                        })}
                </div>
            </div>
        </div>
    );
}

function AddLanguageButton({
    plant,
    reload,
    onToast,
}: {
    plant: NonNullable<ReturnType<typeof usePlants>["selected"]>;
    reload: () => Promise<void>;
    onToast: (type: "success" | "error" | "info" | "warning", msg: string) => void;
}) {
    const existingLocales = new Set(plant.i18nRows.map((row) => row.locale));
    const availableLocales = PLANT_LANGUAGE_OPTIONS.filter(
        (option) => !existingLocales.has(option.value)
    );
    const [open, setOpen] = useState(false);
    const [locale, setLocale] = useState<PlantLanguageOption | "">(availableLocales[0]?.value ?? "");
    const [commonName, setCommonName] = useState("");
    const [description, setDescription] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setLocale(availableLocales[0]?.value ?? "");
        setCommonName("");
        setDescription("");
        setOpen(false);
    }, [plant._id]);

    if (availableLocales.length === 0) {
        return <span className="muted">All supported languages added</span>;
    }

    async function handleSubmit() {
        if (!locale) {
            onToast("warning", "Choose a language first");
            return;
        }
        if (!commonName.trim()) {
            onToast("warning", "Common name is required");
            return;
        }

        setSaving(true);
        try {
            await convex.mutation("plantAdmin:createPlantI18n" as any, {
                plantId: plant._id,
                locale,
                commonName: commonName.trim(),
                description: description.trim() || undefined,
            });
            await reload();
            setOpen(false);
            setCommonName("");
            setDescription("");
            onToast("success", `Added ${locale.toUpperCase()} translation`);
        } catch (error) {
            onToast("error", error instanceof Error ? error.message : "Cannot add language");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {!open ? (
                <button className="btn secondary" onClick={() => setOpen(true)}>
                    + Add language
                </button>
            ) : (
                <>
                    <select
                        className="filter-select"
                        value={locale}
                        onChange={(e) => setLocale(e.target.value as PlantLanguageOption)}
                        disabled={saving}
                    >
                        {availableLocales.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <input
                        placeholder="Common name"
                        value={commonName}
                        onChange={(e) => setCommonName(e.target.value)}
                        disabled={saving}
                    />
                    <input
                        placeholder="Description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={saving}
                    />
                    <button className="btn primary" onClick={() => void handleSubmit()} disabled={saving}>
                        {saving ? "Adding…" : "Add"}
                    </button>
                    <button className="btn ghost" onClick={() => setOpen(false)} disabled={saving}>
                        Cancel
                    </button>
                </>
            )}
        </div>
    );
}

// ── Plant Form ─────────────────────────────────────────────────────────────

function PlantForm({
    p,
    onSave,
}: {
    p: PlantHook;
    onSave: () => void;
}) {
    const f = p.form;
    const set = (patch: Partial<PlantHook["form"]>) => p.setForm({ ...f, ...patch });

    return (
        <div className="form simplified-form">
            {/* ── Taxonomy ── */}
            <div className="form-section">
                <div className="section-header-compact">🌿 Taxonomy</div>
                <div className="grid-3">
                    <label>
                        Genus *
                        <input placeholder="e.g. Solanum" value={f.genus} onChange={(e) => set({ genus: e.target.value })} />
                    </label>
                    <label>
                        Species *
                        <input placeholder="e.g. lycopersicum" value={f.species} onChange={(e) => set({ species: e.target.value })} />
                    </label>
                    <label>
                        Cultivar
                        <input placeholder="e.g. Cherry — empty = base" value={f.cultivar} onChange={(e) => set({ cultivar: e.target.value })} />
                    </label>
                </div>
                {(f.genus || f.species) && (
                    <p className="form-preview muted">
                        Scientific name:{" "}
                        <em>
                            {computeScientificName(f.genus, f.species)}
                            {f.cultivar.trim() ? ` '${f.cultivar.trim()}'` : " (base)"}
                        </em>
                    </p>
                )}
                <label>
                    Family
                    <input placeholder="e.g. Solanaceae" value={f.family} onChange={(e) => set({ family: e.target.value })} />
                </label>
            </div>

            {/* ── I18n ── */}
            <div className="form-section">
                <div className="section-header-compact">🌐 Translations</div>
                <div className="i18n-form-grid">
                    <div className="i18n-lang-block">
                        <div className="i18n-lang-header">
                            <span className="i18n-flag">🇻🇳</span>
                            <span className="i18n-lang-name">Vietnamese</span>
                        </div>
                        <label>
                            Common name *
                            <input value={f.viCommonName} onChange={(e) => set({ viCommonName: e.target.value })} />
                        </label>
                        <label>
                            Description
                            <textarea rows={3} value={f.viDescription} onChange={(e) => set({ viDescription: e.target.value })} />
                        </label>
                    </div>
                    <div className="i18n-lang-block">
                        <div className="i18n-lang-header">
                            <span className="i18n-flag">🇬🇧</span>
                            <span className="i18n-lang-name">English</span>
                        </div>
                        <label>
                            Common name *
                            <input value={f.enCommonName} onChange={(e) => set({ enCommonName: e.target.value })} />
                        </label>
                        <label>
                            Description
                            <textarea rows={3} value={f.enDescription} onChange={(e) => set({ enDescription: e.target.value })} />
                        </label>
                    </div>
                </div>
            </div>

            {/* ── Classification ── */}
            <div className="form-section">
                <div className="section-header-compact">📋 Classification</div>
                <div className="grid-2">
                    <label>
                        Group
                        <input value={f.group} onChange={(e) => set({ group: e.target.value })} />
                    </label>
                    <label>
                        Purposes (comma separated)
                        <input placeholder="e.g. vegetable, fruit" value={f.purposes} onChange={(e) => set({ purposes: e.target.value })} />
                    </label>
                </div>
                <div className="grid-3">
                    <label>
                        Group Base Plant ID
                        <input placeholder="Convex plant id" value={f.groupBasePlantId} onChange={(e) => set({ groupBasePlantId: e.target.value })} />
                    </label>
                    <label>
                        UI Group Key
                        <input placeholder="e.g. hanh-tay" value={f.uiGroupKey} onChange={(e) => set({ uiGroupKey: e.target.value })} />
                    </label>
                    <label>
                        UI Group VI
                        <input placeholder="e.g. Hanh tay" value={f.uiGroupLabelVi} onChange={(e) => set({ uiGroupLabelVi: e.target.value })} />
                    </label>
                    <label>
                        UI Group EN
                        <input placeholder="e.g. Onion" value={f.uiGroupLabelEn} onChange={(e) => set({ uiGroupLabelEn: e.target.value })} />
                    </label>
                </div>
                <label>
                    Image URL
                    <input value={f.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} />
                </label>
                {f.imageUrl && (
                    <div style={{ marginTop: 8 }}>
                        <img src={f.imageUrl} alt="preview" className="thumb" onError={(e) => (e.currentTarget.style.display = "none")} />
                    </div>
                )}
                <label>
                    Description (internal)
                    <textarea rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} />
                </label>
                <label className="checkbox">
                    <input
                        type="checkbox"
                        checked={f.isActive}
                        onChange={(e) => set({ isActive: e.target.checked })}
                    />
                    Active (visible to app users)
                </label>
            </div>

            {/* ── Growing Data ── */}
            <div className="form-section">
                <div className="section-header-compact">🌱 Growing Data</div>
                <div className="grid-3">
                    <NumericInput label="Days to harvest" value={f.typicalDaysToHarvest} onChange={(v) => set({ typicalDaysToHarvest: v })} placeholder="e.g. 80" />
                    <NumericInput label="Watering (days)" value={f.wateringFrequencyDays} onChange={(v) => set({ wateringFrequencyDays: v })} placeholder="e.g. 2" />
                    <NumericInput label="Germination (days)" value={f.germinationDays} onChange={(v) => set({ germinationDays: v })} placeholder="e.g. 7" />
                    <NumericInput label="Spacing (cm)" value={f.spacingCm} onChange={(v) => set({ spacingCm: v })} placeholder="e.g. 45" />
                    <label>
                        Light requirements
                        <select value={f.lightRequirements} onChange={(e) => set({ lightRequirements: e.target.value })}>
                            {LIGHT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </label>
                    <NumericInput label="Light hours/day" value={f.lightHours} onChange={(v) => set({ lightHours: v })} placeholder="e.g. 8" />
                    <NumericInput label="Max plants/m²" value={f.maxPlantsPerM2} onChange={(v) => set({ maxPlantsPerM2: v })} placeholder="e.g. 4" />
                    <NumericInput label="Seed rate/m²" value={f.seedRatePerM2} onChange={(v) => set({ seedRatePerM2: v })} />
                    <NumericInput label="Water liters/m²" value={f.waterLitersPerM2} onChange={(v) => set({ waterLitersPerM2: v })} />
                    <NumericInput label="Yield kg/m²" value={f.yieldKgPerM2} onChange={(v) => set({ yieldKgPerM2: v })} />
                </div>
            </div>

            {/* ── Advanced ── */}
            <div className="form-section">
                <div className="section-header-compact">⚙️ Advanced</div>
                <div className="grid-2">
                    <NumericInput label="Soil pH min" value={f.soilPhMin} onChange={(v) => set({ soilPhMin: v })} placeholder="e.g. 5.5" step="0.1" />
                    <NumericInput label="Soil pH max" value={f.soilPhMax} onChange={(v) => set({ soilPhMax: v })} placeholder="e.g. 7.0" step="0.1" />
                </div>
                <div className="grid-2">
                    <NumericInput label="Moisture target (%)" value={f.moistureTarget} onChange={(v) => set({ moistureTarget: v })} placeholder="e.g. 60" />
                </div>
                <label>
                    Notes (internal)
                    <textarea rows={2} placeholder="Admin notes..." value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
                </label>
            </div>

            <div className="form-actions" style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
                <button className="btn secondary" onClick={p.cancel} type="button">Cancel</button>
                <button className="btn primary" onClick={onSave} disabled={p.saving} type="button">
                    {p.saving ? "Saving…" : p.mode === "create" ? "Create Plant" : "Save Changes"}
                </button>
            </div>
        </div>
    );
}

// ── Inline Import Panel ────────────────────────────────────────────────────

function ImportInline({
    backend,
    onClose,
    onToast,
    onDone,
}: {
    backend: BackendHook;
    onClose: () => void;
    onToast: (type: "success" | "error" | "info" | "warning", msg: string) => void;
    onDone: () => void;
}) {
    const [rows, setRows] = useState<unknown[]>([]);
    const [parseErr, setParseErr] = useState("");
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [result, setResult] = useState<{ created: number; failed: number; errors: string[] } | null>(null);

    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setParseErr(""); setRows([]); setResult(null);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            try {
                if (file.name.endsWith(".json")) {
                    const arr = JSON.parse(text);
                    if (!Array.isArray(arr)) throw new Error("JSON must be an array");
                    setRows(arr);
                } else {
                    // simple CSV parse
                    const lines = text.split(/\r?\n/).filter((l) => l.trim());
                    const headers = lines[0].split(",").map((h) => h.trim());
                    const parsed = lines.slice(1).map((line) => {
                        const cells = line.split(",");
                        const obj: Record<string, string> = {};
                        headers.forEach((h, i) => { obj[h] = (cells[i] ?? "").trim(); });
                        return obj;
                    });
                    setRows(parsed);
                }
            } catch (err) {
                setParseErr(err instanceof Error ? err.message : "Parse error");
            }
        };
        reader.readAsText(file);
    }

    async function run() {
        setResult(null);
        setProgress({ done: 0, total: rows.length });
        const r = await backend.importPlants(rows, (d, t) => setProgress({ done: d, total: t }));
        setProgress(null);
        setResult(r);
        if (r.created > 0) { onToast("success", `Imported ${r.created} plants`); onDone(); }
        if (r.failed > 0) onToast("error", `${r.failed} rows failed`);
    }

    return (
        <div className="import-panel card">
            <div className="import-panel-header">
                <h4>⬆ Import Plants</h4>
                <button className="btn ghost icon-btn" onClick={onClose}>✕</button>
            </div>
            <p className="muted" style={{ marginBottom: 8 }}>
                Upload a <strong>.json</strong> array or <strong>.csv</strong> with columns: plant_code, vi_common_name, en_common_name…
            </p>
            <input type="file" accept=".json,.csv" onChange={handleFile} />
            {parseErr && <p className="error-message">{parseErr}</p>}
            {rows.length > 0 && (
                <div style={{ marginTop: 8 }}>
                    <p className="muted">{rows.length} rows ready</p>
                    {progress && (
                        <div className="import-progress">
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                            </div>
                            <span className="muted">{progress.done}/{progress.total}</span>
                        </div>
                    )}
                    {result && <p>✅ {result.created} created &nbsp; ❌ {result.failed} failed</p>}
                    {!progress && (
                        <button className="btn primary" onClick={() => void run()} disabled={backend.importLoading} style={{ marginTop: 8 }}>
                            {backend.importLoading ? "Importing…" : `Import ${rows.length} rows`}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
