#!/usr/bin/env node
/**
 * Builds the app's text assets from content/:
 *
 *   assets/data/stories.<lang>.skydata   place and history texts, one file per language
 *   assets/data/history.skydata          history items with their geometry
 *
 *   node scripts/content/build.mjs
 *
 * Only the reader's language is ever loaded on the phone. Run after editing
 * anything in content/ (content/validate.mjs first).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataPath } from '../data/lib.mjs';

const app = join(dirname(fileURLToPath(import.meta.url)), '../..');
const content = join(app, 'content');
const LANGS = ['en', 'ru', 'de', 'fr', 'es', 'ja'];
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));

const itemsFile = join(content, 'history/items.json');
const items = existsSync(itemsFile) ? read(itemsFile) : [];
writeFileSync(dataPath('history.json'), JSON.stringify({ version: 1, items }));

for (const lang of LANGS) {
  const places = {};
  const dir = join(content, 'places', lang);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) Object.assign(places, read(join(dir, f)));
  }
  const historyFile = join(content, 'history', `${lang}.json`);
  const history = existsSync(historyFile) ? read(historyFile) : {};
  writeFileSync(dataPath(`stories.${lang}.json`), JSON.stringify({ version: 1, lang, places, history }));
  console.log(`stories.${lang}: ${Object.keys(places).length} places, ${Object.keys(history).length} history`);
}
console.log(`history: ${items.length} items`);
