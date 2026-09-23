#!/usr/bin/env node
/**
 * Seeds a realistic flight into a booted simulator's database.
 *
 * Development tool only. The app has no way to add a flight without the
 * AviationStack API, which is unreachable from Russia (Cloudflare blocks the
 * country outright), so screens that render a flight cannot otherwise be seen
 * or reviewed locally.
 *
 * The route is a real great circle for SQ322 Singapore → London, and the places
 * are real, with hand-edited copy — this doubles as the reference for what
 * curated card text should read like.
 *
 * Usage: node scripts/seed-demo-flight.mjs [device-udid]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BUNDLE_ID = 'com.skyatlas.app';
const udid = process.argv[2] ?? 'booted';

const SIN = { lat: 1.3644, lon: 103.9915 };
const LHR = { lat: 51.47, lon: -0.4543 };
const CRUISE_M = 11280;
const ROUTE_POINTS = 200;
const FLIGHT_SECONDS = 13 * 3600 + 40 * 60;

const R = 6371;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** Interpolates along the great circle between two points. */
function slerp(a, b, f) {
  const φ1 = toRad(a.lat), λ1 = toRad(a.lon);
  const φ2 = toRad(b.lat), λ2 = toRad(b.lon);
  const Δ =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((φ2 - φ1) / 2) ** 2 +
          Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2
      )
    );
  if (Δ === 0) return { ...a };
  const A = Math.sin((1 - f) * Δ) / Math.sin(Δ);
  const B = Math.sin(f * Δ) / Math.sin(Δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: toDeg(Math.atan2(z, Math.hypot(x, y))), lon: toDeg(Math.atan2(y, x)) };
}

/** Climb over the first 8%, descend over the last 12% — roughly a real profile. */
function altitudeAt(f) {
  if (f < 0.08) return Math.round((f / 0.08) * CRUISE_M);
  if (f > 0.88) return Math.round(((1 - f) / 0.12) * CRUISE_M);
  return CRUISE_M;
}

const route = Array.from({ length: ROUTE_POINTS }, (_, i) => {
  const f = i / (ROUTE_POINTS - 1);
  const p = slerp(SIN, LHR, f);
  return {
    lat: +p.lat.toFixed(5),
    lon: +p.lon.toFixed(5),
    altitude: altitudeAt(f),
    elapsedSeconds: Math.round(f * FLIGHT_SECONDS)
  };
});

/**
 * Places along the route. Copy is written the way a card should read at cruise:
 * one concrete hook first, 45–60 words, no encyclopedia throat-clearing.
 */
