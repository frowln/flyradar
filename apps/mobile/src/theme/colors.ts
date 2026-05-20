import { collectionsStore } from '../core/gamification/collections';

const dark = {
  bg: '#0A0B14',
  surface: '#13151F',
  surfaceElevated: '#1C1F2E',
  surfaceTinted: '#1A2A4E',
  primary: '#5E8BFF',
  primaryDim: '#3D5BA8',
  accent: '#FFB547',
  accentDim: '#A8762E',
  text: '#F5F6FA',
  textMuted: '#8B95B0',
  textDim: '#6B7290',
  success: '#34D399',
  error: '#FB7185',
  warning: '#FBBF24',
  border: '#252A3D',
  borderSubtle: '#1A1D2B',
  glow: 'rgba(94, 139, 255, 0.15)'
};

const light = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#F0F4F9',
  surfaceTinted: '#EEF3FF',
  primary: '#1A6CF5',
  primaryDim: '#1250B8',
  accent: '#E0A800',
  accentDim: '#A87A00',
  text: '#0A0E1A',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',
  success: '#15803D',
  error: '#DC2626',
  warning: '#D97706',
  border: '#E5E7EB',
  borderSubtle: '#F3F4F6',
  glow: 'rgba(26, 108, 245, 0.10)'
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
