#!/usr/bin/env node
/**
 * Fills the Airport table from the OpenFlights dataset.
 *
 * Nothing ever wrote to that table. Flight lookup resolves the departure and
 * arrival IATA codes against it and returns null when either is missing, so
 * every lookup answered "flight not found" — including the ones where
 * AviationStack had happily returned the flight. An empty reference table looked
 * exactly like a bad flight number.
 *
 * Run: node scripts/seed-airports.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const SOURCE =
  'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat';

// Prisma 7 needs the adapter passed explicitly, exactly as src/db/prisma.ts does.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] })
});

/** OpenFlights ships CSV with quoted fields that may themselves contain commas. */
function parseLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

const nullable = (v) => (v === '\\N' || v === '' ? null : v);

console.log('Downloading OpenFlights airports…');
const res = await fetch(SOURCE);
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status}`);
  process.exit(1);
}
const text = await res.text();

const rows = [];
const seenIata = new Set();
const seenIcao = new Set();

for (const line of text.split('\n')) {
  if (!line.trim()) continue;
  const f = parseLine(line);
  const iata = nullable(f[4]);
  // A row with no IATA code cannot be matched to a flight, which is the only
  // thing this table is for.
  if (!iata || iata.length !== 3) continue;
  if (seenIata.has(iata)) continue;

  const lat = Number(f[6]);
  const lon = Number(f[7]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

  // icao is unique-or-null in the schema, so a duplicate has to become null
  // rather than abort the whole import.
  let icao = nullable(f[5]);
  if (icao && (icao.length !== 4 || seenIcao.has(icao))) icao = null;
  if (icao) seenIcao.add(icao);

  seenIata.add(iata);
  rows.push({
    iata,
    icao,
    name: f[1] || iata,
    city: f[2] || '',
    country: f[3] || '',
    lat,
    lon,
    // Falling back to UTC keeps the row usable; a wrong offset only shifts the
    // local-time display, while a missing row breaks lookup entirely.
    tz: nullable(f[11]) ?? 'UTC'
  });
}

console.log(`Parsed ${rows.length} airports with IATA codes.`);

await prisma.airport.deleteMany();
const CHUNK = 500;
for (let i = 0; i < rows.length; i += CHUNK) {
  await prisma.airport.createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true });
  process.stdout.write(`\r  inserted ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
}
process.stdout.write('\n');

const total = await prisma.airport.count();
console.log(`Airport table now holds ${total} rows.`);

for (const code of ['SIN', 'LHR', 'SVO', 'JFK', 'DXB']) {
  const a = await prisma.airport.findUnique({ where: { iata: code } });
  console.log(`  ${code}: ${a ? `${a.name}, ${a.city} (${a.tz})` : 'MISSING'}`);
}

await prisma.$disconnect();
