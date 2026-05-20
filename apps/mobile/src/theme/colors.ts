import { collectionsStore } from '../core/gamification/collections';

const dark = {
  bg: '#0A0E1A',
  surface: '#141A2E',
  surfaceElevated: '#1E2540',
  primary: '#3D8BFD',
  accent: '#FFC857',
  text: '#FFFFFF',
  textMuted: '#8B95B0',
  success: '#34C759',
  error: '#FF453A',
  border: '#2A3252'
};

const light = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#F0F4F9',
  primary: '#1A6CF5',
  accent: '#E0A800',
  text: '#0A0E1A',
  textMuted: '#6B7280',
  success: '#15803D',
  error: '#DC2626',
  border: '#E5E7EB'
};

export type ThemeName = 'dark' | 'light';
let currentTheme: ThemeName = (collectionsStore.getTheme?.() as ThemeName) || 'dark';

export const colors = new Proxy({} as typeof dark, {
  get(_, key: string) {
    return currentTheme === 'dark' ? (dark as any)[key] : (light as any)[key];
  }
});

export function setTheme(theme: ThemeName) {
  currentTheme = theme;
  collectionsStore.setTheme?.(theme);
}

export function getTheme(): ThemeName {
  return currentTheme;
}
