#!/usr/bin/env node
/**
 * Checks the App Store listing texts against the store's limits and our own rules,
 * and prints the character-count table used in README.md.
 *
 * Run from apps/mobile:  node store-metadata/check.mjs
 * Exits 1 if anything is over a limit or breaks a rule.
 *
 * Characters are counted as Unicode code points ([...s].length), which is how
 * App Store Connect counts them: one Japanese character is one character.
 * The trailing newline at the end of each file is not counted.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LANGS = ['en', 'ru', 'de', 'fr', 'es', 'ja'];
const FILES = [
  ['name.txt', 30],
  ['subtitle.txt', 30],
  ['keywords.txt', 100],
  ['promotional-text.txt', 170],
  ['description.txt', 4000],
  ['whats-new.txt', 4000]
];

/** Claims the app cannot back, and pricing the listing must not mention. */
const FORBIDDEN = [
  /letterboxd/i, /wrapped/i, /\b46\b/, /unlimited|unbegrenzt|illimit|ilimitad|безлимит|無制限/i,
  /real[- ]?time (flight|data|track|position)|live (flight )?track/i, /satellite imag|спутников(ые|ых) сним/i, /\bAR\b/,
  /\bPro\b/, /subscri|abonnement|\bAbo\b|suscrip|подписк|サブスク/i, /\$|€|₽|¥|price|preis|prix|precio|цен[аы]|価格/i
];

/** Brand and competitor names that must not be used as keywords. */
const KEYWORD_BRANDS = /wikipedia|wikimedia|apple|wallet|google|flightradar|flighty|flightaware|letterboxd|skyatlas/i;

const words = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const count = (s) => [...s].length;

let failed = false;
const fail = (lang, file, msg) => {
  failed = true;
  console.error(`FAIL ${lang}/${file}: ${msg}`);
};

const table = {};
for (const lang of LANGS) {
  const text = {};
  for (const [file, limit] of FILES) {
    const path = join(ROOT, lang, file);
    if (!existsSync(path)) {
      fail(lang, file, 'missing');
      continue;
    }
    const s = readFileSync(path, 'utf8').replace(/\n+$/, '');
    text[file] = s;
    (table[file] ??= {})[lang] = count(s);
    if (count(s) > limit) fail(lang, file, `${count(s)} characters, limit ${limit}`);
    if (!s.trim()) fail(lang, file, 'empty');
    for (const re of FORBIDDEN) if (re.test(s)) fail(lang, file, `forbidden claim or pricing: ${re}`);
  }

  const kw = text['keywords.txt'];
  if (kw !== undefined) {
    if (/,\s|\s,/.test(kw)) fail(lang, 'keywords.txt', 'spaces around a comma');
    if (/\n/.test(kw)) fail(lang, 'keywords.txt', 'more than one line');
    const list = kw.split(',');
    if (list.some((k) => !k.trim())) fail(lang, 'keywords.txt', 'empty keyword');
    const seen = new Set();
    for (const k of list) {
      if (seen.has(k.toLowerCase())) fail(lang, 'keywords.txt', `duplicate "${k}"`);
      seen.add(k.toLowerCase());
      if (KEYWORD_BRANDS.test(k)) fail(lang, 'keywords.txt', `brand name "${k}"`);
    }
    const shown = `${text['name.txt'] ?? ''} ${text['subtitle.txt'] ?? ''}`;
    const shownWords = new Set(words(shown));
    const kwWords = list.flatMap(words);
    // Apple already indexes the name and subtitle; repeating their words wastes the field.
    for (const w of kwWords) if (shownWords.has(w)) fail(lang, 'keywords.txt', `"${w}" is already in the name or subtitle`);
    // Scripts without spaces between words: also catch a keyword hidden inside the name or subtitle.
    if (lang === 'ja') for (const k of list) if (shown.includes(k)) fail(lang, 'keywords.txt', `"${k}" is already in the name or subtitle`);
  }

  const wn = text['whats-new.txt'];
  if (wn !== undefined) {
    const lines = wn.split('\n').filter((l) => l.trim()).length;
    if (lines < 2 || lines > 4) fail(lang, 'whats-new.txt', `${lines} lines, expected 2–4`);
  }

  const name = text['name.txt'];
  if (name !== undefined && !name.startsWith('SkyAtlas')) fail(lang, 'name.txt', 'must start with "SkyAtlas"');
}

console.log(`| File (limit) | ${LANGS.join(' | ')} |`);
console.log(`| --- | ${LANGS.map(() => '---:').join(' | ')} |`);
for (const [file, limit] of FILES) {
  console.log(`| \`${file}\` (${limit}) | ${LANGS.map((l) => table[file]?.[l] ?? '—').join(' | ')} |`);
}

if (failed) process.exit(1);
console.log('\nAll limits and rules pass.');
