import type {
  AirportRef,
  Board,
  BoardMetric,
  BoardScope,
  FeedItem,
  LeaderboardEntry,
  LiveFlight,
  Me,
  PersonRef,
  PlaceSocial,
  Profile,
  PublicStats,
  Review
} from './social';
import { airportByIata, getCountries, getPlaces } from '../data/datasets';
import { haversine } from '../geo/greatCircle';
import { buildRoute } from '../route/profile';
import { countriesAlong, distinctCountries } from '../places/countries';
import { getRecords } from '../game/journal';
import { buildPassport } from '../game/passport';
import { totalXP, levelFromXP } from '../game/xp';
import { achievementStates, ACHIEVEMENTS } from '../game/achievements';
import { continentOf } from '../flight/controller';
import { getLocale } from '../../i18n';

/**
 * The social layer on sample travellers, for the hosted demo.
 *
 * The real layer needs a deployed server; until then the demo shows what it
 * will look like with people in it. Everyone here is invented, but their
 * flights are real routes between real airports, so distances, countries and
 * the board add up. The passenger's own row is the real journal on the phone.
 * Nothing leaves the device.
 */

type Style = 'weekly' | 'explorer' | 'regular' | 'casual';

interface Person {
  id: string;
  name: string;
  handle: string;
  home: string;
  style: Style;
  pool: string[];
  commute?: string;
  friend?: boolean;
}

// Deterministic randomness: the same people, the same boards, every time.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const EUROPE = ['LHR', 'CDG', 'FRA', 'ZRH', 'FCO', 'BCN', 'MAD', 'AMS', 'VIE', 'PRG', 'MUC', 'LIS', 'ATH', 'CPH', 'OSL', 'ARN', 'HEL', 'NCE', 'MXP', 'DUB', 'BER'];
const ASIA = ['DXB', 'DOH', 'SIN', 'BKK', 'HKT', 'HND', 'KIX', 'ICN', 'HKG', 'TPE', 'KUL', 'DPS', 'DEL', 'KTM', 'CMB', 'MLE', 'SGN', 'HAN', 'PEK'];
const AMERICAS = ['JFK', 'LAX', 'SFO', 'ORD', 'MIA', 'SEA', 'YVR', 'YYZ', 'MEX', 'CUN', 'BOG', 'LIM', 'CUZ', 'SCL', 'EZE', 'GRU', 'HNL'];
const OTHER = ['SYD', 'AKL', 'ZQN', 'CPT', 'NBO', 'CAI'];
const RUSSIA = ['LED', 'AER', 'KZN', 'SVX', 'OVB', 'IKT', 'VVO', 'KGD', 'MRV', 'UFA', 'KRR', 'MCX'];
const NEAR = ['IST', 'AYT', 'DXB', 'TBS', 'EVN', 'ALA', 'TAS', 'BKK', 'HKT', 'GOI', 'MLE', 'CMB', 'PEK'];

