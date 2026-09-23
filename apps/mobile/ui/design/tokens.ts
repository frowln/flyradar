/**
 * SkyAtlas design system — tokens.
 *
 * Direction: instrument. The product is read in a dark cabin at cruise, by
 * someone who wants two things — a number they can trust, and a place they can
 * look at. Everything here serves those two.
 *
 * Rules the tokens enforce:
 *   · One accent. Amber carries "now / active / discovered" and nothing else.
 *   · Neutrals are warmed toward the accent; there is no pure grey and no pure black.
 *   · Depth comes from brightness, rule and size. There are no shadows.
 *   · Every spacing value comes from the 4pt scale.
 */

export const palette = {
  // Grounds — each step a deliberate brightness increment (≤12% apart).
  void: '#080A0C', // behind everything; used under maps and full-bleed media
  ground: '#0B0E11',
  raised: '#12161B',
  lifted: '#191E25',
  warm: '#1A1712', // accent-tinted surface, for anything "collected"

  // Rules do the work shadows would on a light UI.
  rule: '#242B34',
  ruleSoft: '#181D24',

  // Three text tiers, each of which must clear WCAG AA (4.5:1) on the brightest
  // ground it can sit on — `lifted`. The first draft ran ink/#7C8797/#555F6E,
  // and the dim tier measured 2.6:1: section labels like "ПОД КРЫЛОМ" were below
  // the legibility floor on every screen. The scale was shifted up one step
  // rather than dropped to two tiers. `__tests__/design/contrast.test.ts` holds
  // this; a value that fails it is a bug, not a preference.
  ink: '#E9EEF4', // 14.4:1 on lifted
  inkMuted: '#9AA5B4', // 6.7:1
  inkDim: '#7C8797', // 4.6:1

  // The single accent: instrument amber, the one hue that survives night vision.
  amber: '#FF9E3D',
  amberDim: '#A8672A',
  amberWash: 'rgba(255, 158, 61, 0.12)',

  // Status only — never decoration.
  good: '#4ADE80',
  warn: '#FBBF24',
  bad: '#F87171',

  // Brass is reserved for collection objects: plate numbers, country stamps.
  brass: '#C9A227'
} as const;

/** 4pt scale. A value outside this set is a bug, not a judgement call. */
export const s = {
  x1: 4,
  x2: 8,
  x3: 12,
  x4: 16,
  x5: 20,
  x6: 24,
  x8: 32,
  x10: 40,
  x12: 48,
  x16: 64
} as const;

/** Screen gutter. Every full-width surface uses this and nothing else. */
export const gutter = s.x5;

export const radius = {
  /** The instrument language does not round. Cells, rules and readouts are square. */
  none: 0,
  /** Only media and sheets round, because physical things with edges do. */
  media: 10,
  sheet: 22,
  full: 999
} as const;

export const line = {
  hair: 1,
  /** A heavier rule, for the one division on a screen that must be felt. */
  bold: 2
} as const;

export const motion = {
  /** Press feedback, toggles. */
  tap: 140,
  /** Anything entering or leaving the screen. */
  move: 260,
  /** A place resolving into view — the one moment given real time. */
  reveal: 420,
  /** Standard curve: fast out, settles long. */
  ease: [0.2, 0, 0, 1] as [number, number, number, number],
  /** For values counting up or down. */
  count: 700
} as const;

/** Font families. Verified for Latin, Cyrillic and Western diacritics in CI. */
export const family = {
  display: 'Manrope_800ExtraBold',
  displayMid: 'Manrope_700Bold',
  displaySoft: 'Manrope_600SemiBold',
  text: 'Inter_400Regular',
  textMid: 'Inter_500Medium',
  textStrong: 'Inter_600SemiBold',
  data: 'JetBrainsMono_400Regular',
  dataMid: 'JetBrainsMono_500Medium'
} as const;

/** Japanese carries none of the above; the ja locale swaps these in. */
export const familyJa = {
  display: 'NotoSansJP_700Bold',
  displayMid: 'NotoSansJP_700Bold',
  displaySoft: 'NotoSansJP_500Medium',
  text: 'NotoSansJP_400Regular',
  textMid: 'NotoSansJP_500Medium',
  textStrong: 'NotoSansJP_500Medium',
  data: 'JetBrainsMono_400Regular',
  dataMid: 'JetBrainsMono_500Medium'
} as const;

export type FamilyRole = keyof typeof family;
