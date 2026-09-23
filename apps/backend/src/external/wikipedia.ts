export interface WikiSummary {
  extract: string;
  thumbnail?: string;
}

/**
 * Article summaries, at a rate Wikimedia will actually serve.
 *
 * Fetched four at a time with no pacing, half of every burst came back `429` —
 * and because a non-OK response returned null, those places were silently
 * dropped from the route. Sixty of ninety-three chosen places lost their card
 * that way, which read as a sparse dataset rather than as throttling.
 *
 * Paced to roughly three requests a second with one retry, the same run
 * succeeds. The cost is paid once: `poiAggregator` stores what it fetches on the
 * place, so a route flown twice asks for nothing.
 */

const MIN_GAP_MS = 500;
const ATTEMPTS = 3;
/** Used when the response carries no `Retry-After`; doubles per attempt. */
const BACKOFF_MS = 1_500;

let nextSlot = 0;

function pace(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP_MS;
  return at === now ? Promise.resolve() : new Promise((r) => setTimeout(r, at - now));
}

let throttled = 0;
let missing = 0;

/** Counted rather than logged per call: a route asks about a hundred times. */
export function wikiStats(): { throttled: number; missing: number } {
  return { throttled, missing };
}

export function resetWikiStats(): void {
  throttled = 0;
  missing = 0;
}

export async function fetchWikiSummary(title: string, lang = 'en'): Promise<WikiSummary | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    let r: Response | null = null;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      await pace();
      r = await fetch(url, {
        // Wikimedia asks callers to identify themselves and throttles anonymous
        // traffic harder.
        headers: { 'User-Agent': 'SkyAtlas/1.0 (flight companion; contact via skyatlas.app)' }
      });
      if (r.status !== 429) break;
      throttled++;
      // Wait as long as the service asks. Guessing shorter is what keeps an
      // address in the penalty box.
      const askedFor = Number(r.headers.get('retry-after'));
      const wait = Number.isFinite(askedFor) && askedFor > 0
        ? Math.min(askedFor * 1000, 10_000)
        : BACKOFF_MS * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    if (!r || !r.ok) {
      // A 404 is a genuine "no such article"; anything else is the service
      // refusing. Both leave the place without a card, so both are counted.
      if (r && r.status !== 404) missing++;
      return null;
    }
    const j = (await r.json()) as { extract?: string; thumbnail?: { source?: string } };
    if (!j.extract) return null;
    return { extract: j.extract, thumbnail: j.thumbnail?.source };
  } catch {
    missing++;
    return null;
  }
}
