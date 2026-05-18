export interface WikiSummary {
  extract: string;
  thumbnail?: string;
}

export async function fetchWikiSummary(title: string, lang = 'en'): Promise<WikiSummary | null> {
  try {
    const r = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    );
    if (!r.ok) return null;
    const j = await r.json() as any;
    return {
      extract: j.extract as string,
      thumbnail: j.thumbnail?.source as string | undefined
    };
  } catch {
    return null;
  }
}
