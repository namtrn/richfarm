import { describe, expect, it } from 'vitest';
import { propagationMethodCodeFromUrl } from '../lib/plantDetailMetadata';

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
