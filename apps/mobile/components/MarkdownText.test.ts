import { describe, expect, it } from 'vitest';
import { propagationMethodCodeFromUrl } from '../lib/plantDetailMetadata';
import { resolveMarkdownLinkAction } from '../lib/pestDiseaseRouting';

describe('Markdown propagation deep links', () => {
  it('recognizes stable propagation method links', () => {
    expect(propagationMethodCodeFromUrl('richfarm://propagation/stem_cutting')).toBe('stem_cutting');
    expect(propagationMethodCodeFromUrl('richfarm://propagation/seed/')).toBe('seed');
  });

  it('does not claim unrelated or malformed links', () => {
    expect(propagationMethodCodeFromUrl('https://example.com')).toBeNull();
    expect(propagationMethodCodeFromUrl('richfarm://propagation/Stem Cutting')).toBeNull();
    expect(propagationMethodCodeFromUrl('richfarm://propagation/not_canonical')).toBeNull();
  });
});

describe('Markdown app-link routing', () => {
  it('routes supported pest/disease links without handing them to the OS', () => {
    expect(resolveMarkdownLinkAction('richfarm://pests-diseases/leaf_spot?locale=vi')).toEqual({
      type: 'pest_disease',
      key: 'leaf_spot',
      locale: 'vi',
    });
  });

  it('opens only supported external links and ignores unknown schemes', () => {
    expect(resolveMarkdownLinkAction('https://example.com/guide')).toEqual({
      type: 'external',
      url: 'https://example.com/guide',
    });
    expect(resolveMarkdownLinkAction('richfarm://unsupported/thing')).toEqual({
      type: 'ignored',
      url: 'richfarm://unsupported/thing',
    });
  });
});
