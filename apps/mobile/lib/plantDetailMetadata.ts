import { isPropagationMethod } from '../../../packages/shared/src/plantPropagation';

type NamedCode = { code: string; label?: string };

export type AdaptationGroups = Partial<Record<
  'temperature' | 'moisture' | 'climate' | 'season',
  NamedCode[]
>>;

export function flattenAdaptationLabels(adaptation?: AdaptationGroups): string[] {
  if (!adaptation) return [];
  return ['temperature', 'moisture', 'climate', 'season'].flatMap((dimension) =>
    (adaptation[dimension as keyof AdaptationGroups] ?? [])
      .map((term) => term.label?.trim() || term.code?.trim())
      .filter(Boolean),
  );
}

export function propagationMethodCodeFromUrl(url: string): string | null {
  const match = /^richfarm:\/\/propagation\/([a-z][a-z0-9_]*)\/?$/.exec(url.trim());
  const code = match?.[1];
  return code && isPropagationMethod(code) ? code : null;
}