const places = [
  {
    id: 'poi-ipoh', name: 'Ipoh', ru: 'Ипох', category: 'city',
    lat: 4.5841, lon: 101.0829, population: 759952,
    summary:
      'Оловянная лихорадка XIX века превратила деревню на реке Кинта в один из богатейших городов Малайи. ' +
      'Британские особняки и вокзал в мавританском стиле остались, олово кончилось. ' +
      'Сегодня Ипох известен другим: кофе с загущённым молоком и известняковыми пещерами с буддийскими храмами внутри.',
    facts: ['Вокзал прозвали «Тадж-Махалом Ипоха»', 'Пещерный храм Перак Тонг расписан фресками на высоте 120 м']
  },
  {
    id: 'poi-andaman', name: 'Andaman Sea', ru: 'Андаманское море', category: 'sea',
    lat: 10.0, lon: 95.0,
    summary:
      'Под вами около 1 100 метров воды, а восточнее — жёлоб глубиной свыше 4 000. ' +
      'Именно здесь в 2004 году произошло землетрясение, сдвинувшее ось вращения Земли на несколько сантиметров. ' +
      'Андаманские острова на востоке — дом народа сентинельцев, которые не контактируют с внешним миром.',
    facts: ['Северный Сентинел закрыт для посещения законом Индии']
  },
  {
    id: 'poi-bengal', name: 'Bay of Bengal', ru: 'Бенгальский залив', category: 'sea',
    lat: 15.5, lon: 88.0,
    summary:
      'Крупнейший залив планеты: в него впадают Ганг, Брахмапутра и Иравади, и вместе они выносят столько ила, ' +
      'что подводный конус выноса тянется на 3 000 километров — это самая длинная осадочная структура на Земле.',
    facts: ['Конус выноса Ганга местами толщиной 16 км']
  },
  {
    id: 'poi-deccan', name: 'Deccan Plateau', ru: 'Деканское плоскогорье', category: 'landmark',
    lat: 17.5, lon: 78.0, elevation: 600,
    summary:
      '66 миллионов лет назад здесь два миллиона лет подряд изливалась лава — Деканские траппы. ' +
      'Слой базальта местами два километра толщиной. Многие геологи считают, что именно эти извержения, ' +
      'а не астероид, доконали динозавров.',
    facts: ['Площадь излияний была вдвое больше нынешней Индии']
  },
  {
    id: 'poi-thar', name: 'Thar Desert', ru: 'Пустыня Тар', category: 'landmark',
    lat: 27.0, lon: 71.5,
    summary:
      'Самая населённая пустыня мира: 83 человека на квадратный километр — плотнее, чем в иных европейских областях. ' +
      'Держится всё на муссоне, который приходит на несколько недель и наполняет колодцы на весь год.',
    facts: ['Джайсалмер — крепость, в которой до сих пор живут люди']
  },
  {
    id: 'poi-hindukush', name: 'Hindu Kush', ru: 'Гиндукуш', category: 'mountain',
    lat: 36.3, lon: 71.8, elevation: 7708,
    summary:
      'Александр Македонский провёл здесь армию в 329 году до н. э. и потерял на перевалах больше людей, ' +
      'чем во всех сражениях похода. Через эти же ущелья шёл Шёлковый путь: другой дороги из Индии в Среднюю Азию просто нет. ' +
      'Высшая точка — Тиричмир, 7 708 метров.',
    facts: ['Перевал Саланг лежит на высоте 3 878 м', 'Хребет растёт примерно на 7 мм в год']
  },
  {
    id: 'poi-amudarya', name: 'Amu Darya', ru: 'Амударья', category: 'river',
    lat: 39.0, lon: 63.0,
    summary:
      'Греки звали её Оксом и считали границей обитаемого мира. Две тысячи лет река поила Хорезм и Бухару, ' +
      'а в XX веке её разобрали на хлопок — и Аральское море, куда она впадала, исчезло за одно поколение.',
    facts: ['С 1960 года Арал потерял около 90 % объёма']
  },
  {
    id: 'poi-caspian', name: 'Caspian Sea', ru: 'Каспийское море', category: 'sea',
    lat: 41.5, lon: 50.5,
    summary:
      'Крупнейшее озеро планеты — остаток древнего океана Паратетис, отрезанного от Мирового океана. ' +
      'Уровень воды на 28 метров ниже океанского, а на дне — впадина глубиной больше километра. ' +
      'Здесь живёт 90 % всех осетровых мира.',
    facts: ['Пять стран до сих пор спорят, море это или озеро — от ответа зависит раздел нефти']
  },
  {
    id: 'poi-caucasus', name: 'Caucasus', ru: 'Кавказ', category: 'mountain',
    lat: 43.0, lon: 43.0, elevation: 5642,
    summary:
      'Граница Европы и Азии, проведённая по хребту. Эльбрус — 5 642 метра, высшая точка Европы, и это спящий вулкан. ' +
      'На площади меньше Австрии здесь говорят более чем на сорока языках: ущелья тысячелетиями разделяли соседей надёжнее государственных границ.',
    facts: ['Прометея, по легенде, приковали именно здесь']
  },
  {
    id: 'poi-carpathians', name: 'Carpathians', ru: 'Карпаты', category: 'mountain',
    lat: 47.5, lon: 24.5, elevation: 2655,
    summary:
      'Последний большой массив первобытного леса в Европе. Здесь живёт больше половины европейских бурых медведей ' +
      'и почти все зубры, которых вернули из зоопарков после того, как в дикой природе не осталось ни одного.',
    facts: ['Букові праліси Карпат — объект Всемирного наследия ЮНЕСКО']
  },
  {
    id: 'poi-alps', name: 'Alps', ru: 'Альпы', category: 'mountain',
    lat: 47.0, lon: 11.5, elevation: 4808,
    summary:
      'Хребет вырос там, где Африканская плита въехала в Евразийскую, и продолжает расти примерно на миллиметр в год. ' +
      'В 1991 году в леднике на границе Австрии и Италии нашли Эци — человека, погибшего 5 300 лет назад с наконечником стрелы в плече.',
    facts: ['Монблан — 4 808 м', 'Ледники Альп потеряли около половины объёма с 1900 года']
  },
  {
    id: 'poi-rhine', name: 'Rhine', ru: 'Рейн', category: 'river',
    lat: 50.0, lon: 7.5,
    summary:
      'Две тысячи лет Рейн был границей Римской империи, и по его левому берегу до сих пор стоят города, ' +
      'основанные легионами: Кёльн, Майнц, Бонн. Сегодня это самая загруженная водная артерия Европы.',
    facts: ['Скала Лорелей сужает русло до 113 метров — самое узкое место судоходного Рейна']
  }
];

