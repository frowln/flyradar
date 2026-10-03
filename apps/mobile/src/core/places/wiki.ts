import type { POI } from '@skyatlas/shared';

/**
 * Stories for the places on a route, fetched on the phone before departure.
 *
 * No server sits in between: the phone asks Wikidata which article describes
 * each place in the reader's language, then fetches that article's summary and
 * lead image from Wikipedia. It runs once, on the ground, while the passenger
 * still has a connection — and every failure along the way is survivable,
 * because a place without a story still has a name, a side and a time.
 *
 * Licensing is handled here rather than left to the screens: text is CC BY-SA,
 * so every card keeps its source URL; images are taken only from Wikimedia
 * Commons (local fair-use images cannot be reused) and carry author and licence.
 */

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

const USER_AGENT = 'SkyAtlas/1.0 (https://github.com/frowln/flyradar; in-flight companion)';
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 4;

async function getJson(fetchImpl: FetchLike, url: string, attempt = 0): Promise<unknown | null> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(url, {
      headers: { 'Api-User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: ctrl?.signal
    });
    if (res.status === 429 || res.status === 503) {
      if (attempt >= 2) return null;
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(8, retryAfter) * 1000 : 1200 * (attempt + 1);
      await new Promise((r) => setTimeout(r, waitMs));
      return getJson(fetchImpl, url, attempt + 1);
    }
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Runs tasks with bounded parallelism, reporting progress. */
async function pool<T>(items: T[], worker: (item: T) => Promise<void>, onEach?: () => void): Promise<void> {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i]!);
      onEach?.();
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
}

interface Sitelinks {
  [qid: string]: Partial<Record<string, string>>;
}

/** Article titles per language for each Wikidata id, 50 ids per request. */
export async function resolveTitles(fetchImpl: FetchLike, qids: string[], langs: string[]): Promise<Sitelinks> {
  const out: Sitelinks = {};
  const sites = langs.map((l) => `${l}wiki`).join('|');
  for (let i = 0; i < qids.length; i += 50) {
    const batch = qids.slice(i, i + 50);
    const url =
      'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=sitelinks' +
      `&sitefilter=${encodeURIComponent(sites)}&ids=${batch.join('|')}`;
    const data = (await getJson(fetchImpl, url)) as {
      entities?: Record<string, { sitelinks?: Record<string, { title?: string }> }>;
    } | null;
    for (const [qid, ent] of Object.entries(data?.entities ?? {})) {
      const links: Partial<Record<string, string>> = {};
      for (const l of langs) {
        const title = ent.sitelinks?.[`${l}wiki`]?.title;
        if (title) links[l] = title;
      }
      out[qid] = links;
    }
  }
  return out;
}

export interface Summary {
  extract: string;
  description?: string;
  url?: string;
  image?: string;
}

