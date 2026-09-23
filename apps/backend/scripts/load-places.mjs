#!/usr/bin/env node
/**
 * Loads the place dataset built by `build-places.py` into the POI table.
 *
 * This is what replaces asking free geo APIs for places at request time. Those
 * refuse often enough — "the server is probably too busy", 429 on nine requests
 * in ten — that a thirteen-hour flight came back with a dozen places, most of
 * them from a hardcoded list of world landmarks. Held locally, the same lookup
 * is a bounding-box query with no network and no quota.
 *
 * Run: node scripts/load-places.mjs [directory containing the .tsv.gz files]
 */
import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const dir = process.argv[2] ?? '.';
const BATCH = 2000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] })
});

function lines(file) {
  return createInterface({
    input: createReadStream(join(dir, file)).pipe(createGunzip()),
    crlfDelay: Infinity
  });
}

/**
 * Names and article titles, grouped by place.
 *
 * `names.tsv` arrives in the dump's own order rather than grouped, so this is a
 * map rather than a streaming merge. It is the one part of the load that holds
 * data proportional to the dataset — a few hundred megabytes on a developer
 * machine, against hours of random-access lookups if it did not.
 */
async function readNames() {
  const byId = new Map();
  let count = 0;
  for await (const line of lines('names.tsv.gz')) {
    const [id, lang, kind, ...rest] = line.split('\t');
    const value = rest.join('\t');
    if (!id || !lang || !value) continue;
    let entry = byId.get(id);
    if (!entry) {
      entry = { names: {}, preferred: new Set(), wiki: {} };
      byId.set(id, entry);
    }
    if (kind === 'wiki') {
      entry.wiki[lang] = value;
    } else {
      // A name flagged preferred wins; a second unflagged one must not clobber it.
      const isPreferred = kind === 'name1';
      if (isPreferred) {
        entry.names[lang] = value;
        entry.preferred.add(lang);
      } else if (!entry.preferred.has(lang) && !entry.names[lang]) {
        entry.names[lang] = value;
      }
    }
    if (++count % 1_000_000 === 0) process.stdout.write(`\r  read ${count / 1e6}M names`);
  }
  process.stdout.write(`\r  read ${count.toLocaleString()} names for ${byId.size.toLocaleString()} places\n`);
  return byId;
}

async function main() {
  console.log('Reading names…');
  const names = await readNames();

  console.log('Clearing POI table…');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "POI"');

  console.log('Loading places…');
  let batch = [];
  let total = 0;
  const byCategory = {};

  const flush = async () => {
    if (batch.length === 0) return;
    await prisma.pOI.createMany({ data: batch, skipDuplicates: true });
    total += batch.length;
    batch = [];
    process.stdout.write(`\r  inserted ${total.toLocaleString()}`);
  };

  for await (const line of lines('places.tsv.gz')) {
    const [gid, fallbackName, category, lat, lon, elevation, population, prominence] =
      line.split('\t');
    if (!gid || !fallbackName) continue;

    const extra = names.get(gid);
    const localised = extra?.names ?? {};
    const wikiTitles = extra?.wiki ?? {};

    batch.push({
      id: `gn-${gid}`,
      // The dump's own `name` is the local-language one; English is preferred as
      // the fallback label because every other language falls back to it.
      name: localised['en'] ?? fallbackName,
      names: localised,
      category,
      lat: Number(lat),
      lon: Number(lon),
      elevation: Number(elevation) || null,
      population: Number(population) || null,
      wikiTitle: wikiTitles['en'] ?? null,
      wikiTitles,
      prominence: Number(prominence) || 0
    });
    byCategory[category] = (byCategory[category] ?? 0) + 1;

    if (batch.length >= BATCH) await flush();
  }
  await flush();
  process.stdout.write('\n');

  console.log(`\nPOI table now holds ${(await prisma.pOI.count()).toLocaleString()} places.`);
  for (const [name, n] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name.padEnd(10)} ${n.toLocaleString()}`);
  }

  const withRu = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM "POI" WHERE names ? 'ru'`
  );
  console.log(`\nWith a Russian name: ${withRu[0].n.toLocaleString()}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
