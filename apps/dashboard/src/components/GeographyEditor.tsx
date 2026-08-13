import { useEffect, useMemo, useState } from "react";
import { listCountries } from "../../../../packages/shared/src/countries";
import { ADAPTATION_DIMENSIONS } from "../../../../packages/shared/src/adaptationTerms";
import type { PlantFormState, ResolvedGeography } from "../types";
import type { AuthedFetch } from "../constants";

type MirrorTerm = {
    code: string;
    dimension: string;
    status: string;
    sortOrder: number;
    usageCount: number;
    translations: Array<{ locale: string; label: string; description?: string; translationStatus: string }>;
};

const DIMENSION_LABELS: Record<string, string> = {
    temperature: "Temperature",
    moisture: "Moisture",
    climate: "Climate",
    season: "Season",
};

const COUNTRY_OPTIONS = listCountries("en").map((country) => ({
    code: country.code,
    name: country.name,
}));

function labelFor(term: MirrorTerm, locale: string): string {
    return term.translations.find((translation) => translation.locale === locale)?.label
        ?? term.translations.find((translation) => translation.locale === "en")?.label
        ?? term.code;
}

function categoryChip({
    label,
    source,
    count,
}: {
    label: string;
    source: "own" | "inherited" | "none";
    count: number;
}) {
    const className = source === "own"
        ? "geo-chip geo-chip-own"
        : source === "inherited"
            ? "geo-chip geo-chip-inherited"
            : "geo-chip geo-chip-none";
    return (
        <span key={label} className={className}>
            {label}: {source === "none" ? "none" : `${count} value(s), ${source}`}
        </span>
    );
}

