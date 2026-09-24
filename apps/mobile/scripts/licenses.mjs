#!/usr/bin/env node
/**
 * Writes src/legal/licenses.json: every npm package whose code ships inside the
 * app, with its licence and copyright line, plus one full text per licence
 * type. Shown in Settings → Licences.
 *
 * "Ships" is taken literally: the script exports the iOS bundle with a source
 * map and lists the packages the map names — not the dependency tree, which
 * would drag in the CLI, Babel and Metro that never leave the build machine.
 * Run after changing dependencies (takes a minute):
 *
 *   node scripts/licenses.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(app, '../..');
const out = join(app, 'src/legal/licenses.json');

function licenseOf(pkg) {
  const l = pkg.license ?? pkg.licenses;
  if (typeof l === 'string') return l;
  if (Array.isArray(l)) return l.map((x) => x.type ?? x).join(' OR ');
  if (l && typeof l === 'object') return l.type ?? 'UNKNOWN';
  return 'UNKNOWN';
}

function copyrightOf(dir, pkg) {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  if (file) {
    const text = readFileSync(join(dir, file), 'utf8');
    const line = text.split(/\r?\n/).find((l) => /copyright\s*(\(c\)|©|\d{4})/i.test(l));
    if (line) return line.trim().replace(/\s+/g, ' ').slice(0, 200);
  }
  const a = pkg.author;
  const who = typeof a === 'string' ? a.replace(/\s*[<(].*$/, '') : a?.name;
  return who ? `Copyright (c) ${who}` : '';
}

/** Package directories named by the bundle's source map, relative to the repo root. */
function bundledPackageDirs() {
  const dir = mkdtempSync(join(tmpdir(), 'skyatlas-licences-'));
  try {
    execFileSync('npx', ['expo', 'export', '--platform', 'ios', '--source-maps', '--output-dir', dir], { cwd: app, stdio: 'ignore' });
    const find = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? find(join(d, e.name)) : e.name.endsWith('.map') ? [join(d, e.name)] : []));
    const dirs = new Set();
    for (const mapFile of find(dir)) {
      for (const src of JSON.parse(readFileSync(mapFile, 'utf8')).sources) {
        const i = src.lastIndexOf('node_modules/');
        if (i < 0) continue;
        const rest = src.slice(i + 13).split('/');
        const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
        dirs.add(src.slice(0, i + 13) + name);
      }
    }
    return [...dirs];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const seen = new Map();
for (const rel of bundledPackageDirs()) {
  const dir = join(repo, rel);
  if (!existsSync(join(dir, 'package.json'))) continue;
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  seen.set(`${pkg.name}@${pkg.version}`, { name: pkg.name, version: pkg.version, license: licenseOf(pkg), copyright: copyrightOf(dir, pkg) });
}

// Packages whose LICENSE file carries no copyright line of its own.
const HOLDERS = {
  '@react-native/': 'Copyright (c) Meta Platforms, Inc. and affiliates.',
  'metro-runtime': 'Copyright (c) Meta Platforms, Inc. and affiliates.',
  '@posthog/core': 'Copyright (c) PostHog Inc.',
  assert: 'Copyright Joyent, Inc. and other Node contributors.'
};
for (const p of seen.values()) {
  if (p.copyright) continue;
  const k = Object.keys(HOLDERS).find((h) => p.name === h || (h.endsWith('/') && p.name.startsWith(h)));
  if (k) p.copyright = HOLDERS[k];
}

