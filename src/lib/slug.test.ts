import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('transliterates Lithuanian letters', () => {
    expect(slugify('Šablonas avilių rėmams', '2026-11-13')).toBe('sablonas-aviliu-remams');
    expect(slugify('Ąžuolas, ęė į ū!', '2026-11-13')).toBe('azuolas-ee-i-u');
  });

  it('collapses spaces and hyphens and trims them', () => {
    expect(slugify('  --Hello   World--  ', '2026-11-13')).toBe('hello-world');
  });

  it('falls back to a dated slug when nothing is left', () => {
    expect(slugify('!!!', '2026-11-13')).toBe('irasas-2026-11-13');
    expect(slugify('', '2026-11-13')).toBe('irasas-2026-11-13');
  });
});

describe('uniqueSlug', () => {
  it('keeps a free slug', () => {
    expect(uniqueSlug('medus', new Set())).toBe('medus');
  });

  it('adds the next free number', () => {
    expect(uniqueSlug('medus', new Set(['medus', 'medus-2']))).toBe('medus-3');
  });
});
