import { describe, it, expect } from 'vitest';
import { enrichWithWikipedia, commonsFileName, widen, type FetchLike } from '../../src/core/places/wiki';
import type { POI } from '@skyatlas/shared';

const base = (id: string, wikidata?: string): POI => ({
  id,
  name: id,
  category: 'mountain',
  lat: 0,
  lon: 0,
  summary: '',
  facts: [],
  photos: [],
  wikidata,
  translations: { ru: { name: `ru-${id}`, summary: '', facts: [] } }
});

function fakeFetch(routes: Record<string, unknown>): FetchLike {
  return async (url) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    const body = key ? routes[key] : undefined;
    return {
      ok: body !== undefined,
      status: body !== undefined ? 200 : 404,
      headers: { get: () => null },
      json: async () => body
    };
  };
}

describe('enrichWithWikipedia', () => {
  const fetchImpl = fakeFetch({
    'wikidata.org': {
      entities: {
        Q1: { sitelinks: { ruwiki: { title: 'Эльбрус' }, enwiki: { title: 'Mount Elbrus' } } },
        Q2: { sitelinks: { enwiki: { title: 'Obscure Peak' } } }
      }
    },
    'ru.wikipedia.org/api/rest_v1/page/summary/%D0%AD%D0%BB%D1%8C%D0%B1%D1%80%D1%83%D1%81': {
      type: 'standard',
      extract: 'Эльбрус — стратовулкан на Кавказе.',
      description: 'высочайшая вершина России',
      thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Elbrus.jpg/320px-Elbrus.jpg' },
      content_urls: { mobile: { page: 'https://ru.m.wikipedia.org/wiki/Эльбрус' } }
    },
    'en.wikipedia.org/api/rest_v1/page/summary/Obscure_Peak': {
      type: 'standard',
      extract: 'Obscure Peak is a mountain.',
      thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/12/Local.jpg/320px-Local.jpg' }
    },
    'commons.wikimedia.org': {
      query: {
        pages: {
          '1': {
            title: 'File:Elbrus.jpg',
            imageinfo: [{ extmetadata: { Artist: { value: '<a href="x">Jane Doe</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }]
          }
        }
      }
    }
  });

  it('prefers the reader’s language, with photo and credit from Commons', async () => {
    const [elbrus] = await enrichWithWikipedia([base('elbrus', 'Q1')], 'ru', { fetchImpl });
    expect(elbrus!.translations?.ru?.summary).toContain('стратовулкан');
    expect(elbrus!.translations?.ru?.tagline).toBe('высочайшая вершина России');
    expect(elbrus!.translations?.ru?.name).toBe('ru-elbrus');
    expect(elbrus!.photos[0]).toContain('640px-Elbrus.jpg');
    expect(elbrus!.photoCredit).toBe('Jane Doe · CC BY-SA 4.0');
    expect(elbrus!.textSource).toBe('wikipedia');
    expect(elbrus!.textLang).toBeUndefined();
  });

  it('falls back to English, says so, and refuses non-Commons images', async () => {
    const [obscure] = await enrichWithWikipedia([base('obscure', 'Q2')], 'ru', { fetchImpl });
    expect(obscure!.summary).toBe('Obscure Peak is a mountain.');
    expect(obscure!.textLang).toBe('en');
    expect(obscure!.photos).toEqual([]);
  });

  it('leaves places without a Wikidata id untouched and survives total failure', async () => {
    const dead: FetchLike = async () => {
      throw new Error('offline');
    };
    const pois = [base('x'), base('y', 'Q9')];
    const out = await enrichWithWikipedia(pois, 'en', { fetchImpl: dead });
    expect(out).toEqual(pois);
  });
});

describe('Commons helpers', () => {
  it('extracts the file name and widens thumbnails', () => {
    const u = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Mount%20Elbrus.jpg/320px-Mount%20Elbrus.jpg';
    expect(commonsFileName(u)).toBe('File:Mount Elbrus.jpg');
    expect(widen(u, 640)).toMatch(/\/640px-Mount%20Elbrus\.jpg$/);
  });
});

describe('photo gallery', () => {
  const lead = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Elbrus.jpg/320px-Elbrus.jpg';
  const routes: Record<string, unknown> = {
    'wikidata.org': { entities: { Q1: { sitelinks: { enwiki: { title: 'Mount Elbrus' } } } } },
    'en.wikipedia.org/api/rest_v1/page/summary/Mount_Elbrus': {
      type: 'standard',
      extract: 'Elbrus is a dormant volcano.',
      thumbnail: { source: lead }
    },
    'en.wikipedia.org/w/api.php': {
      query: {
        pages: {
          '1': {
            title: 'Mount Elbrus',
            images: [
              { title: 'File:Elbrus.jpg' },
              { title: 'File:Flag of Russia.svg' },
              { title: 'File:Elbrus summit.jpg' },
              { title: 'File:Elbrus location map.png' },
              { title: 'File:Tiny.jpg' }
            ]
          }
        }
      }
    }
  };
  const credit = (a: string) => ({ Artist: { value: a }, LicenseShortName: { value: 'CC BY 4.0' } });
  const fetchImpl: FetchLike = async (url) => {
    let body: unknown;
    if (url.includes('commons.wikimedia.org') && url.includes('iiurlwidth')) {
      body = {
        query: {
          pages: {
            '2': { title: 'File:Elbrus summit.jpg', imageinfo: [{ thumburl: 'https://x/960px-summit.jpg', width: 4000, height: 2600, mime: 'image/jpeg', extmetadata: credit('Ann') }] },
            '3': { title: 'File:Tiny.jpg', imageinfo: [{ thumburl: 'https://x/tiny.jpg', width: 300, height: 200, mime: 'image/jpeg', extmetadata: credit('Bob') }] }
          }
        }
      };
    } else if (url.includes('commons.wikimedia.org')) {
      body = { query: { pages: { '1': { title: 'File:Elbrus.jpg', imageinfo: [{ extmetadata: credit('Lead Author') }] } } } };
    } else {
      const key = Object.keys(routes).find((k) => url.includes(k));
      body = key ? routes[key] : undefined;
    }
    return { ok: body !== undefined, status: body ? 200 : 404, headers: { get: () => null }, json: async () => body };
  };

  it('adds credited Commons photos after the lead, skipping maps, flags and small files', async () => {
    const [p] = await enrichWithWikipedia([base('elbrus', 'Q1')], 'en', { fetchImpl });
    expect(p!.photos).toEqual(['https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Elbrus.jpg/640px-Elbrus.jpg', 'https://x/960px-summit.jpg']);
    expect(p!.photoCredits).toEqual(['Lead Author · CC BY 4.0', 'Ann · CC BY 4.0']);
    expect(p!.photoCredit).toBe('Lead Author · CC BY 4.0');
  });

  it('keeps a written text and still adds the photos', async () => {
    const written: POI = { ...base('elbrus', 'Q1'), summary: 'Our own story.', textSource: 'editorial' };
    const [p] = await enrichWithWikipedia([written], 'en', { fetchImpl });
    expect(p!.summary).toBe('Our own story.');
    expect(p!.textSource).toBe('editorial');
    expect(p!.photos).toHaveLength(2);
  });
});
