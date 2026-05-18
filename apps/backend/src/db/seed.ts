import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'node:fs';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL']! });
const prisma = new PrismaClient({ adapter });

const lines = readFileSync('data/airports.dat', 'utf-8').split('\n');
const airports = lines
  .map(l => l.split(','))
  .filter(p => p.length >= 12 && p[4]?.replaceAll('"', '').length === 3)
  .map(p => ({
    iata:    p[4].replaceAll('"', ''),
    icao:    p[5].replaceAll('"', '') || null,
    name:    p[1].replaceAll('"', ''),
    city:    p[2].replaceAll('"', ''),
    country: p[3].replaceAll('"', ''),
    lat:     parseFloat(p[6]),
    lon:     parseFloat(p[7]),
    tz:      p[11].replaceAll('"', '')
  }));

console.log(`Importing ${airports.length} airports...`);
let count = 0;
for (const a of airports) {
  try {
    await prisma.airport.upsert({
      where: { iata: a.iata },
      update: a,
      create: a as any
    });
    count++;
  } catch (e) {
    // Skip duplicates or invalid entries
  }
}
console.log(`Done: ${count} airports imported`);
await prisma.$disconnect();
