const UNSPLASH_KEY = process.env['EXPO_PUBLIC_UNSPLASH_KEY'];

export async function fetchUnsplashPhoto(query: string): Promise<string | null> {
  if (!UNSPLASH_KEY) return null;
  try {
    const r = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
    );
    if (!r.ok) return null;
    const j = await r.json() as any;
    return j.results?.[0]?.urls?.regular ?? null;
  } catch {
    return null;
  }
}