// Native libraries compiled into the binary by the packages above (CocoaPods
// and Gradle dependencies); they have no JavaScript, so the map cannot see them.
const NATIVE = [
  { name: 'Hermes', version: 'native', license: 'MIT', copyright: 'Copyright (c) Meta Platforms, Inc. and affiliates.' },
  { name: 'Folly', version: 'native', license: 'Apache-2.0', copyright: 'Copyright (c) Meta Platforms, Inc. and affiliates.' },
  { name: 'Boost', version: 'native', license: 'BSL-1.0', copyright: 'Boost Software License — Version 1.0' },
  { name: 'glog', version: 'native', license: 'BSD-3-Clause', copyright: 'Copyright (c) 2008, Google Inc.' },
  { name: 'fmt', version: 'native', license: 'MIT', copyright: 'Copyright (c) 2012 – present, Victor Zverovich and {fmt} contributors' },
  { name: 'double-conversion', version: 'native', license: 'BSD-3-Clause', copyright: 'Copyright 2006-2011, the V8 project authors.' },
  { name: 'SocketRocket', version: 'native', license: 'BSD-3-Clause', copyright: 'Copyright (c) 2016-present, Facebook, Inc.' },
  { name: 'MapLibre Native', version: 'native', license: 'BSD-2-Clause', copyright: 'Copyright (c) 2021 MapLibre contributors; Copyright (c) 2014-2020 Mapbox' },
  { name: 'MMKV', version: 'native', license: 'BSD-3-Clause', copyright: 'Copyright (C) 2018 THL A29 Limited, a Tencent company.' },
  { name: 'SDWebImage', version: 'native', license: 'MIT', copyright: 'Copyright (c) 2009-2020 Olivier Poitrey rs@dailymotion.com' },
  { name: 'libwebp', version: 'native', license: 'BSD-3-Clause', copyright: 'Copyright (c) 2010, Google Inc.' },
  { name: 'SQLite', version: 'native', license: 'Public domain', copyright: 'The SQLite source code is in the public domain.' },
  { name: 'Sentry Cocoa / Sentry Android', version: 'native', license: 'MIT', copyright: 'Copyright (c) 2015 Sentry' },
  { name: 'RevenueCat purchases-ios / purchases-android', version: 'native', license: 'MIT', copyright: 'Copyright (c) 2018 RevenueCat, Inc.' },
  { name: 'ZXing / Google ML Kit barcode (Android)', version: 'native', license: 'Apache-2.0', copyright: 'Copyright (C) 2008 ZXing authors; Google LLC' }
];

const packages = [...seen.values(), ...NATIVE].sort((a, b) => a.name.localeCompare(b.name));

const TEXTS = {
  MIT: 'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.',
  ISC: 'Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.',
  'BSD-2-Clause': 'Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n\n1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.\n2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.\n\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.',
  'BSD-3-Clause': 'Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n\n1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.\n2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.\n3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.\n\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.',
  'Apache-2.0': 'Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at https://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.',
  '0BSD': 'Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE.',
 'BSL-1.0': 'Permission is hereby granted, free of charge, to any person or organization obtaining a copy of the software and accompanying documentation covered by this license (the "Software") to use, reproduce, display, distribute, execute, and transmit the Software, and to prepare derivative works of the Software, and to permit third-parties to whom the Software is furnished to do so, all subject to the following: The copyright notices in the Software and this entire statement, including the above license grant, this restriction and the following disclaimer, must be included in all copies of the Software, in whole or in part. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.',
  'Unicode-DFS-2016': 'Unicode Data Files and Software License (2016). Permission is hereby granted, free of charge, to any person obtaining a copy of the Unicode data files and any associated documentation to deal in the Data Files or Software without restriction, provided that the copyright notice and this permission notice appear with all copies. Full text: https://www.unicode.org/license.txt',
  'OFL-1.1': 'This Font Software is licensed under the SIL Open Font License, Version 1.1. The full licence is available at https://openfontlicense.org — the fonts may be used, studied, modified and redistributed freely, provided they are not sold by themselves and derivative fonts keep the licence and do not use the reserved names.'
};

const fonts = [
  { name: 'Manrope', copyright: 'Copyright 2018 The Manrope Project Authors (https://github.com/sharanda/manrope)', license: 'OFL-1.1' },
  { name: 'Inter', copyright: 'Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)', license: 'OFL-1.1' },
  { name: 'JetBrains Mono', copyright: 'Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)', license: 'OFL-1.1' },
  { name: 'Noto Sans JP', copyright: 'Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name \'Source\'', license: 'OFL-1.1' }
];

const used = new Set([...packages.map((p) => p.license), 'OFL-1.1']);
const texts = Object.fromEntries(Object.entries(TEXTS).filter(([k]) => [...used].some((u) => u.includes(k))));
const json = JSON.stringify({ fonts, packages, texts }, null, 1) + '\n';

writeFileSync(out, json);
const by = {};
for (const p of packages) by[p.license] = (by[p.license] ?? 0) + 1;
console.log(`wrote ${packages.length} packages`, by);
