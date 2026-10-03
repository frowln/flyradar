import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import liberty from './styles/liberty.json';
import dark from './styles/dark.json';

/**
 * The basemap styles, in the reader's language.
 *
 * OpenFreeMap's styles label everything in Latin script plus the local name
 * ("Moskva / Москва", "Volga"). The tiles carry `name:ru`, `name:de` and the
 * other OpenStreetMap translations, so a Russian reader can get "Волга" and a
 * Japanese one "ボルガ川": every label expression is replaced by one that
 * prefers the reader's language, then English, then the local name.
 *
 * The styles ship with the app (src/core/map/styles/, from OpenFreeMap's
 * published style repository) and point at the same tile, glyph and sprite
 * addresses as the hosted ones, so the corridor packs downloaded for those
 * addresses serve them offline.
 */

type Style = StyleSpecification & { layers: Array<{ layout?: Record<string, unknown> }> };

/** A label expression that reads the feature's name, in any of the styles' forms. */
function isNameField(field: unknown): boolean {
  const text = JSON.stringify(field ?? '');
  return /name(:latin|:nonlatin|_en|_int)?["}]/.test(text) || text.includes('{name');
}

export function nameExpression(lang: string): unknown[] {
  const order = lang === 'en' ? ['name_en', 'name:latin', 'name'] : [`name:${lang}`, 'name_en', 'name:latin', 'name'];
  return ['coalesce', ...order.map((k) => ['get', k])];
}

const cache = new Map<string, StyleSpecification>();

export function localizedStyle(night: boolean, lang: string): StyleSpecification {
  const key = `${night ? 'dark' : 'liberty'}:${lang}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = JSON.parse(JSON.stringify(night ? dark : liberty)) as Style;
  const name = nameExpression(lang);
  for (const layer of base.layers) {
    const field = layer.layout?.['text-field'];
    if (layer.layout && isNameField(field)) layer.layout['text-field'] = name;
  }
  cache.set(key, base);
  return base;
}