const RU_PEOPLE: Array<Omit<Person, 'id' | 'pool'> & { pool: string[] }> = [
  { name: 'Анна Соколова', handle: 'anna.sky', home: 'SVO', style: 'weekly', commute: 'LED', pool: [...RUSSIA, ...NEAR], friend: true },
  { name: 'Михаил Орлов', handle: 'orlov', home: 'LED', style: 'explorer', pool: [...NEAR, ...ASIA, ...EUROPE], friend: true },
  { name: 'Екатерина Белова', handle: 'katya.b', home: 'SVO', style: 'regular', pool: [...RUSSIA, ...NEAR], friend: true },
  { name: 'Тимур Ахмедов', handle: 'timur.fly', home: 'KZN', style: 'weekly', commute: 'SVO', pool: [...RUSSIA, ...NEAR], friend: true },
  { name: 'Ольга Морозова', handle: 'olga.m', home: 'SVX', style: 'explorer', pool: [...NEAR, ...ASIA, ...OTHER], friend: true },
  { name: 'Артём Лебедев', handle: 'tema', home: 'OVB', style: 'regular', pool: [...RUSSIA, ...NEAR], friend: true },
  { name: 'Дарья Павлова', handle: 'dasha.p', home: 'AER', style: 'casual', pool: [...RUSSIA, 'IST', 'TBS'], friend: true },
  { name: 'Глеб Романов', handle: 'gleb', home: 'SVO', style: 'explorer', pool: [...ASIA, ...AMERICAS, ...OTHER, ...EUROPE] },
  { name: 'Вера Григорьева', handle: 'vera.g', home: 'LED', style: 'weekly', commute: 'KGD', pool: [...RUSSIA, ...NEAR] },
  { name: 'Никита Зайцев', handle: 'nzaitsev', home: 'SVO', style: 'regular', pool: [...RUSSIA, ...NEAR] },
  { name: 'Алиса Фёдорова', handle: 'alice.f', home: 'SVO', style: 'explorer', pool: [...ASIA, ...NEAR, ...OTHER] },
  { name: 'Павел Смирнов', handle: 'pavel.s', home: 'VVO', style: 'regular', pool: ['SVO', 'OVB', 'IKT', 'ICN', 'HND', 'PEK', 'BKK'] },
  { name: 'Елена Кузнецова', handle: 'lena.k', home: 'KRR', style: 'casual', pool: ['SVO', 'LED', 'IST', 'AYT', 'DXB'] },
  { name: 'Лев Николаев', handle: 'lev', home: 'SVO', style: 'weekly', commute: 'SVX', pool: [...RUSSIA, ...NEAR] },
  { name: 'Полина Егорова', handle: 'polina', home: 'LED', style: 'regular', pool: [...NEAR, ...RUSSIA] },
  { name: 'Максим Белов', handle: 'max.b', home: 'SVO', style: 'explorer', pool: [...ASIA, ...AMERICAS, ...NEAR] },
  { name: 'София Новикова', handle: 'sofia.n', home: 'MRV', style: 'casual', pool: ['SVO', 'LED', 'IST', 'DXB'] },
  { name: 'Роман Ильин', handle: 'roman.i', home: 'IKT', style: 'regular', pool: ['SVO', 'OVB', 'PEK', 'BKK', 'VVO', 'ICN'] },
  { name: 'Кира Власова', handle: 'kira', home: 'SVO', style: 'regular', pool: [...NEAR, ...RUSSIA] },
  { name: 'Денис Голубев', handle: 'denis.g', home: 'UFA', style: 'weekly', commute: 'SVO', pool: [...RUSSIA, ...NEAR] },
  { name: 'Маргарита Осипова', handle: 'rita', home: 'LED', style: 'explorer', pool: [...EUROPE, ...ASIA, ...NEAR] },
  { name: 'Илья Комаров', handle: 'komarov', home: 'SVO', style: 'casual', pool: ['AER', 'MRV', 'KGD', 'IST'] },
  { name: 'Юлия Соловьёва', handle: 'yulia.s', home: 'KZN', style: 'regular', pool: [...RUSSIA, ...NEAR] },
  { name: 'Степан Карпов', handle: 'stepan', home: 'SVO', style: 'explorer', pool: [...OTHER, ...AMERICAS, ...ASIA] }
];

