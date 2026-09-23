/**
 * Design tokens — the single source of truth for colour, spacing, radius and motion.
 *
 * Rules this file encodes (see docs/DESIGN_PLAN.md):
 *  - One accent colour. Amber carries "now / active / discovered" and nothing else.
 *  - Neutrals are tinted toward the accent; there is no pure grey.
 *  - Brightness step between stacked surfaces stays under 12% on dark, 7% on light.
 *  - No shadows on dark UI — depth comes from brightness, line and size.
 */

export const palette = {
  dark: {
    // Grounds. Each step is a deliberate brightness increment, not an arbitrary hex.
    bg: '#0B0E11',
    surface: '#12161B',
    surfaceHigh: '#191E25',
    surfaceTinted: '#1A1712',

    // Lines carry hierarchy where shadows would on a light UI.
    line: '#242B34',
    lineSoft: '#1A1F26',

    text: '#E9EEF4',
    textMuted: '#7C8797',
    textDim: '#556070',

    // The only accent. Instrument amber — the one hue that survives night vision.
    accent: '#FF9E3D',
    accentDim: '#A8672A',
    accentSoft: 'rgba(255, 158, 61, 0.12)',

    // Status only. Never decoration.
    positive: '#4ADE80',
    warning: '#FBBF24',
    negative: '#F87171',

    // Brass — reserved for collection objects (plate numbers, country stamps).
    collect: '#C9A227'
  },

  light: {
    bg: '#FBFAF8',
    surface: '#FFFFFF',
    surfaceHigh: '#F4F2EE',
    surfaceTinted: '#FDF4E8',

    line: '#E2DED7',
    lineSoft: '#EFECE6',

    text: '#14171C',
    textMuted: '#5C6472',
    textDim: '#858D9C',

    // Darker on light ground so the accent keeps 4.5:1 against white.
    accent: '#C46A00',
    accentDim: '#8A4B00',
    accentSoft: 'rgba(196, 106, 0, 0.10)',

    positive: '#15803D',
    warning: '#B45309',
    negative: '#C0392B',

    collect: '#8A6D14'
  }
} as const;

export type PaletteName = keyof typeof palette;
export type ColorToken = keyof typeof palette.dark;

/** 4pt scale. Any spacing value outside this set is a bug. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64
} as const;

/** Screen gutter — every full-width screen uses this, nothing else. */
export const gutter = space.xl - 4; // 20

export const radius = {
  /** Rules, cells, telemetry rows — the instrument language has no rounding. */
  none: 0,
  card: 12,
  sheet: 20,
  pill: 999
} as const;

/** Nested corners: inner radius = outer radius − gap. */
export function innerRadius(outer: number, gap: number): number {
  return Math.max(0, outer - gap);
}

export const motion = {
  micro: 160,
  transition: 240,
  /** POI cards resolve like an instrument reading, not a slide-in. */
  reveal: 400,
  /** Standard easing, expressed as a cubic-bezier for Reanimated/Easing.bezier. */
  easing: [0.2, 0, 0, 1] as const
} as const;

export const hairline = 1;
