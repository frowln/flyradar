import type { OfflinePackage } from '@skyatlas/shared';
import { composePackage } from '../core/offline/buildPackage';
import { savePackage } from '../core/offline/packageStore';
import { airportByIata, getAreas, getCountries, getPlaces } from '../core/data/datasets';
import { useSession } from '../core/flight/session';
import { saveRecord, clearJournal } from '../core/game/journal';
import { recordFromFlight } from '../core/game/record';
import { markOnboardingComplete } from '../../ui/onboardingState';
import { setLocale } from '../i18n';
import { formatClock, localDate } from '../core/time/zones';

/**
 * Browser preview fixtures.
 *
 * The web build exists to look at screens, not to use the app: `?scenario=…`
 * seeds a realistic state — a flight tomorrow, one at cruise, one just landed,
 * a passport with history — so each screen can be opened by URL and captured.
 * Stories cannot be fetched from here, so a few are written in for the places
 * that most often come up; everything else shows the data-only description.
 */

const SAMPLE_TEXT: Record<string, { ru: string; en: string }> = {
  Caucasus: {
    ru: 'Кавказ — горная страна между Чёрным и Каспийским морями. Главный хребет тянется на 1 100 километров, а его вершины — Эльбрус и Казбек — видны с эшелона за сотни километров, если небо ясное.',
    en: 'The Caucasus is a mountain country between the Black and Caspian seas. Its main ridge runs for 1,100 kilometres, and its summits — Elbrus and Kazbek — are visible from cruise altitude hundreds of kilometres away on a clear day.'
  },
  'Black Sea': {
    ru: 'Чёрное море — внутреннее море между Европой и Малой Азией. Ниже двухсот метров вода в нём почти лишена кислорода, поэтому затонувшие корабли сохраняются там тысячелетиями.',
    en: 'The Black Sea is an inland sea between Europe and Asia Minor. Below about two hundred metres its water holds almost no oxygen, which is why shipwrecks there survive for thousands of years.'
  },
  Moscow: {
    ru: 'Москва — столица России и крупнейший город Европы. С высоты видно, как город разрастается кольцами: Бульварное, Садовое, Третье транспортное и МКАД.',
    en: 'Moscow is the capital of Russia and the largest city in Europe. From the air it is plain how the city grew in rings: the Boulevard Ring, the Garden Ring, the Third Ring and the MKAD.'
  },
  Antalya: {
    ru: 'Анталья — город на берегу Средиземного моря у подножия Таврских гор. Заход на посадку часто идёт над морем, и справа открывается вся бухта.',
    en: 'Antalya sits on the Mediterranean at the foot of the Taurus Mountains. The approach often comes in over the sea, with the whole bay opening up on the right.'
  }
};

function pkgFor(from: string, to: string, depart: Date, seat: 'left' | 'right' | 'unknown', locale: string): OfflinePackage {
  const a = airportByIata(from)!;
  const b = airportByIata(to)!;
  const pkg = composePackage(
    {
      from: a,
      to: b,
      date: localDate(depart, a.tz),
      departureTime: formatClock(depart, a.tz),
      seat: seat === 'unknown' ? undefined : { side: seat, label: seat === 'left' ? '23A' : '23F' },
      locale
    },
    { places: getPlaces(), areas: getAreas(), countries: getCountries() }
  );
  pkg.pois = pkg.pois.map((p) => {
    const sample = SAMPLE_TEXT[p.name];
    if (!sample) return p;
    return {
      ...p,
      summary: sample.en,
      textSource: 'wikipedia',
      translations: { ...p.translations, ru: { name: p.translations?.ru?.name ?? p.name, summary: sample.ru, facts: [] } }
    };
  });
  return pkg;
}

