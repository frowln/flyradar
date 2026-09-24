#!/usr/bin/env node
/**
 * Renders the app icon, splash, Android adaptive/notification icons and the
 * favicon from the SVG sources in assets/brand/.
 *
 *   NODE_PATH=<dir with playwright-core>/node_modules node scripts/brand/render-icons.mjs
 *
 * Uses the Chromium that ships in the dev container (or CHROMIUM_PATH). The
 * PNGs are committed; run this only after editing the SVGs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const { PNG } = require('pngjs');

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const brand = join(root, 'assets/brand');
const mark = readFileSync(join(brand, 'mark.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const notification = readFileSync(join(brand, 'notification.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

const GROUND = '#0B0E11';

/** name → [size, html body, transparent?] */
const jobs = [
  // App Store / home screen: full bleed, opaque; iOS applies its own mask.
  ['icon.png', 1024, `<div style="width:1024px;height:1024px;background:radial-gradient(circle at 50% 42%, #12161B, ${GROUND} 75%);overflow:hidden"><div style="transform:scale(1.14);transform-origin:50% 50%">${mark}</div></div>`, false],
  // Splash: the mark alone, the native splash paints the ground colour.
  ['splash-icon.png', 1024, `<div style="width:1024px;height:1024px">${mark}</div>`, true],
  // Android adaptive foreground: the launcher crops to the inner ~66%, so shrink.
  ['adaptive-icon.png', 1024, `<div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center"><div style="width:700px;height:700px">${mark.replace('width="1024" height="1024"', 'width="700" height="700"')}</div></div>`, true],
  ['notification-icon.png', 96, `<div style="width:96px;height:96px">${notification}</div>`, true],
  // The landing site's icon and favicon: small enough to load on a phone.
  ['../../../landing/icon.png', 256, `<div style="width:256px;height:256px;background:radial-gradient(circle at 50% 42%, #12161B, ${GROUND} 75%);overflow:hidden"><div style="transform:scale(1.14);transform-origin:50% 50%">${mark.replace('width="1024" height="1024"', 'width="256" height="256"')}</div></div>`, false],
  ['favicon.png', 48, `<div style="width:48px;height:48px;background:${GROUND}">${mark.replace('width="1024" height="1024"', 'width="48" height="48"')}</div>`, false]
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' }).catch(async () => {
  const { readdirSync } = await import('node:fs');
  const dir = readdirSync('/opt/pw-browsers').find((d) => d.startsWith('chromium'));
  return chromium.launch({ executablePath: join('/opt/pw-browsers', dir, 'chrome-linux/chrome') });
});
const page = await browser.newPage();
for (const [name, size, body, transparent] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${body}</body></html>`);
  let png = await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  if (!transparent) {
    // App Store rejects icons with an alpha channel, even a fully opaque one.
    const img = PNG.sync.read(png);
    png = PNG.sync.write(img, { colorType: 2 });
  }
  writeFileSync(join(root, 'assets', name), png);
  console.log('wrote assets/' + name);
}
await browser.close();
