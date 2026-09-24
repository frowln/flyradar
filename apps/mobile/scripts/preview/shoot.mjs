#!/usr/bin/env node
/**
 * Screenshots of every screen, from the browser preview build.
 *
 * `tsc` and a green test run do not show that a screen looks right; this does.
 * It serves a `expo export --platform web` build, opens each preview scenario
 * (see src/preview/fixtures.web.ts) at iPhone size and saves a PNG per screen.
 *
 *   npx expo export --platform web --output-dir /tmp/skyatlas-web
 *   node scripts/preview/shoot.mjs --dist /tmp/skyatlas-web --out /tmp/shots [--lang ru]
 *
 * Needs `playwright-core` resolvable (e.g. NODE_PATH) and a Chromium; set
 * CHROMIUM_PATH if it is not at the Playwright default location.
 */
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';

const require = createRequire(import.meta.url);
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const dist = resolve(args.dist ?? '/tmp/skyatlas-web');
const out = resolve(args.out ?? '/tmp/skyatlas-shots');
const langs = (args.lang ?? 'ru').split(',');
const only = args.only ? args.only.split(',') : null;

const SCENARIOS = [
  { name: 'onboarding', scenario: 'onboarding' },
  { name: 'empty', scenario: 'empty' },
  { name: 'board', scenario: 'board', full: true },
  { name: 'add', scenario: 'add' },
  { name: 'aloft', scenario: 'aloft', full: true },
  { name: 'place', scenario: 'place', full: true },
  { name: 'arrival', scenario: 'arrival', full: true, wait: 4000 },
  { name: 'atlas', scenario: 'atlas', full: true },
  { name: 'achievements', scenario: 'achievements', full: true },
  { name: 'settings', scenario: 'settings', full: true },
  { name: 'guess', scenario: 'guess', full: true },
  { name: 'licenses', scenario: 'licenses' }
];

const { port, close } = await serve(dist);
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
await mkdir(out, { recursive: true });

for (const lang of langs) {
  for (const s of SCENARIOS) {
    if (only && !only.includes(s.name)) continue;
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`http://localhost:${port}/?scenario=${s.scenario}&lang=${lang}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(s.wait ?? 2500);
    const file = join(out, `${lang}-${s.name}.png`);
    if (s.full) {
      // React Native Web scrolls inside a view, not the page: grow the viewport
      // to the scroll content so the whole screen lands in one image.
      const h = await page.evaluate(() => {
        let max = window.innerHeight;
        for (const el of document.querySelectorAll('*')) {
          if (el.scrollHeight > el.clientHeight + 10 && getComputedStyle(el).overflowY !== 'visible') {
            max = Math.max(max, el.scrollHeight + (window.innerHeight - el.clientHeight));
          }
        }
        return Math.min(max, 6000);
      });
      await page.setViewportSize({ width: 390, height: Math.round(h) });
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: file });
    console.log(`${file}${errors.length ? `  ⚠ ${errors.slice(0, 3).join(' | ').slice(0, 300)}` : ''}`);
    await page.close();
  }
}
await browser.close();
close();
