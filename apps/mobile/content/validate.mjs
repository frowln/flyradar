#!/usr/bin/env node
/**
 * Checks the hand-written place and history texts against STYLE.md.
 *
 *   node content/validate.mjs            # all languages
 *   node content/validate.mjs ru b1-peaks # one language, one batch
 *
 * Prints every problem and a coverage table; exits 1 on any error.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const LANGS = ['en', 'ru', 'de', 'fr', 'es', 'ja'];
const [onlyLang, onlyBatch] = process.argv.slice(2);

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const len = (s) => [...(s ?? '')].length;
const words = (s) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;

function checkEntry(where, lang, e, { story = true } = {}) {
  if (!e || typeof e !== 'object') return err(where, 'not an object');
  const ja = lang === 'ja';
  if (typeof e.t !== 'string' || !e.t.trim()) err(where, 't missing');
  else if (len(e.t) > (ja ? 40 : 60)) err(where, `t too long (${len(e.t)})`);
  if (story) {
    if (typeof e.s !== 'string' || !e.s.trim()) err(where, 's missing');
    else if (ja ? len(e.s) < 60 || len(e.s) > 170 : words(e.s) < 30 || words(e.s) > 85)
      err(where, `s length ${ja ? len(e.s) + ' chars' : words(e.s) + ' words'}`);
  }
  if (e.w != null && (typeof e.w !== 'string' || (ja ? len(e.w) > 70 : words(e.w) > 30))) err(where, 'w too long');
  if (!Array.isArray(e.f) || e.f.length < 1 || e.f.length > 4) err(where, 'f must have 1–4 facts');
  else e.f.forEach((f, i) => (typeof f !== 'string' || len(f) > 160) && err(where, `f[${i}] too long or not text`));
  if (e.q != null) {
    const q = e.q;
    if (typeof q.q !== 'string' || len(q.q) > 110) err(where, 'q.q missing or too long');
    if (typeof q.a !== 'string' || len(q.a) > 50) err(where, 'q.a missing or too long');
    if (!Array.isArray(q.x) || q.x.length !== 2) err(where, 'q.x must have two wrong answers');
    else if (new Set([q.a, ...q.x]).size !== 3) err(where, 'q answers must differ');
  }
  for (const [k, v] of Object.entries(e)) {
    if (!['t', 's', 'w', 'f', 'q'].includes(k)) err(where, `unknown field ${k}`);
    const text = JSON.stringify(v);
    if (/\b(TODO|lorem|XXX)\b/i.test(text)) err(where, `placeholder text in ${k}`);
  }
}

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    err(file, `invalid JSON — ${e.message}`);
    return null;
  }
};

// Places
const inputDir = join(root, 'places/input');
const batches = readdirSync(inputDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
const coverage = {};
for (const batch of batches) {
  if (onlyBatch && batch !== onlyBatch) continue;
  const keys = new Set(readJson(join(inputDir, `${batch}.json`)).map((r) => r.key));
  coverage[batch] = { total: keys.size };
  for (const lang of LANGS) {
    if (onlyLang && lang !== onlyLang) continue;
    const file = join(root, 'places', lang, `${batch}.json`);
    if (!existsSync(file)) {
      coverage[batch][lang] = 0;
      continue;
    }
    const data = readJson(file);
    if (!data) continue;
    let n = 0;
    for (const [key, entry] of Object.entries(data)) {
      if (!keys.has(key)) err(`${lang}/${batch}/${key}`, 'key not in the input batch');
      checkEntry(`${lang}/${batch}/${key}`, lang, entry);
      n++;
    }
    coverage[batch][lang] = n;
  }
}

// History
const itemsFile = join(root, 'history/items.json');
if (existsSync(itemsFile)) {
  const items = readJson(itemsFile) ?? [];
  const keys = new Set();
  for (const it of items) {
    const where = `history/items/${it.key}`;
    if (!it.key || keys.has(it.key)) err(where, 'missing or duplicate key');
    keys.add(it.key);
    if (!['route', 'site', 'region'].includes(it.kind)) err(where, 'kind must be route, site or region');
    if (it.kind === 'route') {
      if (!Array.isArray(it.path) || it.path.length < 2) err(where, 'route needs a path of ≥ 2 [lon, lat] points');
      else for (const p of it.path) if (!Array.isArray(p) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) err(where, `bad point ${JSON.stringify(p)}`);
    } else {
      if (typeof it.lat !== 'number' || typeof it.lon !== 'number') err(where, 'lat/lon required');
      if (typeof it.radius_km !== 'number' || it.radius_km <= 0 || it.radius_km > 1500) err(where, 'radius_km 1–1500 required');
    }
    if (typeof it.rank !== 'number' || it.rank < 1 || it.rank > 10) err(where, 'rank 1–10 required');
    for (const lang of ['en', 'ru']) if (!it.name?.[lang]) err(where, `name.${lang} missing`);
  }
  coverage.history = { total: keys.size };
  for (const lang of LANGS) {
    if (onlyLang && lang !== onlyLang) continue;
    const file = join(root, 'history', `${lang}.json`);
    if (!existsSync(file)) {
      coverage.history[lang] = 0;
      continue;
    }
    const data = readJson(file) ?? {};
    for (const [key, entry] of Object.entries(data)) {
      if (!keys.has(key)) err(`history/${lang}/${key}`, 'key not in items.json');
      const { name, era, ...text } = entry;
      if (typeof name !== 'string' || !name) err(`history/${lang}/${key}`, 'name missing');
      if (era != null && typeof era !== 'string') err(`history/${lang}/${key}`, 'era must be text');
      checkEntry(`history/${lang}/${key}`, lang, text);
    }
    coverage.history[lang] = Object.keys(data).length;
  }
}

console.table(coverage);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors.slice(0, 200)) console.error('  ' + e);
  process.exit(1);
}
console.log('content valid');
