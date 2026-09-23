import { collectionsStore } from '../core/gamification/collections';
import { palette, type PaletteName } from './tokens';

/**
 * Runtime colour access.
 *
 * Screens read `colors.x` and get the value for the active theme. The legacy
 * names below (primary, surfaceElevated, glow, …) are kept as aliases onto the
 * token set so the existing screens keep compiling while they migrate; new code
 * should use the token names directly.
 *
 * `primary` deliberately resolves to the accent: the product has one accent, and
 * the old blue is gone.
 */
function resolve(name: PaletteName) {
  const p = palette[name];
  return {
    // Tokens
    bg: p.bg,
    surface: p.surface,
    surfaceHigh: p.surfaceHigh,
    surfaceTinted: p.surfaceTinted,
    line: p.line,
    lineSoft: p.lineSoft,
    text: p.text,
    textMuted: p.textMuted,
    textDim: p.textDim,
    accent: p.accent,
    accentDim: p.accentDim,
    accentSoft: p.accentSoft,
    positive: p.positive,
    warning: p.warning,
    negative: p.negative,
    collect: p.collect,

    // Legacy aliases — remove as screens migrate to the token names.
    primary: p.accent,
    primaryDim: p.accentDim,
    surfaceElevated: p.surfaceHigh,
    border: p.line,
    borderSubtle: p.lineSoft,
    success: p.positive,
    error: p.negative,
    glow: p.accentSoft
  };
}

const themes = {
  dark: resolve('dark'),
  light: resolve('light')
} as const;

export type ThemeName = PaletteName;
export type Colors = (typeof themes)['dark'];

let currentTheme: ThemeName = (collectionsStore.getTheme?.() as ThemeName) || 'dark';

export const colors = new Proxy({} as Colors, {
  get(_, key: string) {
    return (themes[currentTheme] as Record<string, string>)[key];
  },
  // Keeps Object.keys(colors) and spread working for tests and debug tooling.
  ownKeys() {
    return Reflect.ownKeys(themes[currentTheme]);
  },
  getOwnPropertyDescriptor(_, key) {
    return {
      value: (themes[currentTheme] as Record<string, string>)[key as string],
      enumerable: true,
      configurable: true
    };
  }
});

export function setTheme(theme: ThemeName) {
  currentTheme = theme;
  collectionsStore.setTheme?.(theme);
}

export function getTheme(): ThemeName {
  return currentTheme;
}
