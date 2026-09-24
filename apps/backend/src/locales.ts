/**
 * Languages the product ships in, and therefore the only ones the backend will
 * ever ask Wikipedia about.
 *
 * The locale arrives from the client and ends up in a hostname
 * (`https://${lang}.wikipedia.org/...`). Accepting any string there let a
 * caller point the server's outbound requests at a host of their choosing, so
 * the set is closed rather than merely well-formed.
 */
export const SUPPORTED_LOCALES = ['en', 'ru', 'de', 'fr', 'es', 'ja'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Anything unrecognised reads as English rather than failing the request. */
export function toSupportedLocale(value: unknown): SupportedLocale {
  if (typeof value !== 'string') return 'en';
  // "en-US", "pt_BR" and an Accept-Language list ("ru,en;q=0.9") all lead
  // with the primary language subtag.
  const base = value.trim().toLowerCase().split(/[-_,;\s]/)[0];
  return isSupportedLocale(base) ? base : 'en';
}
