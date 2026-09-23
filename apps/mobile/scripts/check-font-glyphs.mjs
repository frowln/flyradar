#!/usr/bin/env node
/**
 * Fails the build if a bundled font is missing glyphs for a language we ship.
 *
 * This exists because Fraunces shipped for months as the display face while
 * carrying no Cyrillic at all: every Russian heading silently fell back to a
 * system serif, and nothing in the toolchain complained. A font that loads is
 * not a font that renders.
 *
 * Run: node scripts/check-font-glyphs.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Resolve through node's own algorithm rather than a fixed node_modules path:
// this is an npm workspace, so @expo-google-fonts is hoisted to the repo root.
const require = createRequire(import.meta.url);

/** One representative codepoint per script/diacritic set we ship. */
const REQUIRED = {
  en: [0x0041, 0x007a], // A z
  ru: [0x0410, 0x044f, 0x0401], // А я Ё
  de: [0x00fc, 0x00df], // ü ß
  fr: [0x00e9, 0x00e7], // é ç
  es: [0x00f1, 0x00bf], // ñ ¿
  ja: [0x3042, 0x30ab, 0x7a7a] // あ カ 空
};

/**
 * Which languages each face must cover. The Latin trio does not carry Japanese
 * on purpose — the ja locale switches to Noto Sans JP at runtime
 * (see src/theme/typography.ts).
 */
const FONTS = [
  { file: '@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf', langs: ['en', 'ru', 'de', 'fr', 'es'] },
  { file: '@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf', langs: ['en', 'ru', 'de', 'fr', 'es'] },
  { file: '@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf', langs: ['en', 'ru', 'de', 'fr', 'es'] },
  { file: '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf', langs: ['en', 'ru', 'de', 'fr', 'es'] },
  { file: '@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf', langs: ['en', 'ru', 'de', 'fr', 'es'] },
  {
    file: '@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf',
    langs: ['en', 'ru', 'de', 'fr', 'es']
  },
  { file: '@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf', langs: ['en', 'ru', 'ja'] },
  { file: '@expo-google-fonts/noto-sans-jp/700Bold/NotoSansJP_700Bold.ttf', langs: ['en', 'ru', 'ja'] }
];

/** Reads a TrueType cmap and returns the covered codepoint ranges. */
function coveredRanges(buf) {
  const numTables = buf.readUInt16BE(4);
  let cmapOffset = null;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (buf.toString('latin1', rec, rec + 4) === 'cmap') cmapOffset = buf.readUInt32BE(rec + 8);
  }
  if (cmapOffset == null) throw new Error('no cmap table');

  const ranges = [];
  const numSub = buf.readUInt16BE(cmapOffset + 2);
  for (let i = 0; i < numSub; i++) {
    const rec = cmapOffset + 4 + i * 8;
    const sub = cmapOffset + buf.readUInt32BE(rec + 4);
    const format = buf.readUInt16BE(sub);

    if (format === 4) {
      const segCountX2 = buf.readUInt16BE(sub + 6);
      const segCount = segCountX2 / 2;
      const endBase = sub + 14;
      const startBase = endBase + segCountX2 + 2;
      for (let s = 0; s < segCount; s++) {
        const end = buf.readUInt16BE(endBase + s * 2);
        const start = buf.readUInt16BE(startBase + s * 2);
        if (end !== 0xffff) ranges.push([start, end]);
      }
    } else if (format === 12) {
      const nGroups = buf.readUInt32BE(sub + 12);
      for (let g = 0; g < nGroups; g++) {
        const off = sub + 16 + g * 12;
        ranges.push([buf.readUInt32BE(off), buf.readUInt32BE(off + 4)]);
      }
    }
  }
  return ranges;
}

const covers = (ranges, cp) => ranges.some(([s, e]) => cp >= s && cp <= e);
const hex = (cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');

let failed = false;

for (const { file, langs } of FONTS) {
  let ranges;
  try {
    ranges = coveredRanges(readFileSync(require.resolve(file)));
  } catch (err) {
    console.error(`✗ ${file}: could not read cmap — ${err.message}`);
    failed = true;
    continue;
  }

  const gaps = [];
  for (const lang of langs) {
    for (const cp of REQUIRED[lang]) {
      if (!covers(ranges, cp)) gaps.push(`${lang} ${hex(cp)}`);
    }
  }

  const name = file.split('/').pop();
  if (gaps.length) {
    console.error(`✗ ${name} is missing: ${gaps.join(', ')}`);
    failed = true;
  } else {
    console.log(`✓ ${name} — ${langs.join(' ')}`);
  }
}

if (failed) {
  console.error(
    '\nA bundled font lacks glyphs for a shipped language. It will render as a silent\n' +
      'system fallback, not as designed. Replace the face or narrow the locale set.'
  );
  process.exit(1);
}
console.log('\nAll bundled fonts cover their declared languages.');