export function installPreview(): void {
  if (typeof window === 'undefined') return;
  const q = new URLSearchParams(window.location.search);
  const scenario = q.get('scenario');
  if (!scenario) return;
  const lang = q.get('lang') ?? 'ru';
  try {
    window.localStorage.clear();
  } catch {
    // ignore
  }
  setLocale(lang);
  if (scenario !== 'onboarding') markOnboardingComplete();
  clearJournal();
  useSession.getState().end();

  const now = Date.now();
  const hour = 3600_000;

  // A history for the passport: two earlier flights.
  const history = () => {
    for (const [from, to, daysAgo] of [
      ['LED', 'SVO', 40],
      ['SVO', 'IST', 20]
    ] as const) {
      const dep = new Date(now - daysAgo * 24 * hour);
      const p = pkgFor(from, to, dep, 'left', lang);
      const takeoff = new Date(dep.getTime() + 10 * 60_000);
      const end = p.route[p.route.length - 1]!.elapsedSeconds;
      saveRecord(
        recordFromFlight(p, {
          takeoffAt: takeoff,
          landedAt: new Date(takeoff.getTime() + end * 1000),
          spotted: p.pois.filter((x) => (x.rank ?? 0) >= 7).slice(0, 2).map((x) => x.id)
        })
      );
    }
  };

  if (scenario === 'board') {
    savePackage(pkgFor('SVO', 'AYT', new Date(now + 20 * hour), 'left', lang));
    savePackage(pkgFor('AYT', 'SVO', new Date(now + 8 * 24 * hour), 'unknown', lang));
    history();
  }
  if (scenario === 'aloft' || scenario === 'place') {
    const dep = new Date(now - 2.1 * hour);
    const p = pkgFor('SVO', 'AYT', dep, 'left', lang);
    savePackage(p);
    useSession.getState().start(p.flight.id, new Date(dep.getTime() + 10 * 60_000));
    const passed = p.pois.filter((x) => (x.passAt ?? 0) < 1.9 * 3600);
    for (const x of passed.slice(-4)) useSession.getState().open(x.id);
    const star = passed.find((x) => x.category === 'range') ?? passed[passed.length - 1];
    if (star) useSession.getState().toggleSpotted(star.id);
    (window as unknown as { __previewFlight: string }).__previewFlight = p.flight.id;
    (window as unknown as { __previewPlace: string }).__previewPlace = star?.id ?? '';
  }
  if (scenario === 'arrival') {
    history();
    const dep = new Date(now - 4 * hour);
    const p = pkgFor('SVO', 'AYT', dep, 'left', lang);
    savePackage(p);
    useSession.getState().start(p.flight.id, new Date(dep.getTime() + 10 * 60_000));
    for (const x of p.pois.filter((y) => (y.rank ?? 0) >= 8).slice(0, 3)) useSession.getState().toggleSpotted(x.id);
    (window as unknown as { __previewFlight: string }).__previewFlight = p.flight.id;
  }
  if (scenario === 'achievements' || scenario === 'settings') history();
  if (scenario === 'atlas') {
    history();
    const dep = new Date(now - 5 * 24 * hour);
    const p = pkgFor('SVO', 'AYT', dep, 'left', lang);
    savePackage(p);
    const takeoff = new Date(dep.getTime() + 10 * 60_000);
    saveRecord(
      recordFromFlight(p, {
        takeoffAt: takeoff,
        landedAt: new Date(takeoff.getTime() + 4 * hour),
        spotted: p.pois.filter((x) => (x.rank ?? 0) >= 8).map((x) => x.id)
      })
    );
  }

  const w = window as unknown as { __previewFlight?: string; __previewPlace?: string };
  const paths: Record<string, string> = {
    onboarding: '/welcome',
    empty: '/board',
    board: '/board',
    add: '/add',
    aloft: `/flight/${w.__previewFlight}`,
    place: `/place/${w.__previewFlight}/${w.__previewPlace}`,
    arrival: `/arrival/${w.__previewFlight}`,
    atlas: '/atlas',
    achievements: '/achievements',
    settings: '/settings'
  };
  const path = paths[scenario];
  if (path) window.history.replaceState(null, '', `${path}${window.location.search}`);
}
