import type { useAdaptationTerms } from "../hooks/useAdaptationTerms";
import type { AdaptationTerm } from "../types";

type AdaptationTermsHook = ReturnType<typeof useAdaptationTerms>;

const TRANSLATION_STATUS_LABELS: Record<string, string> = {
    missing: "Missing",
    machine_translated: "Machine translated",
    qa_passed: "QA passed",
    human_reviewed: "Human reviewed",
    approved: "Approved",
};

const DIMENSION_LABELS: Record<string, string> = {
    temperature: "Temperature",
    moisture: "Moisture",
    climate: "Climate",
    season: "Season",
};

const LOCALE_META: Record<string, { label: string; flag: string }> = {
    vi: { label: "Vietnamese", flag: "🇻🇳" },
    en: { label: "English", flag: "🇬🇧" },
};

function localeLabel(locale: string): string {
    return LOCALE_META[locale]?.label ?? locale.toUpperCase();
}

function localeFlag(locale: string): string {
    return LOCALE_META[locale]?.flag ?? "🌐";
}

function translationStatusOf(term: AdaptationTerm, locale: string): string {
    return term.translations.find((translation) => translation.locale === locale)?.translationStatus ?? "missing";
}

export function TaxonomyManager({
    t,
    isAdmin,
    onToast,
}: {
    t: AdaptationTermsHook;
    isAdmin: boolean;
    onToast: (type: "success" | "error", msg: string) => void;
}) {
    const translationLocales = Array.from(
        new Set(t.terms.flatMap((term) => term.translations.map((translation) => translation.locale))),
    ).sort((a, b) => {
        const preferredOrder = ["vi", "en"];
        const aIndex = preferredOrder.indexOf(a);
        const bIndex = preferredOrder.indexOf(b);
        if (aIndex !== -1 || bIndex !== -1) {
            return (aIndex === -1 ? preferredOrder.length : aIndex) - (bIndex === -1 ? preferredOrder.length : bIndex);
        }
        return a.localeCompare(b);
    });

    if (translationLocales.length === 0) {
        translationLocales.push("vi", "en");
    }

    async function handleSave() {
        const msg = await t.save();
        if (msg) onToast("success", msg);
    }

    async function handleArchive() {
        if (!t.selected) return;
        const msg = await t.toggleArchive(t.selected);
        if (msg) onToast("success", msg);
    }

    async function handleRefresh() {
        const msg = await t.refreshMirror();
        if (msg) onToast("success", msg);
    }

    function renderTermRow(term: AdaptationTerm) {
        return (
            <tr
                key={term._id}
                className={term._id === t.selectedId ? "selected" : ""}
                onClick={() => t.select(term)}
            >
                <td>
                    <div className="row-title">{term.code}</div>
                    <div className="row-sub">
                        {term.status === "archived" ? <span className="badge-archived">archived</span> : <span className="badge-active">active</span>}
                    </div>
                </td>
                {translationLocales.map((locale) => {
                    const translation = term.translations.find((item) => item.locale === locale);
                    return (
                        <td key={locale}>
                            <div className="row-title">{localeFlag(locale)} {translation?.label ?? "—"}</div>
                            <div className="row-sub">{TRANSLATION_STATUS_LABELS[translationStatusOf(term, locale)] ?? "—"}</div>
                        </td>
                    );
                })}
                <td>{term.usageCount}</td>
                <td>{term.sortOrder}</td>
                <td className="taxonomy-action-cell">
                    <button
                        type="button"
                        className="btn ghost"
                        onClick={(e) => {
                            e.stopPropagation();
                            t.startEdit(term);
                        }}
                    >
                        Edit
                    </button>
                </td>
            </tr>
        );
    }

    return (
        <div className="page-content">
            <div className="page-header">
                <div>
                    <h2 className="page-title">Adaptation Taxonomy</h2>
                    <p className="page-desc">
                        Controlled climate and season vocabulary with Vietnamese/English translations
                    </p>
                </div>
                <div className="actions">
                    <button
                        className="btn secondary"
                        onClick={() => void t.load()}
                        disabled={t.loading}
                    >
                        ↻ Refresh
                    </button>
                    {isAdmin && (
                        <button
                            className="btn secondary"
                            onClick={() => void handleRefresh()}
                            disabled={t.refreshing}
                        >
                            {t.refreshing ? "Syncing..." : "🔄 Sync SQLite mirror"}
                        </button>
                    )}
                    {isAdmin && (
                        <button className="btn primary" onClick={t.startCreate}>
                            + New Term
                        </button>
                    )}
                </div>
            </div>

            {t.error && <p className="error-message">{t.error}</p>}

            <div className="layout">
                <section className="card">
                    <div className="section-title">
                        <h3>All Terms</h3>
                        <span className="muted">{t.terms.length} terms</span>
                    </div>
                    <div className="table-wrap">
                        {t.groupedByDimension.map((group) => (
                            <div key={group.dimension} className="taxonomy-group">
                                <div className="taxonomy-group-header">
                                    <h4>{DIMENSION_LABELS[group.dimension] ?? group.dimension}</h4>
                                    <span className="muted">{group.terms.length} terms</span>
                                </div>
                                <table className="taxonomy-table">
                                    <colgroup>
                                        <col style={{ width: "15%" }} />
                                        {translationLocales.map((locale) => (
                                            <col key={locale} style={{ width: `calc((100% - 43%) / ${translationLocales.length})` }} />
                                        ))}
                                        <col style={{ width: "9%" }} />
                                        <col style={{ width: "9%" }} />
                                        <col style={{ width: "10%" }} />
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th>Code</th>
                                            {translationLocales.map((locale) => (
                                                <th key={locale}>{localeLabel(locale)}</th>
                                            ))}
                                            <th>Usage</th>
                                            <th>Order</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {group.terms.map(renderTermRow)}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                        {t.terms.length === 0 && (
                            <p className="empty">No adaptation terms found.</p>
                        )}
                    </div>
                </section>

                <section className="card">
                    <div className="section-title">
                        <h3>
                            {t.mode === "create"
                                ? "Create Term"
                                : t.mode === "edit"
                                    ? "Edit Term"
                                    : "Term Details"}
                        </h3>
                        {t.mode === "view" && t.selected && (
                            <div className="actions">
                                <button
                                    className="btn secondary"
                                    onClick={() => t.startEdit(t.selected!)}
                                >
                                    Edit
                                </button>
                                {isAdmin && (
                                    <button
                                        className="btn danger"
                                        onClick={() => void handleArchive()}
                                        disabled={t.saving}
                                    >
                                        {t.selected.status === "archived" ? "Restore" : "Archive"}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {t.mode === "view" ? (
                        t.selected ? (
                            <div className="detail">
                                <div>
                                    <h3>{t.selected.code}</h3>
                                    <p className="muted">
                                        Dimension: {DIMENSION_LABELS[t.selected.dimension] ?? t.selected.dimension} · Order: {t.selected.sortOrder}
                                    </p>
                                    <p className="muted">
                                        {t.selected.usageCount} plant(s) use this term
                                    </p>
                                </div>
                                <div className="i18n-grid">
                                    {translationLocales.map((locale) => {
                                        const translation = t.selected!.translations.find((item) => item.locale === locale);
                                        return (
                                            <div className="i18n-lang-card" key={locale}>
                                                <div className="i18n-lang-header">
                                                    <span className="i18n-flag">{localeFlag(locale)}</span>
                                                    <span className="i18n-lang-name">{localeLabel(locale)}</span>
                                                    <span className="badge-translation">
                                                        {TRANSLATION_STATUS_LABELS[translationStatusOf(t.selected!, locale)] ?? "—"}
                                                    </span>
                                                </div>
                                                <p className="i18n-common-name">{translation?.label ?? "—"}</p>
                                                <p className="i18n-desc">{translation?.description ?? "No description"}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <p className="empty">Select a term to see details.</p>
                        )
                    ) : (
                        <div className="form">
                            <div className="grid-2">
                                <label>
                                    Code *
                                    <input
                                        value={t.form.code}
                                        disabled={t.mode === "edit"}
                                        onChange={(e) =>
                                            t.setForm({ ...t.form, code: e.target.value })
                                        }
                                        placeholder="e.g. hot"
                                    />
                                </label>
                                <label>
                                    Dimension
                                    <select
                                        value={t.form.dimension}
                                        disabled={t.mode === "edit"}
                                        onChange={(e) =>
                                            t.setForm({ ...t.form, dimension: e.target.value })
                                        }
                                    >
                                        {Object.entries(DIMENSION_LABELS).map(([value, label]) => (
                                            <option key={value} value={value}>
                                                {label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <div className="grid-2">
                                <label>
                                    Sort order
                                    <input
                                        value={t.form.sortOrder}
                                        onChange={(e) =>
                                            t.setForm({ ...t.form, sortOrder: e.target.value })
                                        }
                                    />
                                </label>
                                <label>
                                    Usage
                                    <input value={t.selected?.usageCount ?? 0} disabled />
                                </label>
                            </div>
                            <div className="grid-2">
                                <label>
                                    Label (VI) *
                                    <input
                                        value={t.form.labelVi}
                                        onChange={(e) =>
                                            t.setForm({ ...t.form, labelVi: e.target.value })
                                        }
                                    />
                                </label>
                                <label>
                                    Label (EN) *
                                    <input
                                        value={t.form.labelEn}
                                        onChange={(e) =>
                                            t.setForm({ ...t.form, labelEn: e.target.value })
                                        }
                                    />
                                </label>
                            </div>
                            <div className="grid-2">
                                <label>
                                    Definition (VI)
                                    <textarea
                                        rows={3}
                                        value={t.form.descriptionVi}
                                        onChange={(e) =>
                                            t.setForm({ ...t.form, descriptionVi: e.target.value })
                                        }
                                    />
                                </label>
                                <label>
                                    Definition (EN)
                                    <textarea
                                        rows={3}
                                        value={t.form.descriptionEn}
                                        onChange={(e) =>
                                            t.setForm({ ...t.form, descriptionEn: e.target.value })
                                        }
                                    />
                                </label>
                            </div>
                            <div className="form-actions">
                                <button
                                    className="btn secondary"
                                    onClick={t.cancel}
                                    type="button"
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn primary"
                                    onClick={() => void handleSave()}
                                    disabled={t.saving}
                                    type="button"
                                >
                                    {t.saving
                                        ? "Saving..."
                                        : t.mode === "create"
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