export function GeographyEditor({
    form,
    onChange,
    authedFetch,
    resolved,
    isCultivar,
}: {
    form: PlantFormState;
    onChange: (patch: Partial<PlantFormState>) => void;
    authedFetch: AuthedFetch;
    resolved?: ResolvedGeography;
    isCultivar: boolean;
}) {
    const [mirrorTerms, setMirrorTerms] = useState<MirrorTerm[]>([]);
    const [mirrorError, setMirrorError] = useState("");
    const [countrySearch, setCountrySearch] = useState("");

    useEffect(() => {
        let cancelled = false;
        authedFetch("/api/adaptation-terms")
            .then((response) => response.json().catch(() => ({})))
            .then((body) => {
                if (cancelled) return;
                if (!body.data) {
                    setMirrorError(body.error ?? "Cannot load adaptation terms");
                    return;
                }
                setMirrorTerms((body.data as MirrorTerm[]).filter((term) => term.status === "active"));
            })
            .catch(() => {
                if (!cancelled) setMirrorError("Cannot load adaptation terms");
            });
        return () => {
            cancelled = true;
        };
    }, [authedFetch]);

    const matchedCountries = useMemo(() => {
        const query = countrySearch.trim().toLowerCase();
        if (!query) return [];
        return COUNTRY_OPTIONS
            .filter((country) =>
                country.name.toLowerCase().includes(query) || country.code.toLowerCase().includes(query),
            )
            .slice(0, 40);
    }, [countrySearch]);

    const activeTermsByDimension = useMemo(() => {
        const grouped: Record<string, MirrorTerm[]> = {};
        for (const dimension of ADAPTATION_DIMENSIONS) grouped[dimension] = [];
        for (const term of mirrorTerms) {
            if (grouped[term.dimension]) grouped[term.dimension].push(term);
        }
        return grouped;
    }, [mirrorTerms]);

    function toggleOrigin(code: string) {
        const next = form.originCountries.includes(code)
            ? form.originCountries.filter((item) => item !== code)
            : [...form.originCountries, code];
        onChange({ originCountries: next });
    }

    function updateProvenRegion(index: number, patch: Partial<{ country_code: string; subdivision_code: string }>) {
        onChange({
            provenRegions: form.provenRegions.map((region, regionIndex) =>
                regionIndex === index ? { ...region, ...patch } : region,
            ),
        });
    }

    function toggleTerm(code: string) {
        const next = form.adaptationTermCodes.includes(code)
            ? form.adaptationTermCodes.filter((item) => item !== code)
            : [...form.adaptationTermCodes, code];
        onChange({ adaptationTermCodes: next });
    }

    function overrideFromResolved() {
        if (!resolved) return;
        const patch: Partial<PlantFormState> = {};
        if (resolved.origin_country_source !== "own") {
            patch.originCountries = resolved.origin_country_codes;
        }
        if (resolved.proven_region_source !== "own") {
            patch.provenRegions = resolved.proven_regions;
        }
        if (resolved.adaptation_term_source !== "own") {
            patch.adaptationTermCodes = resolved.adaptation_term_codes;
        }
        onChange(patch);
    }

    const hasInherited = resolved && (
        resolved.origin_country_source === "inherited"
        || resolved.proven_region_source === "inherited"
        || resolved.adaptation_term_source === "inherited"
    );

    return (
        <div className="geography-editor">
            <p className="form-preview muted">
                Origin is where the variety was developed, not a suitability claim. Proven regions are
                evidence of successful growing, not an exhaustive allowlist. Unlisted countries are
                unknown, not unsuitable.
            </p>

            {isCultivar && resolved && (
                <div className="geo-inheritance">
                    <div className="field-label">Inherited from base species (resolved values)</div>
                    <div className="geo-chips">
                        {categoryChip({ label: "Origin", source: resolved.origin_country_source, count: resolved.origin_country_codes.length })}
                        {categoryChip({ label: "Proven regions", source: resolved.proven_region_source, count: resolved.proven_regions.length })}
                        {categoryChip({ label: "Adaptation", source: resolved.adaptation_term_source, count: resolved.adaptation_term_codes.length })}
                    </div>
                    {hasInherited && (
                        <button
                            className="btn secondary small"
                            type="button"
                            onClick={overrideFromResolved}
                        >
                            Override: copy resolved values to own
                        </button>
                    )}
                </div>
            )}

            <div className="geo-block">
                <div className="field-label">Origin countries</div>
                <div className="geo-chips">
                    {form.originCountries.map((code) => {
                        const country = COUNTRY_OPTIONS.find((item) => item.code === code);
                        return (
                            <span key={code} className="geo-chip geo-chip-selected">
                                {country ? `${country.name} (${code})` : code}
                                <button
                                    className="geo-chip-remove"
                                    type="button"
                                    aria-label={`Remove ${code}`}
                                    onClick={() => toggleOrigin(code)}
                                >
                                    ×
                                </button>
                            </span>
                        );
                    })}
                </div>
                <input
                    className="search-input"
                    placeholder="🔍 Search country name or code…"
                    value={countrySearch}
                    onChange={(event) => setCountrySearch(event.target.value)}
                />
                {countrySearch.trim() && (
                    <div className="geo-search-results">
                        {matchedCountries.length === 0 && <p className="muted small">No countries match.</p>}
                        {matchedCountries.map((country) => (
                            <button
                                key={country.code}
                                className="geo-search-result"
                                type="button"
                                onClick={() => {
                                    toggleOrigin(country.code);
                                    setCountrySearch("");
                                }}
                            >
                                {form.originCountries.includes(country.code) ? "✓ " : ""}
                                {country.name} ({country.code})
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="geo-block">
                <div className="field-label">Proven regions</div>
                {form.provenRegions.map((region, index) => (
                    <div className="geo-proven-row" key={`proven-${index}`}>
                        <select
                            aria-label={`Proven region country ${index + 1}`}
                            value={region.country_code}
                            onChange={(event) => updateProvenRegion(index, { country_code: event.target.value })}
                        >
                            <option value="">— select country —</option>
                            {COUNTRY_OPTIONS.map((country) => (
                                <option key={country.code} value={country.code}>
                                    {country.name} ({country.code})
                                </option>
                            ))}
                        </select>
                        <input
                            aria-label={`Proven region subdivision ${index + 1}`}
                            placeholder="Subdivision code (optional), e.g. HCM"
                            value={region.subdivision_code ?? ""}
                            onChange={(event) => updateProvenRegion(index, { subdivision_code: event.target.value })}
                        />
                        <button
                            className="btn secondary small"
                            type="button"
                            onClick={() => onChange({ provenRegions: form.provenRegions.filter((_, itemIndex) => itemIndex !== index) })}
                        >
                            Remove
                        </button>
                    </div>
                ))}
                <button
                    className="btn secondary small"
                    type="button"
                    onClick={() => onChange({ provenRegions: [...form.provenRegions, { country_code: "" }] })}
                >
                    Add proven region
                </button>
            </div>

            <div className="geo-block">
                <div className="field-label">Adaptation</div>
                {mirrorError && <p className="error-message">{mirrorError}</p>}
                {ADAPTATION_DIMENSIONS.map((dimension) => {
                    const terms = activeTermsByDimension[dimension];
                    return (
                        <div key={dimension} className="geo-dimension">
                            <div className="geo-dimension-label">{DIMENSION_LABELS[dimension]}</div>
                            {terms.length === 0 ? (
                                <span className="muted small">No active terms (refresh the taxonomy mirror).</span>
                            ) : (
                                <div className="geo-term-grid">
                                    {terms.map((term) => {
                                        const selected = form.adaptationTermCodes.includes(term.code);
                                        return (
                                            <label className="checkbox geo-term-option" key={term.code}>
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() => toggleTerm(term.code)}
                                                />
                                                {labelFor(term, "vi")} / {labelFor(term, "en")}
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
