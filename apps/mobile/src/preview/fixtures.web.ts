import type { OfflinePackage, POI } from '@skyatlas/shared';
import { composePackage } from '../core/offline/buildPackage';
import { savePackage } from '../core/offline/packageStore';
import { airportByIata, getAreas, getCountries, getHistory, getPlaces, loadStories, storiesFor } from '../core/data/datasets';
import { useSession } from '../core/flight/session';
import { saveRecord, clearJournal } from '../core/game/journal';
import { recordFromFlight } from '../core/game/record';
import { markOnboardingComplete } from '../../ui/onboardingState';
import { setLocale } from '../i18n';
import { formatClock, localDate } from '../core/time/zones';
import { positionNow } from '../core/flight/position';
import { whatsOutside } from '../core/flight/nowView';
import { nextGuess } from '../core/flight/guess';

/**
 * Browser preview fixtures.
 *
 * The web build exists to look at screens, not to use the app: `?scenario=…`
 * seeds a realistic state — a flight tomorrow, one at cruise, one just landed,
 * a passport with history — so each screen can be opened by URL and captured.
 * Each language gets a route its readers know, and `?at=<ISO time>` shifts the
 * clock so a capture is taken in daylight whenever it runs. Stories cannot be
 * fetched from here, so a few are written in for the places that come up;
 * everything else shows the data-only description.
 */

type Lang = 'en' | 'ru' | 'de' | 'fr' | 'es' | 'ja';

