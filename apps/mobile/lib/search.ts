export function normalizeSearchText(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function tokenizeSearchQuery(query: string): string[] {
    if (!query) return [];
    const normalized = normalizeSearchText(query);
    if (!normalized) return [];
    return normalized.split(' ').filter(Boolean);
}

export function matchesSearch(query: string, fields: Array<string | null | undefined>): boolean {
    const tokens = tokenizeSearchQuery(query);
    if (tokens.length === 0) return true;
    const haystack = normalizeSearchText(fields.filter(Boolean).join(' '));
    return tokens.every((token) => haystack.includes(token));
}