const WORLD_PEOPLE: typeof RU_PEOPLE = [
  { name: 'Emma Fischer', handle: 'emma.f', home: 'FRA', style: 'weekly', commute: 'LHR', pool: [...EUROPE, ...ASIA], friend: true },
  { name: 'Lucas Martin', handle: 'lucas', home: 'CDG', style: 'explorer', pool: [...ASIA, ...AMERICAS, ...OTHER], friend: true },
  { name: 'Sofia Rossi', handle: 'sofia.r', home: 'FCO', style: 'regular', pool: [...EUROPE], friend: true },
  { name: 'Kenji Watanabe', handle: 'kenji', home: 'HND', style: 'weekly', commute: 'KIX', pool: [...ASIA, 'SFO', 'LAX', 'HNL'], friend: true },
  { name: 'Olivia Brown', handle: 'liv', home: 'JFK', style: 'explorer', pool: [...EUROPE, ...AMERICAS, ...ASIA], friend: true },
  { name: 'Mateo García', handle: 'mateo', home: 'MAD', style: 'regular', pool: [...EUROPE, ...AMERICAS], friend: true },
  { name: 'Chloé Dubois', handle: 'chloe', home: 'NCE', style: 'casual', pool: ['CDG', 'LHR', 'FCO', 'BCN', 'ATH'], friend: true },
  { name: 'Noah Müller', handle: 'noah.m', home: 'ZRH', style: 'explorer', pool: [...ASIA, ...AMERICAS, ...OTHER] },
  { name: 'Aiko Tanaka', handle: 'aiko', home: 'KIX', style: 'regular', pool: [...ASIA] },
  { name: 'Liam O’Connor', handle: 'liam', home: 'DUB', style: 'weekly', commute: 'LHR', pool: [...EUROPE, 'JFK'] },
  { name: 'Isabella Silva', handle: 'bella', home: 'GRU', style: 'explorer', pool: [...AMERICAS, ...EUROPE] },
  { name: 'Hannah Schmidt', handle: 'hannah', home: 'MUC', style: 'regular', pool: [...EUROPE, ...ASIA] },
  { name: 'Léa Bernard', handle: 'lea.b', home: 'CDG', style: 'casual', pool: [...EUROPE] },
  { name: 'Diego Torres', handle: 'diego', home: 'MEX', style: 'regular', pool: [...AMERICAS] },
  { name: 'Mia Johansson', handle: 'mia.j', home: 'ARN', style: 'explorer', pool: [...ASIA, ...EUROPE, ...OTHER] },
  { name: 'Ethan Clarke', handle: 'ethan', home: 'SFO', style: 'weekly', commute: 'SEA', pool: [...AMERICAS, 'HND', 'HNL'] },
  { name: 'Yuki Sato', handle: 'yuki', home: 'HND', style: 'explorer', pool: [...ASIA, ...EUROPE, ...AMERICAS] },
  { name: 'Lena Novak', handle: 'lena.n', home: 'VIE', style: 'regular', pool: [...EUROPE] },
  { name: 'Arjun Mehta', handle: 'arjun', home: 'DEL', style: 'weekly', commute: 'DXB', pool: [...ASIA, 'LHR'] },
  { name: 'Grace Lee', handle: 'grace', home: 'ICN', style: 'regular', pool: [...ASIA, 'LAX'] },
  { name: 'Tom Wilson', handle: 'tomw', home: 'SYD', style: 'explorer', pool: [...ASIA, ...OTHER, 'LAX'] },
  { name: 'Marta Kowalska', handle: 'marta', home: 'BER', style: 'casual', pool: [...EUROPE] },
  { name: 'Pablo Ruiz', handle: 'pablo', home: 'BCN', style: 'regular', pool: [...EUROPE, 'JFK'] },
  { name: 'Nora Haugen', handle: 'nora', home: 'OSL', style: 'explorer', pool: [...EUROPE, ...AMERICAS, ...ASIA] }
];

const TOTAL_ON_BOARD = 18_426;
const DAY = 86_400_000;

interface Flight {
  from: string;
  to: string;
  at: number;
  km: number;
  countries: string[];
}

const routeCache = new Map<string, { km: number; countries: string[] }>();

function leg(from: string, to: string): { km: number; countries: string[] } | null {
  const key = from < to ? `${from}-${to}` : `${to}-${from}`;
  const hit = routeCache.get(key);
  if (hit) return hit;
  const a = airportByIata(from);
  const b = airportByIata(to);
  if (!a || !b) return null;
  let countries = [...new Set([a.cc, b.cc])];
  try {
    const { route } = buildRoute({ from: a, to: b });
    countries = distinctCountries(countriesAlong(route, getCountries(), { fromCC: a.cc, toCC: b.cc }));
  } catch {
    // Outlines not loaded: the two ends still count.
  }
  const out = { km: Math.round(haversine(a.lat, a.lon, b.lat, b.lon) * 1.04), countries };
  routeCache.set(key, out);
  return out;
}

function ref(iata: string): AirportRef {
  const a = airportByIata(iata)!;
  return { iata, lat: a.lat, lon: a.lon, cc: a.cc };
}