export async function fetchSummary(fetchImpl: FetchLike, lang: string, title: string): Promise<Summary | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`;
  const data = (await getJson(fetchImpl, url)) as {
    type?: string;
    extract?: string;
    description?: string;
    thumbnail?: { source?: string };
    content_urls?: { mobile?: { page?: string }; desktop?: { page?: string } };
  } | null;
  if (!data || data.type === 'disambiguation' || !data.extract) return null;
  const thumb = data.thumbnail?.source;
  return {
    extract: data.extract.trim(),
    description: data.description,
    url: data.content_urls?.mobile?.page ?? data.content_urls?.desktop?.page,
    // Only Commons media is free to reuse; locally hosted images are usually fair use.
    image: thumb && thumb.includes('/wikipedia/commons/') ? widen(thumb, 640) : undefined
  };
}

/** Asks for a wider rendition of a Commons thumbnail: ".../320px-Name.jpg" → ".../640px-Name.jpg". */
export function widen(thumbUrl: string, px: number): string {
  return thumbUrl.replace(/\/(\d+)px-([^/]+)$/, `/${px}px-$2`);
}

/** "File:Name.jpg" for a Commons thumbnail URL. */
export function commonsFileName(url: string): string | null {
  const m = url.match(/\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/);
  return m ? `File:${decodeURIComponent(m[1]!)}` : null;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** "Author · CC BY-SA 4.0" for each Commons file, 50 per request. */
export async function fetchCredits(fetchImpl: FetchLike, files: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50);
    const url =
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo' +
      '&iiprop=extmetadata&iiextmetadatafilter=Artist|LicenseShortName' +
      `&titles=${encodeURIComponent(batch.join('|'))}`;
    const data = (await getJson(fetchImpl, url)) as {
      query?: {
        normalized?: Array<{ from: string; to: string }>;
        pages?: Record<string, { title?: string; imageinfo?: Array<{ extmetadata?: Record<string, { value?: string }> }> }>;
      };
    } | null;
    const back = new Map((data?.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const page of Object.values(data?.query?.pages ?? {})) {
      const meta = page.imageinfo?.[0]?.extmetadata;
      if (!page.title || !meta) continue;
      const artist = stripHtml(meta['Artist']?.value ?? '');
      const licence = stripHtml(meta['LicenseShortName']?.value ?? '');
      const credit = [artist, licence].filter(Boolean).join(' · ');
      if (credit) out.set(back.get(page.title) ?? page.title, credit);
    }
  }
  return out;
}

/** Files that are never photographs of the place: maps, flags, logos, icons, diagrams. */
const NOT_A_PHOTO =
  /(flag|map|locator|location|relief|topo|logo|icon|coat[_ ]of[_ ]arms|seal|emblem|symbol|diagram|chart|graph|signature|blank|question|edit|disambig|stub|pictogram|portal|commons-logo|wiki|\.svg$|\.gif$|\.tiff?$|\.webm$|\.ogg$|\.pdf$)/i;

/**
 * The image files each article uses, by title ("File:…" names), for up to 50
 * titles per request. Alphabetical, not in article order — good enough to
 * pick a few photographs from.
 */
export async function articleFiles(fetchImpl: FetchLike, lang: string, titles: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const url =
      `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=images&imlimit=max` +
      `&titles=${encodeURIComponent(batch.join('|'))}`;
    const data = (await getJson(fetchImpl, url)) as {
      query?: {
        normalized?: Array<{ from: string; to: string }>;
        redirects?: Array<{ from: string; to: string }>;
        pages?: Record<string, { title?: string; images?: Array<{ title?: string }> }>;
      };
    } | null;
    // Map the page title back through redirects and normalisation to the asked one.
    const back = new Map<string, string>();
    for (const n of [...(data?.query?.normalized ?? []), ...(data?.query?.redirects ?? [])]) back.set(n.to, back.get(n.from) ?? n.from);
    for (const page of Object.values(data?.query?.pages ?? {})) {
      if (!page.title) continue;
      const files = (page.images ?? []).map((im) => im.title ?? '').filter((f) => f && !NOT_A_PHOTO.test(f));
      out.set(back.get(page.title) ?? page.title, files);
    }
  }
  return out;
}

export interface GalleryPhoto {
  url: string;
  credit: string;
}

/**
 * Commons photographs good enough for a card: JPEG, at least 800 px wide,
 * landscape-ish, with an author and licence. Files that live only on a local
 * Wikipedia (usually fair use) are not on Commons and drop out here.
 */
export async function galleryInfo(fetchImpl: FetchLike, files: string[]): Promise<Map<string, GalleryPhoto>> {
  const out = new Map<string, GalleryPhoto>();
  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50);
    const url =
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo' +
      '&iiprop=url|size|mime|extmetadata&iiurlwidth=960&iiextmetadatafilter=Artist|LicenseShortName' +
      `&titles=${encodeURIComponent(batch.join('|'))}`;
    const data = (await getJson(fetchImpl, url)) as {
      query?: {
        normalized?: Array<{ from: string; to: string }>;
        pages?: Record<
          string,
          {
            title?: string;
            imageinfo?: Array<{
              thumburl?: string;
              width?: number;
              height?: number;
              mime?: string;
              extmetadata?: Record<string, { value?: string }>;
            }>;
          }
        >;
      };
    } | null;
    const back = new Map((data?.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const page of Object.values(data?.query?.pages ?? {})) {
      const info = page.imageinfo?.[0];
      if (!page.title || !info?.thumburl || info.mime !== 'image/jpeg') continue;
      const w = info.width ?? 0;
      const h = info.height ?? 1;
      if (w < 800 || w / h < 0.9 || w / h > 2.6) continue;
      const artist = stripHtml(info.extmetadata?.['Artist']?.value ?? '');
      const licence = stripHtml(info.extmetadata?.['LicenseShortName']?.value ?? '');
      const credit = [artist, licence].filter(Boolean).join(' · ');
      if (!credit) continue;
      out.set(back.get(page.title) ?? page.title, { url: info.thumburl, credit });
    }
  }
  return out;
}

export interface EnrichOptions {
  fetchImpl?: FetchLike;
  onProgress?: (done: number, total: number) => void;
}

const GALLERY_MAX = 4;
const GALLERY_PLACES = 15;

/** Up to three extra Commons photos for each of the flight's best places. */
async function galleriesFor(
  fetchImpl: FetchLike,
  pois: POI[],
  results: Map<string, { summary: Summary; lang: string }>,
  titles: Sitelinks,
  leadFiles: Map<string, string>
): Promise<Map<string, GalleryPhoto[]>> {
  const best = pois
    .filter((p) => results.has(p.id) && p.wikidata)
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, GALLERY_PLACES);
  const byLang = new Map<string, Array<{ poi: POI; title: string }>>();
  for (const poi of best) {
    const lang = results.get(poi.id)!.lang;
    const title = titles[poi.wikidata!]?.[lang];
    if (!title) continue;
    const list = byLang.get(lang) ?? [];
    list.push({ poi, title });
    byLang.set(lang, list);
  }
  const candidates = new Map<string, string[]>();
  for (const [lang, list] of byLang) {
    const files = await articleFiles(fetchImpl, lang, list.map((x) => x.title));
    for (const { poi, title } of list) {
      const lead = leadFiles.get(poi.id);
      candidates.set(poi.id, (files.get(title) ?? []).filter((f) => f !== lead).slice(0, 6));
    }
  }
  const all = Array.from(new Set([...candidates.values()].flat()));
  if (!all.length) return new Map();
  const info = await galleryInfo(fetchImpl, all);
  const out = new Map<string, GalleryPhoto[]>();
  for (const [id, files] of candidates) {
    const photos = files.map((f) => info.get(f)).filter((p): p is GalleryPhoto => !!p).slice(0, GALLERY_MAX - 1);
    if (photos.length) out.set(id, photos);
  }
  return out;
}

/**
 * Fills in summaries, taglines, photos and sources for the given places.
 *
 * The reader's language is preferred; when a place has no article in it, the
 * English one is used and marked, so the card can say so instead of silently
 * switching language mid-screen.
 */
export async function enrichWithWikipedia(pois: POI[], locale: string, opts: EnrichOptions = {}): Promise<POI[]> {
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const lang = locale.slice(0, 2);
  const langs = lang === 'en' ? ['en'] : [lang, 'en'];
  const withIds = pois.filter((p) => p.wikidata && /^Q\d+$/.test(p.wikidata));
  const total = withIds.length + 2;
  let done = 0;
  const tick = () => opts.onProgress?.(++done, total);

  const titles = await resolveTitles(
    fetchImpl,
    withIds.map((p) => p.wikidata!),
    langs
  );
  tick();

  const results = new Map<string, { summary: Summary; lang: string }>();
  await pool(
    withIds,
    async (poi) => {
      const links = titles[poi.wikidata!] ?? {};
      for (const l of langs) {
        const title = links[l];
        if (!title) continue;
        const s = await fetchSummary(fetchImpl, l, title);
        if (s) {
          results.set(poi.id, { summary: s, lang: l });
          return;
        }
      }
    },
    tick
  );

  const files = new Map<string, string>();
  for (const [id, r] of results) {
    const f = r.summary.image ? commonsFileName(r.summary.image) : null;
    if (f) files.set(id, f);
  }
  const credits = files.size ? await fetchCredits(fetchImpl, Array.from(new Set(files.values()))) : new Map();
  tick();

  // A few more photographs for the places that matter most on this flight.
  const gallery = await galleriesFor(fetchImpl, pois, results, titles, files).catch(() => new Map<string, GalleryPhoto[]>());

  return pois.map((poi) => {
    const r = results.get(poi.id);
    if (!r) return poi;
    const { summary, lang: textLang } = r;
    const file = files.get(poi.id);
    const credit = file ? credits.get(file) : undefined;
    // An image whose author and licence could not be established is not shown.
    const lead = summary.image && credit ? [{ url: summary.image, credit }] : [];
    const photos = [...lead, ...(gallery.get(poi.id) ?? [])].slice(0, GALLERY_MAX);
    // A satellite view, when the place has one, stays first: the passenger sees it from above.
    const kept = poi.aerial && poi.photos[0] ? [{ url: poi.photos[0], credit: poi.photoCredits?.[0] ?? '' }] : [];
    const all = [...kept, ...photos].slice(0, GALLERY_MAX + kept.length);
    const next: POI = {
      ...poi,
      sourceUrl: summary.url,
      textSource: poi.textSource === 'editorial' ? 'editorial' : 'wikipedia',
      photos: photos.length ? all.map((p) => p.url) : poi.photos,
      photoCredit: all[0]?.credit ?? poi.photoCredit,
      photoCredits: photos.length ? all.map((p) => p.credit) : poi.photoCredits
    };
    // A text written for SkyAtlas stays; the article supplies the photo and
    // the "read more" link.
    if (poi.textSource === 'editorial') return next;
    if (textLang === 'en') {
      next.summary = summary.extract;
      next.tagline = summary.description;
      if (lang !== 'en') next.textLang = 'en';
    } else {
      const translations = { ...(poi.translations ?? {}) };
      const key = textLang as keyof NonNullable<POI['translations']>;
      translations[key] = {
        name: translations[key]?.name ?? poi.name,
        summary: summary.extract,
        facts: translations[key]?.facts ?? [],
        tagline: summary.description
      };
      next.translations = translations;
    }
    return next;
  });
}
