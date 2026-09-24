# SkyAtlas

**What is out of the window — even in flight mode.**

SkyAtlas is a companion for the passenger in the window seat. Before the flight
it tells you which side to sit on; in the air it shows what is out of each
window right now — mountains, seas, cities, borders, the Equator — and when the
next thing worth looking at comes up; after landing it stamps a passport of the
sky with every country you flew over and every place you saw with your own
eyes. Everything in the air works with the radio off.

---

## How it works

**No server is required.** A flight is prepared entirely on the phone from
datasets bundled with the app:

1. **Route.** Great circle between the airports, with a climb, cruise and
   descent profile. Where the great circle crosses closed airspace the route
   goes around it: Ukraine and Crimea are avoided by everyone; Russian and
   Belarusian carriers stay out of the EU/UK/US/Canada; western carriers stay
   out of Russia and Belarus (carrier taken from the flight number when given).
2. **Places.** ~9,300 notable places (peaks, volcanoes, ranges, deserts, seas,
   lakes, islands, rivers, cities) are measured against the route: closest
   approach, which side, at what minute, and for how long they are in
   recognition range from cruise. A varied, evenly spread set is kept.
3. **Countries and moments.** Countries crossed (with times), lines on the
   globe, sunrise/sunset on board, top of descent — a timeline of the flight.
4. **Stories.** While there is Wi-Fi, the phone fetches each place's
   Wikipedia article in the reader's language (via Wikidata) and its lead photo
   from Wikimedia Commons, with author and licence. Photos are cached for the
   flight. Without a connection the cards still work from data alone.
5. **Offline map.** MapLibre tiles for the route corridor (OpenFreeMap).

**On the ground:** a day before departure a local reminder says which window
to ask for at check-in (named by what will be on that side); just after the
scheduled departure, "Airborne?" with a lock-screen *Took off* button.

**In the air:** tap *took off*; the position comes from the time since takeoff,
refined by the phone's GPS when available. The flight screen shows what is on
the left, on the right and below, what comes next, and asks "which place is
about to appear?". Up to three (or six) local notifications announce the best
moments on the passenger's side. An optional audio guide reads places aloud.

**After landing:** stamps, XP and level, achievements, a quiz about the flight
just taken, and a postcard to send with "we landed".

A four-minute **demo flight** (20× speed) is available from onboarding and the
empty board.

---

## Repository

```
apps/
  mobile/          React Native + Expo SDK 54 (iOS first)
    ui/            screens, components, design system (tokens, type, layout)
    src/core/      logic: route, places, flight session, game, data, time
    assets/data/   bundled datasets (generated — see scripts/data)
    scripts/       dataset builders, i18n/font checks, browser preview shots
  backend/         optional Fastify + Prisma API (richer packages, social layer)
packages/shared/   types shared by app and backend
docs/              strategy, vision (docs/vision/), legal, handoff notes
```

### Mobile

| | |
|---|---|
| Framework | React Native 0.81, Expo SDK 54, new architecture |
| Map | MapLibre with offline corridor packs; SVG route plates elsewhere |
| Storage | SQLite (flight packages), MMKV (session, passport, settings) |
| Notifications | expo-notifications, local only |
| Position | clock + route model; expo-location in the foreground |
| Purchases | RevenueCat — **off unless a key is configured** |
| i18n | en, ru, de, fr, es, ja |
| Tests | Vitest (core logic) |

### Bundled data

Stored in `apps/mobile/assets/data/` as `*.skydata` (JSON; the extension makes
Metro ship them as asset files read at startup, not as part of the JS bundle).

| File | Contents | Source (licence) |
|---|---|---|
| `airports` | 4,008 airports with IATA code, city names in 6 languages, IANA time zone | OurAirports (public domain), mwgg/Airports time zones (MIT) |
| `places` | 9,343 places with names in 6 languages and Wikidata ids | Natural Earth (public domain) |
| `areas` | outlines of seas, deserts, ranges, lakes, islands | Natural Earth |
| `countries` | 258 countries and territories | Natural Earth |

