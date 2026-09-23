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

/**
 * What happens when a key is missing anywhere in the app.
 *
 * `scripts/check-i18n.mjs` catches keys written as literals, but it cannot see
 * one assembled from a variable — `t(`paywall.${tier.note}`)` shipped three
 * visible `[missing …]` strings straight onto the price rows. Static analysis
 * will never close that hole; the runtime sees every key.
 *
 * In development the miss is loud. In production it degrades to the humanised
 * last segment of the key, because a passenger reading "Per Flight Note" has
 * merely seen an awkward label, while `[missing "en.paywall.perFlightNote"
 * translation]` reads as a broken app.
 */
i18n.missingTranslation.register('humanise', (_i18n, scope) => {
  const key = String(scope);
  if (__DEV__) {
    console.error(`[i18n] missing key "${key}" for locale "${i18n.locale}"`);
  }
  const leaf = key.split('.').pop() ?? key;
  return leaf.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
});
i18n.missingBehavior = 'humanise';

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
