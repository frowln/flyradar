#!/usr/bin/env node
/**
 * App Store screenshots, 1290 × 2796 (the 6.9"/6.7" iPhone size), in all six
 * languages: a headline over a real screen of the app, rendered from the
 * browser preview with each language's own route and a daytime clock.
 *
 *   npx expo export --platform web --output-dir /tmp/skyatlas-web
 *   node scripts/preview/store.mjs --dist /tmp/skyatlas-web [--lang en,ru] [--out store-metadata/screenshots]
 *
 * Needs `playwright-core` resolvable (e.g. NODE_PATH) and a Chromium; set
 * CHROMIUM_PATH if it is not at the Playwright default location.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '../..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const dist = resolve(args.dist ?? '/tmp/skyatlas-web');
const out = resolve(args.out ?? join(app, 'store-metadata/screenshots'));
const langs = (args.lang ?? 'en,ru,de,fr,es,ja').split(',');

/** A daytime moment over each language's route (see SCENES in fixtures.web.ts). */
const AT = { ru: '2026-09-24T10:30:00Z', en: '2026-09-24T19:00:00Z', default: '2026-09-24T11:00:00Z' };

const SHOTS = [
  { key: 'aloft', scenario: 'aloft' },
  { key: 'board', scenario: 'board', focus: '[data-testid="window-advice"]', block: 'center' },
  { key: 'place', scenario: 'place' },
  { key: 'guess', scenario: 'guess', focus: '[data-testid="guess-card"]' },
  { key: 'passport', scenario: 'arrival', wait: 5000 }
];

const COPY = {
  en: {
    aloft: ['What’s out of the window, right now', 'Left, right and below — even in airplane mode'],
    board: ['Know which window to ask for', 'Sides, minutes and daylight for your exact flight'],
    place: ['Every place, with its story', 'Stories and photos from Wikipedia, saved for the flight'],
    guess: ['Guess what’s next', 'A game for the window seat'],
    passport: ['A passport of the sky', 'Every country you flew over, every place you saw']
  },
  ru: {
    aloft: ['Что за окном — прямо сейчас', 'Слева, справа и под вами. Даже в авиарежиме'],
    board: ['Какое окно выбрать', 'Стороны, минуты и светлое время — для вашего рейса'],
    place: ['У каждого места — своя история', 'Истории и фото из Википедии, сохранённые на полёт'],
    guess: ['Угадайте, что впереди', 'Игра для тех, кто у окна'],
    passport: ['Паспорт неба', 'Каждая страна под крылом и каждое увиденное место']
  },
  de: {
    aloft: ['Was draußen ist – genau jetzt', 'Links, rechts und unter Ihnen. Auch im Flugmodus'],
    board: ['Welches Fenster sich lohnt', 'Seite, Minute und Tageslicht für Ihren Flug'],
    place: ['Jeder Ort mit seiner Geschichte', 'Texte und Fotos aus Wikipedia, für den Flug gespeichert'],
    guess: ['Raten Sie, was als Nächstes kommt', 'Ein Spiel für den Fensterplatz'],
    passport: ['Ein Pass für den Himmel', 'Jedes überflogene Land, jeder gesehene Ort']
  },
  fr: {
    aloft: ['Derrière le hublot, en ce moment', 'À gauche, à droite, en dessous. Même en mode avion'],
    board: ['Le bon côté pour le hublot', 'Côté, minute et lumière du jour pour votre vol'],
    place: ['Chaque lieu a son histoire', 'Récits et photos de Wikipédia, enregistrés pour le vol'],
    guess: ['Devinez ce qui arrive', 'Un jeu pour le siège hublot'],
    passport: ['Un passeport du ciel', 'Chaque pays survolé, chaque lieu aperçu']
  },
  es: {
    aloft: ['Lo que hay tras la ventanilla, ahora', 'A la izquierda, a la derecha y debajo. Incluso en modo avión'],
    board: ['Qué ventanilla elegir', 'Lado, minuto y luz del día para tu vuelo'],
    place: ['Cada lugar, con su historia', 'Historias y fotos de Wikipedia, guardadas para el vuelo'],
    guess: ['Adivina lo que viene', 'Un juego para la ventanilla'],
    passport: ['Un pasaporte del cielo', 'Cada país sobrevolado, cada lugar visto']
  },
  ja: {
    aloft: ['いま窓の外に見えるもの', '左・右・真下。機内モードでも'],
    board: ['どちらの窓側を選ぶか', 'あなたの便の見える側・時刻・日照'],
    place: ['見える場所それぞれの物語', 'Wikipediaの解説と写真を機内用に保存'],
    guess: ['次に見えるものを当てよう', '窓側席のためのゲーム'],
    passport: ['空のパスポート', '上空を通過した国と見つけた場所をすべて記録']
  }
};

