#!/usr/bin/env node
/**
 * Writes SkyAtlas place texts with Claude, for the places that have none yet.
 *
 * The hand-written texts in apps/mobile/content/ cover the ~1,300 most notable
 * places. This covers the rest, in the same format and under the same rules
 * (content/STYLE.md), through the Message Batches API (half the price of
 * regular calls; most batches finish within an hour).
 *
 *   cd tools/content-gen && npm install
 *   export ANTHROPIC_API_KEY=...
 *   node generate.mjs plan --name gen-01 --min-rank 4 --limit 2000
 *   node generate.mjs submit gen-01 [--model claude-opus-5] [--langs en,ru,de,fr,es,ja]
 *   node generate.mjs collect gen-01          # waits for the batch, writes the texts
 *   cd ../../apps/mobile && node content/validate.mjs && node scripts/content/build.mjs
 *
 * Generated texts are marked by their batch name (files gen-*.json), so they
 * can be reviewed — and replaced by hand — like any other batch.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '../../apps/mobile');
const content = join(app, 'content');
const stateDir = join(here, 'state');
const ALL_LANGS = ['en', 'ru', 'de', 'fr', 'es', 'ja'];

const [cmd, ...rest] = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1]?.startsWith('--') || rest[i + 1] == null ? true : rest[++i];
  else positional.push(rest[i]);
}

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

/** Keys that already have a text in every requested language. */
function covered(langs) {
  const have = langs.map((lang) => {
    const dir = join(content, 'places', lang);
    const keys = new Set();
    if (existsSync(dir)) for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) for (const k of Object.keys(readJson(join(dir, f)))) keys.add(k);
    return keys;
  });
  return (key) => have.every((s) => s.has(key));
}

function plan() {
  const name = flags.name;
  if (!name || !/^gen-[\w-]+$/.test(name)) throw new Error('--name gen-<something> is required');
  const minRank = Number(flags['min-rank'] ?? 4);
  const limit = Number(flags.limit ?? 2000);
  const kinds = flags.kinds ? String(flags.kinds).split(',') : null;
  const langs = String(flags.langs ?? ALL_LANGS.join(',')).split(',');
  const places = readJson(join(app, 'assets/data/places.skydata')).places;
  const countries = Object.fromEntries(readJson(join(app, 'assets/data/countries.skydata')).countries.map((c) => [c.cc, c.n]));
  const done = covered(langs);
  // Keys already assigned to another input batch are left to that batch.
  const inputDir = join(content, 'places/input');
  const planned = new Set(readdirSync(inputDir).flatMap((f) => readJson(join(inputDir, f)).map((r) => r.key)));
  const rows = places
    .filter((p) => p.r >= minRank && (!kinds || kinds.includes(p.k)))
    .map((p) => ({ key: p.wd ?? p.id, p }))
    .filter(({ key }) => !done(key) && !planned.has(key))
    .sort((a, b) => b.p.r - a.p.r)
    .slice(0, limit)
    .map(({ key, p }) => ({
      key,
      id: p.id,
      kind: p.k,
      name: p.n,
      ru: p.l?.ru,
      country: p.cc ? countries[p.cc] ?? p.cc : undefined,
      lat: +p.lat.toFixed(3),
      lon: +p.lon.toFixed(3),
      rank: p.r,
      elevation_m: p.el,
      population: p.pop,
      extent_km: p.ext
    }));
  writeFileSync(join(inputDir, `${name}.json`), JSON.stringify(rows, null, 1) + '\n');
  console.log(`${name}: ${rows.length} places (rank ≥ ${minRank})`);
}

const Entry = z.object({
  t: z.string(),
  s: z.string(),
  w: z.string(),
  f: z.array(z.string()),
  q: z.object({ q: z.string(), a: z.string(), x: z.array(z.string()) })
});

function schemaFor(langs) {
  return z.object(Object.fromEntries(langs.map((l) => [l, Entry])));
}

function systemPrompt(langs) {
  const style = readFileSync(join(content, 'STYLE.md'), 'utf8');
  return [
    'You write the in-app texts of SkyAtlas, an iPhone app for airplane window-seat passengers.',
    'Follow this style guide exactly — voice, truth rules and field limits:',
    style,
    `Write the entry for the place you are given in these languages: ${langs.join(', ')}. Each language is written natively, not translated word for word; the facts are the same in all of them.`,
    'Only include facts you are confident are well established. If you cannot identify the place with confidence from its name, kind, country and coordinates, write short, safe texts based on the given data only (kind, elevation, population, where it lies) — never invent history or numbers.',
    'Return JSON only, in the given schema: one object per language with t, s, w, f (2–3 facts) and q (one question, the right answer a, two plausible wrong answers x).'
  ].join('\n\n');
}

