/**
 * Public pages the app links to.
 *
 * The App Store needs the privacy policy at a public URL. Until one is set
 * (EXPO_PUBLIC_PRIVACY_URL / EXPO_PUBLIC_TERMS_URL), the documents in the
 * repository are used. Either way a Russian interface gets the Russian page:
 * `privacy.html` → `privacy-ru.html`, as the landing site names them.
 */

const REPO_DOCS = 'https://github.com/frowln/flyradar/blob/main/docs/legal';

export function legalUrl(doc: 'privacy' | 'terms', locale: string): string {
  const override = doc === 'privacy' ? process.env['EXPO_PUBLIC_PRIVACY_URL'] : process.env['EXPO_PUBLIC_TERMS_URL'];
  const ru = locale.startsWith('ru');
  if (override) return ru ? override.replace(/\.html$/, '-ru.html') : override;
  const file = doc === 'privacy' ? 'privacy-policy' : 'terms-of-service';
  return `${REPO_DOCS}/${file}${ru ? '.ru' : ''}.md`;
}