const SAMPLE_TEXT: Record<string, Partial<Record<Lang, string>>> = {
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
  },
  'Grand Canyon': {
    en: 'The Grand Canyon was cut by the Colorado River over millions of years. It runs for 446 kilometres, is up to 29 kilometres wide and more than 1,800 metres deep, and the rock at its floor is close to two billion years old. From cruise altitude it shows as a dark, branching gash across the plateau.',
    ru: 'Большой каньон прорезала река Колорадо за миллионы лет. Он тянется на 446 километров, в ширину достигает 29 километров, а в глубину — больше 1 800 метров; породы на дне почти два миллиарда лет. С эшелона он выглядит тёмной ветвистой трещиной на плато.'
  },
  'Rocky Mountains': {
    en: 'The Rocky Mountains run for more than 4,800 kilometres, from British Columbia to New Mexico. Their highest summit, Mount Elbert in Colorado, reaches 4,401 metres. In spring and autumn the snow line makes the ridges easy to read from above.'
  },
  'Mont Blanc': {
    en: 'Mont Blanc is the highest mountain in the Alps and in Western Europe, about 4,806 metres, on the border between France and Italy. It was first climbed in 1786 by Jacques Balmat and Michel-Gabriel Paccard. Its dome is under ice all year, so on a clear day it is the brightest point on the horizon.',
    ru: 'Монблан — высшая точка Альп и Западной Европы, около 4 806 метров, на границе Франции и Италии. Впервые на него поднялись в 1786 году Жак Бальма и Мишель-Габриэль Паккар. Его купол круглый год покрыт льдом, поэтому в ясный день это самая яркая точка на горизонте.',
    de: 'Der Mont Blanc ist mit rund 4806 Metern der höchste Berg der Alpen und Westeuropas, an der Grenze zwischen Frankreich und Italien. Erstmals bestiegen wurde er 1786 von Jacques Balmat und Michel-Gabriel Paccard. Seine Kuppel ist das ganze Jahr vereist – an klaren Tagen der hellste Punkt am Horizont.',
    fr: 'Le mont Blanc est le plus haut sommet des Alpes et d’Europe occidentale, environ 4 806 mètres, à la frontière entre la France et l’Italie. Jacques Balmat et Michel-Gabriel Paccard l’ont gravi les premiers en 1786. Son dôme reste couvert de glace toute l’année : par temps clair, c’est le point le plus lumineux de l’horizon.',
    es: 'El Mont Blanc es la montaña más alta de los Alpes y de Europa occidental, unos 4806 metros, en la frontera entre Francia e Italia. Jacques Balmat y Michel-Gabriel Paccard lo escalaron por primera vez en 1786. Su cúpula está helada todo el año: en un día despejado es el punto más brillante del horizonte.',
    ja: 'モンブランはアルプス山脈と西ヨーロッパの最高峰で、標高は約4,806メートル。フランスとイタリアの国境にそびえます。1786年にジャック・バルマとミシェル＝ガブリエル・パカールが初登頂しました。山頂のドームは一年中氷に覆われ、晴れた日には地平線でいちばん明るく輝きます。'
  },
  Matterhorn: {
    en: 'The Matterhorn, 4,478 metres, stands on the border between Switzerland and Italy above Zermatt. Its four faces point almost exactly north, south, east and west, which gives it the pyramid shape that is easy to pick out even from far away. It was first climbed in 1865.',
    ru: 'Маттерхорн высотой 4 478 метров стоит на границе Швейцарии и Италии над Церматтом. Четыре его грани смотрят почти точно на север, юг, восток и запад — отсюда форма пирамиды, которую легко узнать даже издалека. Впервые на него поднялись в 1865 году.',
    de: 'Das Matterhorn, 4478 Meter hoch, steht an der Grenze zwischen der Schweiz und Italien über Zermatt. Seine vier Flanken zeigen fast genau nach Norden, Süden, Osten und Westen – daher die Pyramidenform, die man selbst aus großer Entfernung erkennt. Erstbestiegen wurde es 1865.',
    fr: 'Le Cervin, 4 478 mètres, se dresse à la frontière entre la Suisse et l’Italie, au-dessus de Zermatt. Ses quatre faces regardent presque exactement le nord, le sud, l’est et l’ouest, d’où cette pyramide reconnaissable même de très loin. Il a été gravi pour la première fois en 1865.',
    es: 'El Cervino, de 4478 metros, se alza en la frontera entre Suiza e Italia, sobre Zermatt. Sus cuatro caras miran casi exactamente al norte, al sur, al este y al oeste, de ahí su forma de pirámide, fácil de reconocer incluso desde muy lejos. Se escaló por primera vez en 1865.',
    ja: 'マッターホルン（標高4,478メートル）は、ツェルマットの上、スイスとイタリアの国境に立つ山です。四つの壁がほぼ正確に東西南北を向いているため、遠くからでもすぐにわかるピラミッド形になっています。初登頂は1865年。'
  },
  Alps: {
    en: 'The Alps arc for about 1,200 kilometres across eight countries, from France to Slovenia. More than eighty summits rise above 4,000 metres; the highest is Mont Blanc.',
    ru: 'Альпы дугой тянутся примерно на 1 200 километров через восемь стран — от Франции до Словении. Больше восьмидесяти вершин поднимаются выше 4 000 метров; самая высокая — Монблан.',
    de: 'Die Alpen ziehen sich in einem Bogen rund 1200 Kilometer durch acht Länder, von Frankreich bis Slowenien. Mehr als achtzig Gipfel sind höher als 4000 Meter; der höchste ist der Mont Blanc.',
    fr: 'Les Alpes décrivent un arc d’environ 1 200 kilomètres à travers huit pays, de la France à la Slovénie. Plus de quatre-vingts sommets dépassent 4 000 mètres ; le plus haut est le mont Blanc.',
    es: 'Los Alpes forman un arco de unos 1200 kilómetros a través de ocho países, de Francia a Eslovenia. Más de ochenta cumbres superan los 4000 metros; la más alta es el Mont Blanc.',
    ja: 'アルプス山脈はフランスからスロベニアまで8か国にまたがり、約1,200キロの弧を描いています。4,000メートルを超える峰は80以上、最高峰はモンブランです。'
  }
};

