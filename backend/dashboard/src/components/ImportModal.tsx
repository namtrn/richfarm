import { useState, useRef } from "react";
import type { useBackendPlants } from "../hooks/useBackendPlants";

type BackendHook = ReturnType<typeof useBackendPlants>;

interface ParsedRow {
    plant_code: string;
    i18n: { vi: { common_name: string; description?: string }; en: { common_name: string; description?: string } };
    scientific_name?: string;
    category?: string;
    group?: string;
    family?: string;
    typical_days_to_harvest?: number;
    germination_days?: number;
    spacing_cm?: number;
    [key: string]: unknown;
}

function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuote = !inQuote;
        } else if (ch === "," && !inQuote) {
            result.push(cur); cur = "";
        } else {
            cur += ch;
        }
    }
    result.push(cur);
    return result;
}

function csvToRows(text: string): ParsedRow[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
        const cells = parseCsvLine(line);
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => { obj[h] = cells[i] ?? ""; });
        return {
            plant_code: String(obj["plant_code"] ?? ""),
            scientific_name: String(obj["scientific_name"] ?? "") || undefined,
            category: String(obj["category"] ?? "") || undefined,
            group: String(obj["group"] ?? "") || undefined,
            family: String(obj["family"] ?? "") || undefined,
            typical_days_to_harvest: obj["typical_days_to_harvest"] ? Number(obj["typical_days_to_harvest"]) : undefined,
            germination_days: obj["germination_days"] ? Number(obj["germination_days"]) : undefined,
            spacing_cm: obj["spacing_cm"] ? Number(obj["spacing_cm"]) : undefined,
            i18n: {
                vi: { common_name: String(obj["vi_common_name"] ?? ""), description: String(obj["vi_description"] ?? "") || undefined },
                en: { common_name: String(obj["en_common_name"] ?? ""), description: String(obj["en_description"] ?? "") || undefined },
            },
        } as ParsedRow;
    });
}

export function ImportModal({
    backend,
    onClose,
    onToast,
}: {
    backend: BackendHook;
    onClose: () => void;
    onToast: (type: "success" | "error" | "info", msg: string) => void;
}) {
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [parseError, setParseError] = useState("");
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [done, setDone] = useState<{ created: number; failed: number; errors: string[] } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setParseError("");
        setDone(null);
        setRows([]);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            try {
                if (file.name.endsWith(".json")) {
                    const parsed = JSON.parse(text);
                    if (!Array.isArray(parsed)) throw new Error("JSON must be an array");
                    setRows(parsed as ParsedRow[]);
                } else {
                    const parsed = csvToRows(text);
                    if (parsed.length === 0) throw new Error("No data rows found");
                    setRows(parsed);
                }
            } catch (err) {
                setParseError(err instanceof Error ? err.message : "Parse error");
            }
        };
        reader.readAsText(file);
    }

    async function handleImport() {
        setDone(null);
        setProgress({ done: 0, total: rows.length });
        const result = await backend.importPlants(rows, (d, t) => setProgress({ done: d, total: t }));
        setProgress(null);
        setDone(result);
        if (result.created > 0) {
            onToast("success", `Imported ${result.created} plants`);
        }
        if (result.failed > 0) {
            onToast("error", `${result.failed} rows failed`);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>📤 Import Plants</h2>
                    <button className="btn ghost icon-btn" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    <p className="muted">
                        Accepts <strong>JSON</strong> (array of plant objects) or <strong>CSV</strong> with headers:<br />
                        <code>plant_code, scientific_name, category, group, family, vi_common_name, vi_description, en_common_name, en_description, typical_days_to_harvest, germination_days, spacing_cm …</code>
                    </p>

                    <div
                        className="file-drop-area"
                        onClick={() => fileRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            const file = e.dataTransfer.files[0];
                            if (file && fileRef.current) {
                                const dt = new DataTransfer();
                                dt.items.add(file);
                                fileRef.current.files = dt.files;
                                fileRef.current.dispatchEvent(new Event("change", { bubbles: true }));
                            }
                        }}
                    >
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".json,.csv"
                            style={{ display: "none" }}
                            onChange={handleFile}
                        />
                        <span className="drop-icon">📂</span>
                        <span>Click or drag & drop a .json or .csv file</span>
                    </div>

                    {parseError && <p className="error-message">{parseError}</p>}

                    {rows.length > 0 && (
                        <>
                            <p className="import-preview-label">
                                Preview: <strong>{rows.length}</strong> rows ready to import
                            </p>
                            <div className="table-wrap" style={{ maxHeight: 220 }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>plant_code</th>
                                            <th>VI Name</th>
                                            <th>EN Name</th>
                                            <th>Group</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.slice(0, 20).map((row, i) => (
                                            <tr key={i}>
                                                <td>{i + 1}</td>
                                                <td>{row.plant_code}</td>
                                                <td>{row.i18n?.vi?.common_name}</td>
                                                <td>{row.i18n?.en?.common_name}</td>
                                                <td>{row.group ?? "—"}</td>
                                            </tr>
                                        ))}
                                        {rows.length > 20 && (
                                            <tr>
                                                <td colSpan={5} className="muted" style={{ textAlign: "center" }}>
                                                    … and {rows.length - 20} more rows
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {progress && (
                        <div className="import-progress">
                            <div className="progress-bar">
                                <div
                                    className="progress-fill"
                                    style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                                />
                            </div>
                            <span className="muted">{progress.done} / {progress.total}</span>
                        </div>
                    )}

                    {done && (
                        <div className="import-result">
                            <p>✅ Created: <strong>{done.created}</strong> &nbsp; ❌ Failed: <strong>{done.failed}</strong></p>
                            {done.errors.length > 0 && (
                                <details>
                                    <summary>Show errors</summary>
                                    <ul className="error-list">
                                        {done.errors.map((e, i) => <li key={i}>{e}</li>)}
                                    </ul>
                                </details>
                            )}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn secondary" onClick={onClose}>Close</button>
                    <button
                        className="btn primary"
                        disabled={rows.length === 0 || backend.importLoading}
                        onClick={() => void handleImport()}
                    >
                        {backend.importLoading ? "Importing…" : `Import ${rows.length} rows`}
                    </button>
                </div>
            </div>
        </div>
    );
}