/** A year of someone's flights, ending now. */
function flightsOf(p: Person, now: number): Flight[] {
  const r = rng(hash(p.id));
  const out: Flight[] = [];
  const push = (from: string, to: string, at: number) => {
    const l = leg(from, to);
    if (l) out.push({ from, to, at, km: l.km, countries: l.countries });
  };
  const trips = { weekly: 0, explorer: 16, regular: 9, casual: 3 }[p.style];
  if (p.style === 'weekly' && p.commute) {
    // Out on Monday, back on Thursday, nearly every week.
    for (let w = 0; w < 46; w++) {
      if (w > 1 && r() < 0.12) continue;
      const monday = now - (w * 7 + 3) * DAY + r() * 6 * 3_600_000;
      push(p.home, p.commute, monday);
      push(p.commute, p.home, monday + 3 * DAY);
    }
  }
  for (let i = 0; i < trips + (p.style === 'weekly' ? 4 : 0); i++) {
    const dest = p.pool[Math.floor(r() * p.pool.length)]!;
    if (dest === p.home) continue;
    const at = now - (5 + r() * 355) * DAY;
    push(p.home, dest, at);
    push(dest, p.home, at + (3 + r() * 9) * DAY);
  }
  return out.filter((f) => f.at < now).sort((a, b) => a.at - b.at);
}

interface Sample extends Person {
  flights: Flight[];
  stats: PublicStats;
  month: { distanceKm: number; countries: number; places: number; xp: number };
  joinedAt: string;
}

let cache: { lang: string; day: number; people: Sample[] } | null = null;

function statsOf(flights: Flight[], seed: number): PublicStats {
  const r = rng(seed);
  const countries = new Set<string>();
  let km = 0;
  for (const f of flights) {
    km += f.km;
    f.countries.forEach((c) => countries.add(c));
  }
  // Repeated routes pass the same places: new ones taper off with every trip.
  const placesDiscovered = Math.round(Math.min(flights.length * 7, 40 + Math.sqrt(km) * (1.6 + r())));
  const xp = flights.length * 100 + Math.round(km / 50) + countries.size * 40 + placesDiscovered * 3 + Math.round(placesDiscovered * 0.3) * 25;
  return { flights: flights.length, distanceKm: km, placesDiscovered, countries: countries.size, xp, level: levelFromXP(xp).level };
}

function people(): Sample[] {
  const lang = getLocale().slice(0, 2);
  const now = Date.now();
  const day = Math.floor(now / DAY);
  if (cache && cache.lang === lang && cache.day === day) return cache.people;
  const list = (lang === 'ru' ? RU_PEOPLE : WORLD_PEOPLE).map((p, i) => ({ ...p, id: `demo-${lang === 'ru' ? 'ru' : 'w'}-${i}` }));
  const out = list.map((p) => {
    const flights = flightsOf(p, now);
    const stats = statsOf(flights, hash(p.id) + 7);
    const recent = flights.filter((f) => f.at > now - 30 * DAY);
    const m = statsOf(recent, hash(p.id) + 11);
    const joined = new Date(now - (420 + (hash(p.id) % 900)) * DAY);
    return {
      ...p,
      flights,
      stats,
      month: { distanceKm: m.distanceKm, countries: m.countries, places: m.placesDiscovered, xp: m.xp },
      joinedAt: joined.toISOString()
    };
  });
  cache = { lang, day, people: out };
  return out;
}

function myStats(): { stats: PublicStats; month: Sample['month'] } {
  const records = getRecords();
  const passport = buildPassport(records, continentOf);
  const xp = totalXP(records);
  const stats: PublicStats = {
    flights: passport.flights,
    distanceKm: passport.distanceKm,
    placesDiscovered: passport.places,
    countries: passport.countries.length,
    xp,
    level: levelFromXP(xp).level
  };
  const since = Date.now() - 30 * DAY;
  const recent = records.filter((r) => Date.parse(r.takeoffAt) > since);
  const rp = buildPassport(recent, continentOf);
  return { stats, month: { distanceKm: rp.distanceKm, countries: rp.countries.length, places: rp.places, xp: totalXP(recent) } };
}

const valueOf = (m: BoardMetric, s: { distanceKm: number; countries: number; placesDiscovered?: number; places?: number; xp: number }) =>
  m === 'distance' ? s.distanceKm : m === 'countries' ? s.countries : m === 'places' ? (s.placesDiscovered ?? s.places ?? 0) : s.xp;

const personRef = (p: Sample): PersonRef => ({ id: p.id, handle: p.handle, name: p.name, avatarUrl: null });

const following = new Map<string, boolean>();
const isFriend = (p: Sample) => following.get(p.id) ?? !!p.friend;

const cheers = new Map<string, boolean>();
const myReviews = new Map<string, Review>();