async function submit() {
  const name = positional[0];
  if (!name) throw new Error('usage: submit <gen-name>');
  const langs = String(flags.langs ?? ALL_LANGS.join(',')).split(',');
  // The default model follows Anthropic's current recommendation; pass
  // --model to trade quality for price (see README.md for rough costs).
  const model = String(flags.model ?? 'claude-opus-5');
  const rows = readJson(join(content, 'places/input', `${name}.json`));
  const format = zodOutputFormat(schemaFor(langs));
  const system = systemPrompt(langs);
  const client = new Anthropic();
  const requests = rows.map((row) => ({
    custom_id: row.key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
    params: {
      model,
      max_tokens: 8000,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Place:\n${JSON.stringify(row, null, 1)}` }],
      // Effort is not accepted by Haiku 4.5; everything newer takes it.
      output_config: model.includes('haiku') ? { format } : { effort: 'medium', format }
    }
  }));
  const ids = Object.fromEntries(rows.map((row, i) => [requests[i].custom_id, row.key]));
  const batches = [];
  // The API takes up to 100,000 requests per batch; smaller ones finish sooner.
  for (let i = 0; i < requests.length; i += 5000) {
    const b = await client.messages.batches.create({ requests: requests.slice(i, i + 5000) });
    batches.push(b.id);
    console.log(`batch ${b.id}: ${Math.min(5000, requests.length - i)} requests`);
  }
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, `${name}.json`), JSON.stringify({ name, model, langs, batches, ids }, null, 1));
  console.log(`saved state/${name}.json — run "node generate.mjs collect ${name}" when done`);
}

const len = (s) => [...(s ?? '')].length;

/** The same limits as content/validate.mjs, so a bad entry is dropped here rather than failing the build. */
function usable(lang, e) {
  const ja = lang === 'ja';
  const words = (s) => s.trim().split(/\s+/).length;
  if (!e?.t || len(e.t) > (ja ? 40 : 60)) return false;
  if (!e.s || (ja ? len(e.s) < 60 || len(e.s) > 170 : words(e.s) < 30 || words(e.s) > 85)) return false;
  if (!Array.isArray(e.f) || !e.f.length || e.f.some((f) => len(f) > 160)) return false;
  if (e.q && (e.q.x?.length !== 2 || new Set([e.q.a, ...e.q.x]).size !== 3)) delete e.q;
  e.f = e.f.slice(0, 3);
  return true;
}

async function collect() {
  const name = positional[0];
  if (!name) throw new Error('usage: collect <gen-name>');
  const state = readJson(join(stateDir, `${name}.json`));
  const client = new Anthropic();
  const out = Object.fromEntries(state.langs.map((l) => [l, {}]));
  const failed = [];
  for (const id of state.batches) {
    let batch = await client.messages.batches.retrieve(id);
    while (batch.processing_status !== 'ended') {
      console.log(`${id}: ${batch.processing_status}, ${batch.request_counts.processing} processing — waiting 60 s`);
      await new Promise((r) => setTimeout(r, 60_000));
      batch = await client.messages.batches.retrieve(id);
    }
    for await (const result of await client.messages.batches.results(id)) {
      const key = state.ids[result.custom_id];
      if (result.result.type !== 'succeeded') {
        failed.push({ key, why: result.result.type });
        continue;
      }
      const message = result.result.message;
      // A declined request carries no usable text.
      if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') {
        failed.push({ key, why: message.stop_reason });
        continue;
      }
      const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        failed.push({ key, why: 'invalid JSON' });
        continue;
      }
      for (const lang of state.langs) {
        if (usable(lang, data[lang])) out[lang][key] = data[lang];
        else failed.push({ key, why: `${lang} outside limits` });
      }
    }
  }
  for (const lang of state.langs) {
    const dir = join(content, 'places', lang);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(out[lang], null, 2) + '\n');
    console.log(`${lang}/${name}.json: ${Object.keys(out[lang]).length} entries`);
  }
  writeFileSync(join(stateDir, `${name}.failed.json`), JSON.stringify(failed, null, 1));
  console.log(`${failed.length} problems — see state/${name}.failed.json`);
  console.log('next: review a sample, then in apps/mobile run node content/validate.mjs && node scripts/content/build.mjs');
}

const commands = { plan, submit, collect };
if (!commands[cmd]) {
  console.error('usage: node generate.mjs plan|submit|collect … (see the comment at the top)');
  process.exit(2);
}
await commands[cmd]();