Disputed areas (Crimea, Western Sahara, Kosovo, Northern Cyprus, Somaliland)
are separate regions, not attributed to a state. Rebuild with the scripts in
`apps/mobile/scripts/data/` (see its README); `npm run check:data` validates.

---

## Running the app

```bash
npm install                       # from the repo root (npm workspaces)
cd apps/mobile
npx expo run:ios                  # native build: the app uses native modules
```

The app is complete without a backend. Optional environment variables
(`apps/mobile/.env`, see `.env.example`):

| Variable | Effect |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend URL. Unset = fully on-device. |
| `EXPO_PUBLIC_SOCIAL=1` | Enables accounts, reviews and people (needs the backend). |
| `EXPO_PUBLIC_AUTH_HMAC_SECRET` | Request signing, must match the server's `AUTH_HMAC_SECRET`. |
| `EXPO_PUBLIC_RC_KEY` | RevenueCat key. Unset = no purchases, everything open. |
| `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_KEY` | Crash reporting and analytics. |
| `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL` | Public pages for the privacy policy and terms (Settings links to them). Unset = the Markdown files in this repository. |

### Checks

```bash
cd apps/mobile
npx tsc --noEmit
npx vitest run
npm run check:i18n      # every key used exists in all six locales
npm run check:fonts     # bundled fonts cover every shipped language
npm run check:data      # datasets match their schema, budgets and border checks
node store-metadata/check.mjs   # App Store texts within limits, no forbidden claims
```

### Release material

| What | Where | Regenerate |
|---|---|---|
| App icon, splash, Android adaptive and notification icons | `apps/mobile/assets/*.png` from `assets/brand/*.svg` | `node scripts/brand/render-icons.mjs` |
| Open-source licences shown in Settings | `apps/mobile/src/legal/licenses.json` | `node scripts/licenses.mjs` (after dependency changes) |
| App Store texts, 6 languages | `apps/mobile/store-metadata/<lang>/` | edit, then `node store-metadata/check.mjs` |
| App Store screenshots, 1290 × 2796, 6 languages | `apps/mobile/store-metadata/screenshots/<lang>/` | `node scripts/preview/store.mjs --dist <web export>` |
| Privacy policy and terms (en, ru) | `docs/legal/`, pages in `landing/` | see `landing/README.md` |
| Device test plan | `docs/QA_CHECKLIST.md` | — |

Builds go through EAS (`eas.json`): `eas build --platform ios --profile production`,
then `eas submit`. Build numbers are managed remotely; Sentry source-map upload is
off unless a Sentry project is configured.

### Browser preview (screenshots)

The native modules have web stand-ins (`*.web.ts`), so the UI can be rendered
in a browser with seeded scenarios — onboarding, board, in flight, place,
arrival, passport — and captured:

```bash
cd apps/mobile
npx expo export --platform web --output-dir /tmp/skyatlas-web
NODE_PATH=<dir with playwright-core>/node_modules node scripts/preview/shoot.mjs \
  --dist /tmp/skyatlas-web --out /tmp/shots --lang ru,en
```

---

## Backend (optional)

See [`apps/backend/README.md`](apps/backend/README.md) for environment variables,
Docker and deployment. The app does not need it to prepare or fly a flight; it
adds server-built packages and the social layer.

---

## Strategy and product docs

- [`docs/vision/VISION.md`](docs/vision/VISION.md) — product vision from an
  18-role expert panel: reframed idea, flight modes, content, monetization,
  growth, metrics, roadmap with gates.
- [`docs/HANDOFF.md`](docs/HANDOFF.md) — state of the project and operational notes.

---

## License

Proprietary. All rights reserved. Data and content keep their own licences
(see the table above and Settings → About in the app).
