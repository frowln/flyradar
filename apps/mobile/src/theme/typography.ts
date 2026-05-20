import { StyleSheet } from 'react-native';
import { colors } from './colors';

export const fonts = {
  display: 'Fraunces_900Black',
  displayBold: 'Fraunces_700Bold',
  displayRegular: 'Fraunces_400Regular',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_700Bold',
  bodySemi: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium'
};

export const typography = StyleSheet.create({
  // Display — Fraunces for hero moments
  hero: { fontFamily: fonts.display, fontSize: 56, lineHeight: 60, letterSpacing: -2, color: colors.text },
  display: { fontFamily: fonts.display, fontSize: 42, lineHeight: 46, letterSpacing: -1.5, color: colors.text },
  h1: { fontFamily: fonts.displayBold, fontSize: 32, lineHeight: 38, letterSpacing: -0.8, color: colors.text },
  h2: { fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, color: colors.text },
  h3: { fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 24, color: colors.text },
  // Body — Inter
  bodyLarge: { fontFamily: fonts.body, fontSize: 17, lineHeight: 25, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
  bodySmall: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  // UI
  button: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: colors.textMuted },
  caption: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  // Mono — aviation data
  mono: { fontFamily: fonts.mono, fontSize: 14, color: colors.text },
  monoLarge: { fontFamily: fonts.monoMedium, fontSize: 28, letterSpacing: -0.5, color: colors.text },
  monoSmall: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted }
});
