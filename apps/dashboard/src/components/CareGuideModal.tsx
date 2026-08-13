import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

export type CareGuideLocale = {
    locale: string;
    label: string;
    careContent?: string;
};

const SAVE_LABEL = "Save care guide";
const DISCARDS_CONFIRM = "Discard unsaved care guide changes?";

type EditorMode = "edit" | "preview";

/**
 * Modal editor for the localized care guides of one plant.
 *
 * One tab per locale the plant already has. Only the active tab is saved,
 * through the caller-provided onSave so the save flow stays PATCH-per-locale.
 * Drafts are kept per locale while the modal is open; switching tabs or
 * closing the modal with unsaved changes asks for confirmation.
 * Because the care guides are Markdown, the editor offers two modes: a raw
 * Markdown Edit view and a rendered Preview view.
 */
export function CareGuideModal({
    locales,
    initialLocale,
    onSave,
    onClose,
    initialMode = "edit",
}: {
    locales: CareGuideLocale[];
    initialLocale?: string;
    onSave: (locale: string, careContent: string) => Promise<string | null>;
    onClose: () => void;
    initialMode?: EditorMode;
}) {
    const [activeLocale, setActiveLocale] = useState(
        () => initialLocale ?? locales[0]?.locale ?? "",
    );
    const [mode, setMode] = useState<EditorMode>(initialMode);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const activeRow = locales.find((row) => row.locale === activeLocale);
    const activeValue = drafts[activeLocale] ?? activeRow?.careContent ?? "";

    function isDirty(locale: string) {
        const draft = drafts[locale];
        if (draft === undefined) return false;
        const original = locales.find((row) => row.locale === locale)?.careContent ?? "";
        return draft !== original;
    }

    const anyDirty = locales.some((row) => isDirty(row.locale));

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.key !== "Escape") return;
            if (anyDirty && !window.confirm(DISCARDS_CONFIRM)) return;
            onClose();
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    });

    function switchTab(locale: string) {
        if (locale === activeLocale) return;
        if (isDirty(activeLocale) && !window.confirm(DISCARDS_CONFIRM)) return;
        setActiveLocale(locale);
    }

    function handleClose() {
        if (anyDirty && !window.confirm(DISCARDS_CONFIRM)) return;
        onClose();
    }

    async function handleSave() {
        if (saving || !activeRow) return;
        setSaving(true);
        try {
            const message = await onSave(activeRow.locale, activeValue);
            if (message) {
                // Fall back to the reloaded server value so a later save of
                // this locale cannot silently resurrect the old draft.
                setDrafts((prev) => {
                    const next = { ...prev };
                    delete next[activeRow.locale];
                    return next;
                });
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div
                className="modal-box care-guide-modal"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Care guide editor"
            >
                <div className="modal-header">
                    <h2>📝 Care guide</h2>
                    <button className="btn ghost icon-btn" onClick={handleClose} type="button">✕</button>
                </div>

                <div className="modal-body">
                    {locales.length > 1 && (
                        <div className="form-tabs care-guide-modal-lang-tabs" role="tablist">
                            {locales.map((row) => (
                                <button
                                    key={row.locale}
                                    type="button"
                                    role="tab"
                                    aria-selected={row.locale === activeLocale}
                                    className={`form-tab ${row.locale === activeLocale ? "active" : ""}`}
                                    onClick={() => switchTab(row.locale)}
                                >
                                    {row.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {activeRow ? (
                        <>
                            <div className="care-guide-mode-toggle" role="tablist" aria-label="Editor mode">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={mode === "edit"}
                                    className={`form-tab ${mode === "edit" ? "active" : ""}`}
                                    onClick={() => setMode("edit")}
                                >
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={mode === "preview"}
                                    className={`form-tab ${mode === "preview" ? "active" : ""}`}
                                    onClick={() => setMode("preview")}
                                >
                                    Preview
                                </button>
                            </div>
                            {mode === "edit" ? (
                                <textarea
                                    className="care-editor-input care-editor-input--modal"
                                    aria-label={`Care guide (${activeRow.locale}) — Markdown`}
                                    rows={18}
                                    value={activeValue}
                                    onChange={(event) =>
                                        setDrafts((prev) => ({ ...prev, [activeRow.locale]: event.target.value }))
                                    }
                                    placeholder="Write the care guide in Markdown…"
                                />
                            ) : (
                                <div className="markdown-body care-preview care-preview--modal">
                                    <ReactMarkdown>{activeValue || "*No care guide yet.*"}</ReactMarkdown>
                                </div>
                            )}
                        </>
                    ) : (
                        <p className="empty">No language rows to edit.</p>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn secondary" onClick={handleClose} disabled={saving} type="button">
                        Cancel
                    </button>
                    <button
                        className="btn primary"
                        onClick={() => void handleSave()}
                        disabled={saving || !activeRow}
                        type="button"
                    >
                        {saving ? "Saving…" : SAVE_LABEL}
                    </button>
                </div>
            </div>
        </div>
    );
}
