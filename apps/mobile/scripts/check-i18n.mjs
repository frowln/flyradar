#!/usr/bin/env node
/**
 * Fails the build when a translation key used in the UI is missing from a locale.
 *
 * This exists because i18n-js renders a missing key as the literal string
 * `[missing "ru.stats.activity" translation]` — it does not throw, does not warn
 * at build time, and looks completely fine in the language the author speaks.
 * Three screens shipped with visible placeholder text before this check existed.
 *
 * Run: node scripts/check-i18n.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = ['en', 'ru', 'de', 'fr', 'es', 'ja'];

/** Only static keys can be checked; template keys are reported separately. */
const STATIC_KEY = /\bt\(\s*'([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)'\s*[),]/g;
const TEMPLATE_KEY = /\bt\(\s*`([a-zA-Z0-9_]+)\.\$\{/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Reads a locale module without a TS toolchain: the file is a plain object literal. */
function loadLocale(code) {
  const src = readFileSync(join(root, 'src/i18n/locales', `${code}.ts`), 'utf8');
  const body = src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1);
  // The locale files are static data — no expressions, no imports.
  return Function(`"use strict"; return (${body});`)();
}

const has = (obj, path) =>
  path.split('.').reduce((node, part) => (node == null ? undefined : node[part]), obj) !== undefined;

const files = [...walk(join(root, 'ui')), ...walk(join(root, 'src'))].filter(
  (f) => !f.includes('/i18n/locales/')
);

const staticKeys = new Set();
const dynamicNamespaces = new Set();

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(STATIC_KEY)) staticKeys.add(m[1]);
  for (const m of src.matchAll(TEMPLATE_KEY)) dynamicNamespaces.add(m[1]);
}

const locales = Object.fromEntries(LOCALES.map((code) => [code, loadLocale(code)]));

let failed = false;

for (const key of [...staticKeys].sort()) {
  const missing = LOCALES.filter((code) => !has(locales[code], key));
  if (missing.length) {
    console.error(`✗ ${key} — missing in: ${missing.join(', ')}`);
    failed = true;
  }
}

// Template keys such as t(`category.${poi.category}`) cannot be resolved
// statically, so compare the whole namespace against the reference locale.
for (const ns of [...dynamicNamespaces].sort()) {
  const reference = locales.en[ns];
  if (!reference) {
    console.error(`✗ namespace "${ns}" — missing in: en`);
    failed = true;
    continue;
  }
  for (const code of LOCALES) {
    const block = locales[code][ns];
    const gaps = Object.keys(reference).filter((k) => block?.[k] === undefined);
    if (gaps.length) {
      console.error(`✗ ${ns}.{${gaps.join(',')}} — missing in: ${code}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('\nA key used in the UI has no translation. It would render as visible\nplaceholder text, e.g. [missing "ru.stats.activity" translation].');
  process.exit(1);
}

console.log(
  `All ${staticKeys.size} keys and ${dynamicNamespaces.size} dynamic namespaces present in ${LOCALES.length} locales.`
);
