import { describe, it, expect } from 'vitest';
import { localizedStyle, nameExpression } from '../../src/core/map/localStyle';

const labels = (style: ReturnType<typeof localizedStyle>) =>
  (style.layers as Array<{ id: string; layout?: Record<string, unknown> }>).filter((l) => l.layout?.['text-field']);

describe('the basemap in the reader’s language', () => {
  it('labels places in Russian first, then English, then the local name', () => {
    const style = localizedStyle(false, 'ru');
    const named = labels(style).filter((l) => JSON.stringify(l.layout!['text-field']).includes('name'));
    expect(named.length).toBeGreaterThan(10);
    for (const l of named) expect(l.layout!['text-field']).toEqual(nameExpression('ru'));
    expect(nameExpression('ru')[1]).toEqual(['get', 'name:ru']);
  });

  it('leaves road numbers alone and keeps the hosted tile addresses for offline packs', () => {
    const style = localizedStyle(false, 'de');
    const refs = labels(style).filter((l) => JSON.stringify(l.layout!['text-field']).includes('"ref"'));
    expect(refs.length).toBeGreaterThan(0);
    expect(JSON.stringify(style.sources)).toContain('https://tiles.openfreemap.org/planet');
    expect(JSON.stringify(style)).not.toContain('__TILEJSON_DOMAIN__');
  });

  it('has a night style with the water layer the hill shading sits under', () => {
    const style = localizedStyle(true, 'en');
    expect((style.layers as Array<{ id: string }>).some((l) => l.id === 'water')).toBe(true);
  });
});
