import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import { en } from './locales/en';
import { ru } from './locales/ru';
import { de } from './locales/de';
import { fr } from './locales/fr';
import { es } from './locales/es';
import { ja } from './locales/ja';
import { collectionsStore } from '../core/gamification/collections';

const SUPPORTED_LOCALES = ['en', 'ru', 'de', 'fr', 'es', 'ja'] as const;
type SupportedLocale = typeof SUPPORTED_LOCALES[number];

const i18n = new I18n({ en, ru, de, fr, es, ja });

i18n.enableFallback = true;
i18n.defaultLocale = 'en';

const savedLocale = collectionsStore.getLanguage();
const deviceLocale = Localization.getLocales()[0]?.languageCode ?? 'en';
const resolvedDevice = (SUPPORTED_LOCALES as readonly string[]).includes(deviceLocale) ? deviceLocale : 'en';
i18n.locale = savedLocale ?? resolvedDevice;

export function setLocale(locale: string): void {
  i18n.locale = locale;
  collectionsStore.setLanguage(locale);
}

export function getLocale(): string {
  return i18n.locale;
}

export function t(key: string, opts?: Record<string, unknown>): string {
  return i18n.t(key, opts);
}

export { SUPPORTED_LOCALES };
export type { SupportedLocale };
export default i18n;