/** A route per language, and two earlier flights for the passport. */
const SCENES: Record<string, { main: [string, string]; history: Array<[string, string, number]> }> = {
  ru: { main: ['SVO', 'AYT'], history: [['LED', 'SVO', 40], ['SVO', 'IST', 20]] },
  en: { main: ['LAX', 'JFK'], history: [['JFK', 'LHR', 40], ['LHR', 'ATH', 20]] },
  default: { main: ['CDG', 'ATH'], history: [['FRA', 'LIS', 40], ['MAD', 'FCO', 20]] }
};

function sceneFor(lang: string) {
  return SCENES[lang] ?? SCENES['default']!;
}

/**
 * `?at=` moves the whole app's clock (not a frozen clock — animations need it
 * to run), so captures do not depend on the hour they are taken.
 */
function shiftClock(): void {
  if (typeof window === 'undefined') return;
  const at = new URLSearchParams(window.location.search).get('at');
  const target = at ? Date.parse(at) : NaN;
  if (Number.isNaN(target)) return;
  const RealDate = Date;
  const shift = target - RealDate.now();
  class ShiftedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(RealDate.now() + shift);
      else super(...(args as [string]));
    }
    static now() {
      return RealDate.now() + shift;
    }
  }
  (globalThis as { Date: DateConstructor }).Date = ShiftedDate as DateConstructor;
}
shiftClock();

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
    { places: getPlaces(), areas: getAreas(), countries: getCountries(), history: getHistory(), stories: storiesFor(locale) }
  );
  pkg.pois = pkg.pois.map((p) => {
    const sample = SAMPLE_TEXT[p.name];
    // Written texts, once they exist for a place, are what the app shows.
    if (!sample || p.textSource === 'editorial') return p;
    const translations = { ...p.translations };
    for (const [l, text] of Object.entries(sample)) {
      if (l === 'en' || !text) continue;
      const k = l as keyof NonNullable<typeof p.translations>;
      translations[k] = { name: p.translations?.[k]?.name ?? p.name, summary: text, facts: [] };
    }
    return { ...p, summary: sample.en ?? p.summary, textSource: 'wikipedia', translations };
  });
  return pkg;
}

/**
 * The minute of the flight that shows the screen at its best: something on
 * both sides, in daylight — and, for the game, a guess open.
 */
function bestMinute(p: OfflinePackage, takeoffFor: (elapsedS: number) => Date, withGuess: boolean): number {
  const end = p.route[p.route.length - 1]!.elapsedSeconds;
  let best = -1;
  let bestS = end * 0.5;
  for (let e = end * 0.15; e <= end * 0.85; e += 60) {
    const takeoff = takeoffFor(e);
    const pos = positionNow(p.route, takeoff, new Date(takeoff.getTime() + e * 1000));
    const w = whatsOutside(p, pos, takeoff);
    let score = (w.left.length ? 2 : 0) + (w.right.length ? 2 : 0) + (w.below.length ? 1 : 0) + (w.daylight ? 3 : 0);
    score += Math.max(...[...w.left, ...w.right, ...w.below].map((v) => v.poi.rank ?? 0), 0) / 10;
    if (withGuess) {
      if (!nextGuess(p, e, {})) continue;
      score += 5;
    }
    if (score > best) {
      best = score;
      bestS = e;
    }
  }
  return bestS;
}