const later = <T>(v: T): Promise<T> => new Promise((res) => setTimeout(() => res(v), 120));

function board(metric: BoardMetric, scope: BoardScope): Board {
  const all = people();
  const me = myStats();
  const pool = scope === 'friends' ? all.filter(isFriend) : all;
  const rows: LeaderboardEntry[] = pool.map((p) => {
    const s = scope === 'month' ? { ...p.stats, ...p.month, placesDiscovered: p.month.places } : p.stats;
    return {
      rank: 0,
      userId: p.id,
      handle: p.handle,
      name: p.name,
      avatarUrl: null,
      xp: s.xp,
      level: p.stats.level,
      flights: p.stats.flights,
      places: s.placesDiscovered,
      countries: s.countries,
      distanceKm: s.distanceKm,
      value: valueOf(metric, s)
    };
  });
  const mine = scope === 'month' ? { ...me.stats, ...me.month, placesDiscovered: me.month.places } : me.stats;
  const meRow: LeaderboardEntry = {
    rank: 0,
    userId: 'me',
    handle: null,
    name: null,
    avatarUrl: null,
    xp: mine.xp,
    level: me.stats.level,
    flights: me.stats.flights,
    places: mine.placesDiscovered,
    countries: mine.countries,
    distanceKm: mine.distanceKm,
    value: valueOf(metric, mine),
    isMe: true
  };
  if (scope === 'friends') {
    const ranked = [...rows, meRow].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).map((e, i) => ({ ...e, rank: i + 1 }));
    return { entries: ranked, total: ranked.length };
  }
  // The sample is the top of a long board: the passenger's place is placed
  // within the whole of it, not among twenty-odd frequent flyers.
  const sorted = rows.sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).map((e, i) => ({ ...e, rank: i + 1 }));
  const total = scope === 'month' ? Math.round(TOTAL_ON_BOARD * 0.41) : TOTAL_ON_BOARD;
  const last = sorted[sorted.length - 1]?.value ?? 1;
  const mv = meRow.value ?? 0;
  if (mv >= last) {
    const at = sorted.findIndex((e) => (e.value ?? 0) <= mv);
    const pos = at < 0 ? sorted.length : at;
    const merged = [...sorted.slice(0, pos), meRow, ...sorted.slice(pos)].map((e, i) => ({ ...e, rank: i + 1 }));
    return { entries: merged, total };
  }
  const share = Math.max(0, Math.min(1, mv / last));
  const rank = mv <= 0 ? total : Math.round(sorted.length + 1 + (total - sorted.length - 1) * Math.pow(1 - share, 0.35));
  return { entries: sorted, total, me: { ...meRow, rank } };
}

function live(): LiveFlight[] {
  const now = Date.now();
  const friends = people().filter(isFriend);
  const plans: Array<[number, string | undefined, number]> = [
    [0, friends[0]?.commute, 0.55],
    [1, friends[1]?.pool.find((x) => (airportByIata(x)?.lon ?? 0) > 50), 0.3],
    [4, friends[4]?.pool.find((x) => x !== friends[4]?.home && (airportByIata(x)?.lat ?? 90) < 30), 0.72]
  ];
  const out: LiveFlight[] = [];
  for (const [i, dest, progress] of plans) {
    const p = friends[i];
    if (!p || !dest) continue;
    const l = leg(p.home, dest);
    if (!l) continue;
    const durMs = (l.km / 780 + 0.45) * 3_600_000;
    const takeoff = now - durMs * progress;
    out.push({ user: personRef(p), from: ref(p.home), to: ref(dest), takeoffAt: new Date(takeoff).toISOString(), landAt: new Date(takeoff + durMs).toISOString() });
  }
  return out;
}

const FAMOUS = ['Mount Elbrus', 'Lake Baikal', 'Bosphorus', 'Matterhorn', 'Mount Fuji', 'Mount Kilimanjaro', 'Mont Blanc', 'Mount Everest', 'Volga', 'Caspian Sea', 'Mount Ararat', 'Kazbek'];

function placeRef(english: string): { id: string; name: string } | null {
  const lang = getLocale().slice(0, 2) as 'ru' | 'de' | 'fr' | 'es' | 'ja';
  try {
    const p = getPlaces().find((x) => x.n === english);
    if (!p) return null;
    return { id: p.id, name: (lang !== ('en' as string) ? p.l?.[lang] : undefined) ?? p.n };
  } catch {
    return null;
  }
}