const now = Date.now();
const departure = new Date(now + 3 * 3600 * 1000); // three hours out
const arrival = new Date(departure.getTime() + FLIGHT_SECONDS * 1000);

const pois = places.map((p) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  lat: p.lat,
  lon: p.lon,
  ...(p.elevation ? { elevation: p.elevation } : {}),
  ...(p.population ? { population: p.population } : {}),
  summary: p.summary,
  facts: p.facts ?? [],
  photos: [],
  translations: { ru: { name: p.ru, summary: p.summary, facts: p.facts ?? [] } }
}));

const pkg = {
  version: 1,
  flight: {
    id: 'SQ322-demo',
    flightNumber: 'SQ 322',
    airline: 'Singapore Airlines',
    aircraftType: 'Airbus A380-841',
    origin: {
      iata: 'SIN', icao: 'WSSS', name: 'Singapore Changi',
      city: 'Сингапур', country: 'SG', lat: SIN.lat, lon: SIN.lon, tz: 'Asia/Singapore'
    },
    destination: {
      iata: 'LHR', icao: 'EGLL', name: 'London Heathrow',
      city: 'Лондон', country: 'GB', lat: LHR.lat, lon: LHR.lon, tz: 'Europe/London'
    },
    scheduledDeparture: departure.toISOString(),
    scheduledArrival: arrival.toISOString()
  },
  route,
  pois,
  generatedAt: new Date(now).toISOString()
};

const container = execFileSync('xcrun', ['simctl', 'get_app_container', udid, BUNDLE_ID, 'data'], {
  encoding: 'utf8'
}).trim();
// expo-sqlite creates Documents/SQLite lazily on first open, so a freshly
// installed app has no such directory yet. Create it rather than requiring the
// app to be launched first — seeding before first launch is the common case.
const sqliteDir = join(container, 'Documents', 'SQLite');
mkdirSync(sqliteDir, { recursive: true });
const db = join(sqliteDir, 'skyatlas.db');

// The schema normally comes from the app's own migration on first open; create
// it here so the seed works against a database the app has never touched.
execFileSync('sqlite3', [
  db,
  `CREATE TABLE IF NOT EXISTS packages (
     flightId TEXT PRIMARY KEY, payload TEXT NOT NULL, downloadedAt INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS pois (
     id TEXT NOT NULL, flightId TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL,
     lat REAL NOT NULL, lon REAL NOT NULL, data TEXT NOT NULL, PRIMARY KEY (id, flightId));
   CREATE INDEX IF NOT EXISTS idx_pois_flight ON pois(flightId);
   CREATE INDEX IF NOT EXISTS idx_pois_location ON pois(flightId, lat, lon);`
]);

const esc = (v) => `'${String(v).replace(/'/g, "''")}'`;
const sql = [
  'PRAGMA journal_mode=WAL;',
  `DELETE FROM packages WHERE flightId = ${esc(pkg.flight.id)};`,
  `DELETE FROM pois WHERE flightId = ${esc(pkg.flight.id)};`,
  `INSERT INTO packages (flightId, payload, downloadedAt) VALUES (${esc(pkg.flight.id)}, ${esc(
    JSON.stringify(pkg)
  )}, ${now});`,
  ...pois.map(
    (p) =>
      `INSERT INTO pois (id, flightId, name, category, lat, lon, data) VALUES (${esc(p.id)}, ${esc(
        pkg.flight.id
      )}, ${esc(p.name)}, ${esc(p.category)}, ${p.lat}, ${p.lon}, ${esc(JSON.stringify(p))});`
  )
].join('\n');

const file = join(mkdtempSync(join(tmpdir(), 'skyatlas-seed-')), 'seed.sql');
writeFileSync(file, sql);
execFileSync('sqlite3', [db, `.read ${file}`], { stdio: 'inherit' });

console.log(`Seeded ${pkg.flight.flightNumber} ${pkg.flight.origin.iata}→${pkg.flight.destination.iata}`);
console.log(`  departs ${departure.toLocaleString()}  ·  ${pois.length} places  ·  ${route.length} route points`);
console.log(`  db: ${db}`);
