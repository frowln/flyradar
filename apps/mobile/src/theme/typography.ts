import type { TextStyle } from 'react-native';
import { colors } from './colors';
import { getLocale } from '../i18n';

/**
 * Type system.
 *
 * Three families, no more:
 *   display — Manrope        headings, place names
 *   body    — Inter          running text
 *   data    — JetBrains Mono numbers, labels, coordinates, IATA
 *
 * Every one of them is verified to carry Latin, Cyrillic and the Western
 * European diacritics (scripts/check-font-glyphs.mjs runs this in CI).
 *
 * Japanese is the exception: none of the three cover kana or kanji, so the ja
 * locale resolves to Noto Sans JP for display and body. Numerals stay in
 * JetBrains Mono — they are Latin digits in every locale.
 *
 * Fraunces was removed: it ships without Cyrillic, so every Russian heading
 * silently fell back to a system serif.
 */

const LATIN = {
  display: 'Manrope_700Bold',
  displayHeavy: 'Manrope_800ExtraBold',
  displayMedium: 'Manrope_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium'
} as const;

const JAPANESE = {
  ...LATIN,
  display: 'NotoSansJP_700Bold',
  displayHeavy: 'NotoSansJP_700Bold',
  displayMedium: 'NotoSansJP_500Medium',
  body: 'NotoSansJP_400Regular',
  bodyMedium: 'NotoSansJP_500Medium',
  bodySemi: 'NotoSansJP_500Medium',
  bodyBold: 'NotoSansJP_700Bold'
} as const;

export type FontRole = keyof typeof LATIN;

function familyFor(role: FontRole): string {
  const set = getLocale().startsWith('ja') ? JAPANESE : LATIN;
  return set[role];
}

/**
 * Font families resolved against the active locale on every read, so switching
 * language swaps the Japanese faces in without a reload.
 */
export const fonts = new Proxy({} as Record<string, string>, {
  get(_, key: string) {
    // Legacy aliases kept so existing screens compile unchanged.
    const map: Record<string, FontRole> = {
      display: 'displayHeavy',
      displayBold: 'display',
      displayRegular: 'displayMedium',
      displayHeavy: 'displayHeavy',
      displayMedium: 'displayMedium',
      body: 'body',
      bodyMedium: 'bodyMedium',
      bodySemi: 'bodySemi',
      bodyBold: 'bodyBold',
      mono: 'mono',
      monoMedium: 'monoMedium'
    };
    const role = map[key];
    return role ? familyFor(role) : familyFor('body');
  }
}) as Record<
  | 'display'
  | 'displayBold'
  | 'displayRegular'
  | 'displayHeavy'
  | 'displayMedium'
  | 'body'
  | 'bodyMedium'
  | 'bodySemi'
  | 'bodyBold'
  | 'mono'
  | 'monoMedium',
  string
>;

/**
 * The scale. Sizes outside this set are a bug.
 * Large text gets tighter tracking, small text gets looser — the standard
 * optical correction.
 */
type Scale = Record<string, () => TextStyle>;

const scale: Scale = {
  displayL: () => ({
    fontFamily: familyFor('displayHeavy'),
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.7,
    color: colors.text
  }),
  displayM: () => ({
    fontFamily: familyFor('displayHeavy'),
    fontSize: 27,
    lineHeight: 31,
    letterSpacing: -0.55,
    color: colors.text
  }),
  title: () => ({
    fontFamily: familyFor('display'),
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
    color: colors.text
  }),
  bodyLarge: () => ({
    fontFamily: familyFor('body'),
    fontSize: 17,
    lineHeight: 25,
    color: colors.text
  }),
  body: () => ({
    fontFamily: familyFor('body'),
    fontSize: 15,
    lineHeight: 22,
    color: colors.text
  }),
  bodySmall: () => ({
    fontFamily: familyFor('body'),
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted
  }),
  button: () => ({
    fontFamily: familyFor('bodySemi'),
    fontSize: 16,
    lineHeight: 20,
    color: colors.text
  }),
  /** Uppercase mono label — the instrument voice. */
  label: () => ({
    fontFamily: familyFor('monoMedium'),
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textMuted
  }),
  caption: () => ({
    fontFamily: familyFor('body'),
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted
  }),
  /** Headline readings: countdown, altitude. Tabular so digits never jitter. */
  dataLarge: () => ({
    fontFamily: familyFor('monoMedium'),
    fontSize: 34,
    lineHeight: 34,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    color: colors.text
  }),
  data: () => ({
    fontFamily: familyFor('mono'),
    fontSize: 16,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
    color: colors.text
  }),
  dataSmall: () => ({
    fontFamily: familyFor('mono'),
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
    color: colors.textMuted
  })
};

/** Legacy names → scale entries, so the existing screens keep working. */
const aliases: Record<string, keyof typeof scale> = {
  hero: 'displayL',
  display: 'displayL',
  h1: 'displayM',
  h2: 'title',
  h3: 'title',
  mono: 'data',
  monoLarge: 'dataLarge',
  monoSmall: 'dataSmall'
};

/**
 * Styles are resolved on read so both the active theme colour and the active
 * locale's font family are always current.
 */
export const typography = new Proxy({} as Record<string, TextStyle>, {
  get(_, key: string) {
    const entry = scale[key] ?? scale[aliases[key] ?? ''];
    return entry ? entry() : scale.body!();
  }
});
