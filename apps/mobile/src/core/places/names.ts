import type { POI, POITranslation, PlaceQuestion } from '@skyatlas/shared';
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

export interface PlaceText {
  summary: string;
  tagline?: string;
  /** Set when the text is not in the reader's language (it is then English). */
  textLang?: string;
  facts: string[];
  /** What to look for from the window — only in texts written for SkyAtlas. */
  look?: string;
  quiz?: PlaceQuestion;
  era?: string;
}

export function placeText(poi: POI, locale: string): PlaceText {
  const tr: POITranslation | undefined = poi.translations?.[lang(locale)];
  if (tr?.summary) return { summary: tr.summary, tagline: tr.tagline, facts: tr.facts ?? [], look: tr.look, quiz: tr.quiz, era: tr.era };
  const english = lang(locale) === 'en';
  return {
    summary: poi.summary,
    tagline: poi.tagline,
    textLang: poi.summary ? (poi.textLang ?? (english ? undefined : 'en')) : undefined,
    facts: poi.facts ?? [],
    // Written notes in English are not offered to readers of other languages.
    look: english ? poi.look : undefined,
    quiz: english ? poi.quiz : undefined,
    era: poi.era
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