const fonts = join(app, '../../node_modules/@expo-google-fonts');
const face = async (family, file) =>
  `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${(await readFile(join(fonts, file))).toString('base64')})}`;
const css =
  (await face('Display', 'manrope/800ExtraBold/Manrope_800ExtraBold.ttf')) +
  (await face('Text', 'inter/500Medium/Inter_500Medium.ttf')) +
  (await face('Mono', 'jetbrains-mono/500Medium/JetBrainsMono_500Medium.ttf')) +
  (await face('JP', 'noto-sans-jp/700Bold/NotoSansJP_700Bold.ttf'));

const W = 1290;
const H = 2796;
const SCREEN_W = 1030;
const SCREEN_TOP = 700;

function frame(lang, [title, sub], screenB64) {
  const jp = lang === 'ja' ? "'JP'," : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}
  body{margin:0;width:${W}px;height:${H}px;overflow:hidden;position:relative;background:radial-gradient(ellipse at 50% 0%,#161B22 0%,#0B0E11 60%)}
  .head{position:absolute;left:110px;right:110px;top:150px}
  .mark{font:500 30px 'Mono';letter-spacing:9px;color:#FF9E3D}
  h1{margin:30px 0 0;font:800 ${lang === 'ja' ? 96 : 100}px/1.08 ${jp}'Display';color:#E9EEF4;letter-spacing:-1px}
  p{margin:30px 0 0;font:500 42px/1.35 ${jp}'Text';color:#9AA5B4}
  .screen{position:absolute;left:${(W - SCREEN_W) / 2}px;top:${SCREEN_TOP}px;width:${SCREEN_W}px;border-radius:64px;overflow:hidden;border:3px solid #242B34}
  .screen img{display:block;width:${SCREEN_W}px}
  </style></head><body>
  <div class="head"><div class="mark">SKYATLAS</div><h1>${title}</h1><p>${sub}</p></div>
  <div class="screen"><img src="data:image/png;base64,${screenB64}"></div>
  </body></html>`;
}

const { port, close } = await serve(dist);
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });

for (const lang of langs) {
  const dir = join(out, lang);
  await mkdir(dir, { recursive: true });
  const at = AT[lang] ?? AT.default;
  for (const [i, shot] of SHOTS.entries()) {
    const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${port}/?scenario=${shot.scenario}&lang=${lang}&at=${at}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(shot.wait ?? 3000);
    if (shot.focus) {
      const found = await page.evaluate(
        ([sel, block]) => {
          const el = document.querySelector(sel);
          el?.scrollIntoView({ block });
          return !!el;
        },
        [shot.focus, shot.block ?? 'start']
      );
      if (!found) errors.push(`${shot.focus} not on screen`);
      await page.waitForTimeout(800);
    }
    const screen = await page.screenshot();
    await page.close();

    const canvas = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await canvas.setContent(frame(lang, COPY[lang][shot.key], screen.toString('base64')), { waitUntil: 'load' });
    await canvas.evaluate(() => document.fonts.ready);
    const file = join(dir, `${String(i + 1).padStart(2, '0')}-${shot.key}.jpg`);
    await writeFile(file, await canvas.screenshot({ type: 'jpeg', quality: 90 }));
    await canvas.close();
    console.log(`${file}${errors.length ? `  ⚠ ${errors.join(' | ').slice(0, 300)}` : ''}`);
  }
}
await browser.close();
close();