function feed(): FeedItem[] {
  const now = Date.now();
  const friends = people().filter(isFriend);
  const r = rng(Math.floor(now / DAY));
  const items: FeedItem[] = [];
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
  friends.forEach((p, i) => {
    const last = [...p.flights].reverse().find((f) => f.km > 300);
    if (last) {
      items.push({
        id: `f-${p.id}`,
        at: hoursAgo(2 + i * 9 + r() * 5),
        user: personRef(p),
        kind: 'flight',
        flight: { from: ref(last.from), to: ref(last.to), distanceKm: last.km, countries: last.countries },
        cheers: 3 + Math.floor(r() * 30)
      });
    }
  });
  const pushPlace = (i: number, english: string, h: number) => {
    const p = friends[i];
    const place = placeRef(english);
    if (p && place) items.push({ id: `s-${p.id}-${place.id}`, at: hoursAgo(h), user: personRef(p), kind: 'spotted', place, cheers: 5 + Math.floor(r() * 40) });
  };
  const lang = getLocale().slice(0, 2);
  pushPlace(0, lang === 'ru' ? 'Mount Elbrus' : 'Matterhorn', 5);
  pushPlace(3, lang === 'ru' ? 'Volga' : 'Mount Fuji', 30);
  const country = (i: number, cc: string, h: number) => {
    const p = friends[i];
    if (p) items.push({ id: `c-${p.id}-${cc}`, at: hoursAgo(h), user: personRef(p), kind: 'country', cc, cheers: 8 + Math.floor(r() * 25) });
  };
  country(1, lang === 'ru' ? 'VN' : 'PE', 14);
  country(4, lang === 'ru' ? 'LK' : 'NZ', 52);
  const ach = (i: number, id: string, h: number) => {
    const p = friends[i];
    if (p && ACHIEVEMENTS.some((a) => a.id === id)) items.push({ id: `a-${p.id}-${id}`, at: hoursAgo(h), user: personRef(p), kind: 'achievement', achievement: id, cheers: 4 + Math.floor(r() * 20) });
  };
  ach(4, 'equator', 20);
  ach(1, 'countries_20', 40);
  ach(5, 'sunrise', 66);
  const streak = friends.find((p) => p.style === 'weekly');
  if (streak) items.push({ id: `w-${streak.id}`, at: hoursAgo(8), user: personRef(streak), kind: 'streak', weeks: 21, cheers: 31 });
  const reviewer = friends[2];
  const lake = placeRef(lang === 'ru' ? 'Lake Baikal' : 'Mont Blanc');
  if (reviewer && lake) {
    items.push({
      id: `r-${reviewer.id}`,
      at: hoursAgo(26),
      user: personRef(reviewer),
      kind: 'review',
      place: lake,
      rating: 5,
      text: reviewText(lang === 'ru' ? 'lake' : 'mountain', 0),
      cheers: 12
    });
  }
  return items
    .map((it) => ({ ...it, cheered: cheers.get(it.id) ?? false, cheers: it.cheers + (cheers.get(it.id) ? 1 : 0) }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

const REVIEWS: Record<'ru' | 'en', Record<string, string[]>> = {
  ru: {
    mountain: [
      'Просила место A на регистрации — и не зря. Снежная шапка вышла из облаков минут на пять, на закате розовая.',
      'Узнала только благодаря подсказке: с высоты она меньше, чем ждёшь, но силуэт ни с чем не спутать.',
      'Летел ночью, но вид из окна в приложении показал, где она. Под луной снег был виден!'
    ],
    lake: [
      'Огромное и почти чёрное, с белыми полосами льда у берегов. Сняла на телефон — вышло как открытка.',
      'Облака разошлись прямо над водой. Видно было даже острова. Лучшие десять минут полёта.',
      'С правого борта, как и обещали. Береговую линию узнал по карте в приложении.'
    ],
    city: [
      'Ночью — как рассыпанное золото. Нашла кольцевые дороги и реку, как на карте.',
      'Пролетали низко на снижении, видно стадион и мосты.',
      'Днём город сверху серый, а вот ночью — главное шоу рейса.'
    ],
    water: [
      'Тянулась под нами полчаса, блестела на солнце. Приложение заранее сказало, с какой стороны смотреть.',
      'Извилистая, с притоками — как на карте из учебника.',
      'Поймала блик солнца на воде — сразу поняла, что это она.'
    ],
    land: [
      'Сверху как лоскутное одеяло. Не думала, что это так красиво.',
      'Пустота и цвета, каких на земле не увидишь. Смотрела весь час.',
      'Прочитала историю в приложении, пока летели, — теперь знаю, что было внизу.'
    ]
  },
  en: {
    mountain: [
      'Asked for an A seat at check-in and it paid off. The summit came out of the clouds for five minutes, pink at sunset.',
      'Smaller than you expect from up here, but the outline is unmistakable once you know where to look.',
      'Flew at night, but the window view in the app showed where it was. You could see the snow in the moonlight!'
    ],
    lake: [
      'Huge and nearly black, with white bands of ice along the shore. My phone photo looks like a postcard.',
      'The clouds parted right over the water and we could even see the islands. Best ten minutes of the flight.',
      'On the right, as promised. Matched the shoreline to the map in the app.'
    ],
    city: [
      'At night it looks like spilled gold. Found the ring roads and the river, just like the map.',
      'We passed low on the descent: the stadium and the bridges were clear.',
      'Grey by day, but at night it is the show of the flight.'
    ],
    water: [
      'Ran under us for half an hour, shining in the sun. The app said which side to look from.',
      'Winding, with tributaries, like a textbook map.',
      'Caught the sun glinting on the water and knew straight away.'
    ],
    land: [
      'A patchwork quilt from above. I had no idea it was this beautiful.',
      'Emptiness and colours you never see on the ground. Watched for the whole hour.',
      'Read the story in the app while we flew over — now I know what was down there.'
    ]
  }
};

function groupOf(kind: string | undefined): string {
  if (kind === 'mountain' || kind === 'volcano' || kind === 'range' || kind === 'glacier') return 'mountain';
  if (kind === 'lake' || kind === 'sea') return 'lake';
  if (kind === 'city') return 'city';
  if (kind === 'river' || kind === 'strait' || kind === 'bay') return 'water';
  return 'land';
}

function reviewText(group: string, i: number): string {
  const lang = getLocale().slice(0, 2) === 'ru' ? 'ru' : 'en';
  const list = REVIEWS[lang][group] ?? REVIEWS[lang]['land']!;
  return list[i % list.length]!;
}

function placeKind(poiId: string): string | undefined {
  try {
    return getPlaces().find((p) => p.id === poiId)?.k;
  } catch {
    return undefined;
  }
}

function placeStats(poiId: string): PlaceSocial {
  const h = hash(poiId);
  const discoveries = 120 + (h % 5200);
  const own = myReviews.get(poiId);
  return {
    discoveries,
    reviews: 3 + (h % 40) + (own ? 1 : 0),
    rating: 4.3 + ((h >>> 8) % 7) / 10,
    rarity: discoveries / TOTAL_ON_BOARD
  };
}

function reviews(poiId: string): Review[] {
  const h = hash(poiId);
  const all = people();
  const group = groupOf(placeKind(poiId));
  const out: Review[] = [0, 1, 2].map((i) => {
    const p = all[(h + i * 7) % all.length]!;
    return {
      id: `${poiId}-r${i}`,
      rating: i === 2 ? 4 : 5,
      body: reviewText(group, (h >>> 4) + i),
      createdAt: new Date(Date.now() - (3 + i * 11 + (h % 20)) * DAY).toISOString(),
      helpful: 2 + ((h >>> (i + 3)) % 30),
      author: { id: p.id, handle: p.name, avatarUrl: null }
    };
  });
  const own = myReviews.get(poiId);
  return own ? [own, ...out] : out;
}

function profileOf(userId: string): Profile | null {
  if (userId === 'me') {
    const me = myStats();
    const records = getRecords();
    const passport = buildPassport(records, continentOf);
    return {
      id: 'me',
      handle: null,
      name: null,
      avatarUrl: null,
      joinedAt: records[0]?.takeoffAt ?? new Date().toISOString(),
      stats: me.stats,
      recent: [],
      flights: records
        .filter((r) => airportByIata(r.from) && airportByIata(r.to))
        .map((r) => ({ from: ref(r.from), to: ref(r.to), date: r.date })),
      countries: passport.countries,
      achievements: achievementStates(passport).filter((a) => a.earned).length
    };
  }
  const p = people().find((x) => x.id === userId);
  if (!p) return null;
  const countries: string[] = [];
  for (const f of p.flights) for (const c of f.countries) if (!countries.includes(c)) countries.push(c);
  const recentPlaces = FAMOUS.map(placeRef).filter((x): x is { id: string; name: string } => !!x);
  const r = rng(hash(p.id) + 3);
  const recent = recentPlaces
    .filter(() => r() < 0.5)
    .slice(0, 5)
    .map((pl, i) => ({ poiId: pl.id, name: pl.name, discoveredAt: new Date(Date.now() - (2 + i * 13) * DAY).toISOString() }));
  // Weeks in a row with a flight, counted back from this week.
  let weeks = 0;
  const now = Date.now();
  for (let w = 0; w < 60; w++) {
    const from = now - (w + 1) * 7 * DAY;
    const to = now - w * 7 * DAY;
    if (p.flights.some((f) => f.at >= from && f.at < to)) weeks++;
    else if (w > 0) break;
  }
  return {
    id: p.id,
    handle: p.handle,
    name: p.name,
    avatarUrl: null,
    joinedAt: p.joinedAt,
    stats: p.stats,
    recent,
    home: p.home,
    flights: p.flights.slice(-60).map((f) => ({ from: ref(f.from), to: ref(f.to), date: new Date(f.at).toISOString().slice(0, 10) })),
    countries,
    streakWeeks: weeks,
    achievements: Math.min(ACHIEVEMENTS.length, 4 + Math.round(Math.sqrt(p.stats.flights) * 1.6)),
    following: isFriend(p)
  };
}

export const demoSocial = {
  me: () => later<Me | null>({ id: 'me', handle: null, avatarUrl: null, linked: false, stats: myStats().stats }),
  linkApple: (_identityToken: string) => later<{ id: string; merged: boolean } | null>({ id: 'me', merged: false }),
  setHandle: (_handle: string) => later<Me | null>(null),
  discover: async (_poiId: string, _flightId?: string): Promise<void> => {},
  flushPending: async (): Promise<number> => 0,
  placeStats: (poiId: string) => later<PlaceSocial | null>(placeStats(poiId)),
  reviews: (poiId: string) => later<{ reviews: Review[]; nextCursor: string | null } | null>({ reviews: reviews(poiId), nextCursor: null }),
  writeReview: (poiId: string, rating: number, body?: string) => {
    myReviews.set(poiId, {
      id: `${poiId}-mine`,
      rating,
      body: body ?? null,
      createdAt: new Date().toISOString(),
      helpful: 0,
      author: { id: 'me', handle: null, avatarUrl: null }
    });
    return later<{ id: string; replaced: boolean } | null>({ id: `${poiId}-mine`, replaced: false });
  },
  deleteReview: (poiId: string) => {
    myReviews.delete(poiId);
    return later<{ deleted: boolean } | null>({ deleted: true });
  },
  voteReview: (_reviewId: string, _helpful = true) => later<unknown>({}),
  reportReview: (_reviewId: string, _reason: string, _note?: string) => later<unknown>({}),
  leaderboard: (opts: { metric?: BoardMetric; scope?: BoardScope } = {}) => later<Board | null>(board(opts.metric ?? 'distance', opts.scope ?? 'friends')),
  live: () => later<{ flights: LiveFlight[] } | null>({ flights: live() }),
  feed: () => later<{ items: FeedItem[] } | null>({ items: feed() }),
  cheer: (itemId: string, on = true) => {
    cheers.set(itemId, on);
    return later<unknown>({});
  },
  profile: (userId: string) => later<Profile | null>(profileOf(userId)),
  follow: (userId: string, blocked = false) => {
    following.set(userId, !blocked && !(following.get(userId) ?? people().find((p) => p.id === userId)?.friend ?? false));
    return later<unknown>({});
  },
  friends: () =>
    later<{ friends: Array<PersonRef & { stats: PublicStats }> } | null>({
      friends: people()
        .filter(isFriend)
        .map((p) => ({ ...personRef(p), stats: p.stats }))
    })
};
