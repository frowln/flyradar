import type { POI, POITranslation } from '@skyatlas/shared';
import { countryByCode } from '../data/datasets';
import type { DataLang } from '../data/types';

/** A place's name, story and tagline in the reader's language, falling back to the base text. */

type Lang = keyof NonNullable<POI['translations']>;

function lang(locale: string): Lang {
  return locale.slice(0, 2) as Lang;
}

export function placeName(poi: POI, locale: string): string {
  const name = poi.translations?.[lang(locale)]?.name || poi.name;
  // French and Spanish write the generic word in lower case ("mont Blanc",
  // "mar Negro"); the app shows names as titles and list entries.
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

export function placeText(poi: POI, locale: string): { summary: string; tagline?: string; textLang?: string; facts: string[] } {
  const tr: POITranslation | undefined = poi.translations?.[lang(locale)];
  if (tr?.summary) return { summary: tr.summary, tagline: tr.tagline, facts: tr.facts ?? [] };
  return {
    summary: poi.summary,
    tagline: poi.tagline,
    textLang: poi.summary ? (poi.textLang ?? (lang(locale) === 'en' ? undefined : 'en')) : undefined,
    facts: poi.facts ?? []
  };
}

export function countryName(cc: string, locale: string): string {
  try {
    const c = countryByCode(cc);
    if (!c) return cc;
    const l = lang(locale);
    return (l !== 'en' ? c.l?.[l as DataLang] : undefined) ?? c.n;
  } catch {
    return cc;
  }
}

/** Regional-indicator flag emoji for an ISO code; empty for pseudo-codes. */
export function flagOf(cc: string): string {
  if (!/^[A-Z]{2}$/.test(cc) || cc.startsWith('X')) return '';
  return String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
