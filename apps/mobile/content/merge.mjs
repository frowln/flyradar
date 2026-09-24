#!/usr/bin/env node
/**
 * Merges a chunk of entries into a batch file, keeping the input order.
 *
 *   node content/merge.mjs <lang> <batch> <chunk.json> [more chunks…]
 *
 * Writers produce a few dozen entries at a time; this keeps each write small
 * and the batch file always valid.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const [lang, batch, ...chunks] = process.argv.slice(2);
if (!lang || !batch || !chunks.length) {
  console.error('usage: node content/merge.mjs <lang> <batch> <chunk.json>…');
  process.exit(2);
}
const order = JSON.parse(readFileSync(join(root, 'places/input', `${batch}.json`), 'utf8')).map((r) => r.key);
const target = join(root, 'places', lang, `${batch}.json`);
mkdirSync(dirname(target), { recursive: true });
const current = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : {};
for (const c of chunks) Object.assign(current, JSON.parse(readFileSync(c, 'utf8')));
const sorted = {};
for (const k of order) if (current[k]) sorted[k] = current[k];
for (const k of Object.keys(current)) if (!sorted[k]) sorted[k] = current[k];
writeFileSync(target, JSON.stringify(sorted, null, 2) + '\n');
console.log(`${lang}/${batch}: ${Object.keys(sorted).length} of ${order.length}`);
