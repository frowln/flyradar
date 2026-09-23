import { Text as RNText, type TextProps, type TextStyle, StyleSheet } from 'react-native';
import { palette, family, familyJa, type FamilyRole } from './tokens';
import { getLocale } from '../../src/i18n';

/**
 * Typographic primitives.
 *
 * Screens never set fontFamily or fontSize directly — they pick a role. That is
 * what keeps a type scale a scale instead of a suggestion, and it is why the
 * Japanese font swap below is invisible to every screen in the app.
 */

function fam(role: FamilyRole): string {
  return getLocale().startsWith('ja') ? familyJa[role] : family[role];
}

type Tone = 'default' | 'muted' | 'dim' | 'accent' | 'brass' | 'good' | 'bad';

const tones: Record<Tone, string> = {
  default: palette.ink,
  muted: palette.inkMuted,
  dim: palette.inkDim,
  accent: palette.amber,
  brass: palette.brass,
  good: palette.good,
  bad: palette.bad
};

interface Props extends TextProps {
  tone?: Tone;
  children?: React.ReactNode;
}

function make(role: FamilyRole, base: TextStyle, defaultTone: Tone = 'default') {
  return function Typed({ tone = defaultTone, style, ...rest }: Props) {
    return <RNText {...rest} style={[base, { fontFamily: fam(role), color: tones[tone] }, style]} />;
  };
}

/** Screen-defining statements. One per screen, at most. */
export const Display = make('display', {
  fontSize: 36,
  lineHeight: 40,
  letterSpacing: -0.9
});

/** Section and place names. */
export const Title = make('displayMid', {
  fontSize: 22,
  lineHeight: 28,
  letterSpacing: -0.3
});

export const Body = make('text', {
  fontSize: 15,
  lineHeight: 22
});

export const BodyLarge = make('text', {
  fontSize: 17,
  lineHeight: 26
});

export const Small = make('text', { fontSize: 13, lineHeight: 19 }, 'muted');

/**
 * The instrument voice: uppercase mono, widely tracked. Used for every label on
 * every screen, which is what makes unrelated screens feel like one machine.
 */
export const Label = make(
  'dataMid',
  {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase'
  },
  'muted'
);

/** Any number that can change. Tabular so digits never shift under a label. */
export const Data = make('data', {
  fontSize: 16,
  lineHeight: 20,
  fontVariant: ['tabular-nums']
});

export const DataSmall = make(
  'data',
  { fontSize: 11, lineHeight: 14, letterSpacing: 0.2, fontVariant: ['tabular-nums'] },
  'muted'
);

/** The one number a screen exists to show. */
export const Readout = make('dataMid', {
  fontSize: 38,
  lineHeight: 40,
  letterSpacing: -1.4,
  fontVariant: ['tabular-nums']
});

/** Airport codes: sized to be read across a seatback, not tapped. */
export const Code = make('dataMid', {
  fontSize: 34,
  lineHeight: 38,
  letterSpacing: -0.4,
  fontVariant: ['tabular-nums']
});

export const typeStyles = StyleSheet.create({
  /** Running text should not exceed ~65 characters; this caps it on wide screens. */
  measure: { maxWidth: 460 }
});