export async function installPreview(): Promise<void> {
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
  await loadStories(lang);
  if (scenario !== 'onboarding') markOnboardingComplete();
  clearJournal();
  useSession.getState().end();

  const now = Date.now();
  const hour = 3600_000;

  const scene = sceneFor(lang);
  const [A, B] = scene.main;
  const win = window as unknown as { __previewFlight?: string; __previewPlace?: string };

  // A history for the passport: two earlier flights.
  const history = () => {
    for (const [from, to, daysAgo] of scene.history) {
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
    savePackage(pkgFor(A, B, new Date(now + 20 * hour), 'left', lang));
    savePackage(pkgFor(B, A, new Date(now + 8 * 24 * hour), 'unknown', lang));
    history();
  }
  if (scenario === 'aloft' || scenario === 'place' || scenario === 'guess') {
    // Takeoff is placed so that "now" falls on the best minute of the flight.
    const probe = pkgFor(A, B, new Date(now - 2 * hour), 'left', lang);
    const at = bestMinute(probe, (e) => new Date(now - e * 1000), scenario === 'guess');
    const takeoff = new Date(now - at * 1000);
    const p = pkgFor(A, B, new Date(takeoff.getTime() - 10 * 60_000), 'left', lang);
    savePackage(p);
    useSession.getState().start(p.flight.id, takeoff);
    const passed = p.pois.filter((x) => (x.passAt ?? 0) < at);
    for (const x of passed.slice(-4)) useSession.getState().open(x.id);
    // Only a place already in view can be marked as seen: an area once the
    // track is over it, a side sight from a few minutes before it comes abeam.
    const inView = (x: POI) => (x.overFrom != null ? x.overFrom <= at : (x.passAt ?? 0) <= at + 8 * 60);
    const told = p.pois.filter((x) => SAMPLE_TEXT[x.name]?.[lang as Lang] && inView(x));
    // The card shown is the told place nearest to "now", so it reads as live.
    const star =
      told.sort((x, y) => Math.abs((x.passAt ?? 0) - at) - Math.abs((y.passAt ?? 0) - at))[0] ??
      passed.find((x) => x.category === 'range') ??
      passed[passed.length - 1];
    if (star && scenario !== 'guess' && inView(star)) useSession.getState().toggleSpotted(star.id);
    win.__previewFlight = p.flight.id;
    win.__previewPlace = star?.id ?? '';
  }
  if (scenario === 'arrival') {
    history();
    const probe = pkgFor(A, B, new Date(now - 8 * hour), 'left', lang);
    const end = probe.route[probe.route.length - 1]!.elapsedSeconds;
    // Landed a few minutes ago.
    const dep = new Date(now - end * 1000 - 15 * 60_000);
    const p = pkgFor(A, B, dep, 'left', lang);
    savePackage(p);
    useSession.getState().start(p.flight.id, new Date(dep.getTime() + 10 * 60_000));
    for (const x of p.pois.filter((y) => (y.rank ?? 0) >= 8).slice(0, 3)) useSession.getState().toggleSpotted(x.id);
    win.__previewFlight = p.flight.id;
  }
  if (scenario === 'achievements' || scenario === 'settings') history();
  if (scenario === 'atlas') {
    history();
    const dep = new Date(now - 5 * 24 * hour);
    const p = pkgFor(A, B, dep, 'left', lang);
    savePackage(p);
    const takeoff = new Date(dep.getTime() + 10 * 60_000);
    const end = p.route[p.route.length - 1]!.elapsedSeconds;
    saveRecord(
      recordFromFlight(p, {
        takeoffAt: takeoff,
        landedAt: new Date(takeoff.getTime() + end * 1000),
        spotted: p.pois.filter((x) => (x.rank ?? 0) >= 8).map((x) => x.id)
      })
    );
  }

  const w = win;
  const paths: Record<string, string> = {
    onboarding: '/welcome',
    empty: '/board',
    board: '/board',
    add: '/add',
    aloft: `/flight/${w.__previewFlight}`,
    guess: `/flight/${w.__previewFlight}`,
    place: `/place/${w.__previewFlight}/${w.__previewPlace}`,
    arrival: `/arrival/${w.__previewFlight}`,
    atlas: '/atlas',
    achievements: '/achievements',
    settings: '/settings',
    licenses: '/licenses'
  };
  const path = paths[scenario];
  if (path) window.history.replaceState(null, '', `${path}${window.location.search}`);
}
