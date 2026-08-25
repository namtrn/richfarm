import { propagationMethodCodeFromUrl } from './plantDetailMetadata';

const PEST_DISEASE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const LOCALE_PATTERN = /^[a-z]{2}(?:-[a-z]{2})?$/;

export type PestDiseaseRouteParams = {
  key: string;
  locale?: string;
};

export type PestDiseaseRoute = `/pests-diseases/${string}`;

export type MarkdownLinkAction =
  | { type: 'pest_disease'; key: string; locale?: string }
  | { type: 'propagation'; methodCode: string }
  | { type: 'external'; url: string }
  | { type: 'ignored'; url: string };

function decodePart(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function normalizeLocale(value: string | undefined): string | undefined | null {
  if (value === undefined) return undefined;
  const locale = decodePart(value)?.trim().toLowerCase();
  if (!locale || !LOCALE_PATTERN.test(locale)) return null;
  return locale;
}

/** Parse only the app-owned pest/disease URL shape; never treat arbitrary URLs as keys. */
export function parsePestDiseaseDeepLink(url: string): PestDiseaseRouteParams | null {
  const match = /^richfarm:\/\/pests-diseases\/([^/?#]+)\/?(?:\?([^#]*))?$/i.exec(url.trim());
  if (!match) return null;
  const key = decodePart(match[1])?.trim().toLowerCase();
  if (!key || !PEST_DISEASE_KEY_PATTERN.test(key)) return null;

  let locale: string | undefined;
  if (match[2] !== undefined) {
    const localeParam = match[2]
      .split('&')
      .map((part) => part.split('='))
      .find(([name]) => name?.toLowerCase() === 'locale')?.[1];
    const normalizedLocale = normalizeLocale(localeParam);
    if (normalizedLocale === null) return null;
    locale = normalizedLocale;
  }
  return locale ? { key, locale } : { key };
}

export function normalizePestDiseaseRouteParam(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  const key = candidate?.trim().toLowerCase();
  return key && PEST_DISEASE_KEY_PATTERN.test(key) ? key : null;
}

export function normalizePestDiseaseLocaleParam(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  const locale = candidate?.trim().toLowerCase();
  return locale && LOCALE_PATTERN.test(locale) ? locale : null;
}

export function pestDiseasePath(key: string, locale?: string): PestDiseaseRoute {
  const encodedKey = encodeURIComponent(key.trim().toLowerCase());
  const suffix = locale && LOCALE_PATTERN.test(locale.trim().toLowerCase())
    ? `?locale=${encodeURIComponent(locale.trim().toLowerCase())}`
    : '';
  return `/pests-diseases/${encodedKey}${suffix}` as PestDiseaseRoute;
}

export function resolveMarkdownLinkAction(url: string): MarkdownLinkAction {
  const trimmed = url.trim();
  const pestDisease = parsePestDiseaseDeepLink(trimmed);
  if (pestDisease) return { type: 'pest_disease', ...pestDisease };

  const methodCode = propagationMethodCodeFromUrl(trimmed);
  if (methodCode) return { type: 'propagation', methodCode };

  if (/^https?:\/\//i.test(trimmed)) return { type: 'external', url: trimmed };
  return { type: 'ignored', url: trimmed };
}
