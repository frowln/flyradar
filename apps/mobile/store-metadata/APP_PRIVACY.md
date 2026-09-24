# App Store "App Privacy" answers

What to enter in App Store Connect → App Privacy, for the two kinds of build. The answers must match the Privacy Policy (`docs/legal/privacy-policy.md`, section *Flight services*) and the privacy manifest in `app.json` (`ios.privacyManifests`). If the code changes, re-check the "What leaves the phone" table first.

Both builds: **no tracking**, no ad SDK, no App Tracking Transparency prompt. Privacy Policy URL: `<landing host>/privacy.html`.

## What leaves the phone

| Destination | When | What | Kept by the receiver | Build |
| --- | --- | --- | --- | --- |
| Wikimedia (`wikidata.org`, `*.wikipedia.org`, Commons) | Preparing a flight, opening a place with a photo not yet saved | Article titles and photo files requested; IP address, as for any website | Wikimedia's own logs, under its policy | both |
| OpenFreeMap (`tiles.openfreemap.org`) | Preparing a flight, viewing the map online | Map tiles requested; IP address | OpenFreeMap's own logs | both |
| SkyAtlas server `POST /flights/lookup` | The passenger taps *Find* on the add-flight screen | `{ flightNumber, date }` | The flight's public record (airports, times, aircraft, status) in the `FlightCache` table under flight number and date, with no requester. The request body is not logged. | flight services |
| SkyAtlas server `GET /flights/track?number=…` | Preparing a flight that has a flight number | Flight number (in the URL) | Track cached under the flight number for 24 h (6 h if none this week). The request logs record the path without its query, so without the flight number. | flight services |
| SkyAtlas server `POST /weather/clouds` | Preparing a flight that departs within 7 days; on app start in the last 3 days before departure, at most every 3 h | Up to 60 `{ lat, lon, at }`, coordinates rounded to 0.01° | Cloud cover cached for 1 h per 0.25° cell and hour. The points of one request are not stored together, and the body is not logged. | flight services |
| Every SkyAtlas server request | as above | Headers: `Authorization: Bearer dev_<random>` and the same value in `X-Device-Id` (a random code the app creates once and keeps in its settings), `X-Platform: ios`, HMAC timestamp and signature; IP address and user agent | The flight and weather routes check the token's shape and the signature and store neither. Fastify logs method, path without query, IP and status; nginx logs IP, method, path without query, status and user agent. Logs rotate at 5 × 10 MB per service (`docker-compose.prod.yml`). | flight services |

AeroDataBox (via RapidAPI or API.market), Flightradar24 and Open-Meteo are called by the server, never by the phone. They receive the flight number and date, the flight number, or 0.25° cells and dates, and see only the server's address.

Sources: `src/core/api/client.ts`, `src/core/api/flights.ts`, `src/core/flight/clouds.ts`, `src/core/offline/prepare.ts`, `src/core/offline/topUp.ts`, `ui/screens/AddFlightScreen.tsx`; backend `src/app.ts`, `src/routes/flights.ts`, `src/routes/weather.ts`, `src/services/flightLookup.ts`, `src/services/recentTrack.ts`, `src/services/clouds.ts`, `src/cache/remember.ts`; `nginx/`, `docker-compose.prod.yml`.

## Build without flight services (no `EXPO_PUBLIC_API_URL`)

**Data collection:** "No, we do not collect data from this app."

Everything the app stores stays on the phone. The only connections are direct downloads from Wikimedia and OpenFreeMap. These are public web services the app reads from, not SDKs or partners collecting on our behalf, and the app sends them no identifier. This is the same reasoning behind the current privacy manifest (`NSPrivacyCollectedDataTypes: []`).

## Build with flight services (`EXPO_PUBLIC_API_URL` set)

**Data collection:** "Yes, we collect data from this app."

| Data type | Collected | Linked to the user | Used for tracking | Purposes |
| --- | --- | --- | --- | --- |
| Other Data → **Other Data Types** | Yes | No | No | App Functionality |

Nothing else is ticked: no Contact Info, Location, Identifiers, Usage Data, Diagnostics, Purchases or Search History.

What "Other Data" covers: the flight number and date of a flight the passenger looks up or prepares, and points of the flight's planned route with the times the aircraft is expected there.

Privacy manifest for this build (`app.json` → `ios.privacyManifests.NSPrivacyCollectedDataTypes`):

```json
[
  {
    "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeOtherDataTypes",
    "NSPrivacyCollectedDataTypeLinked": false,
    "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
  }
]
```

`app.config.js` adds this entry to the manifest from `app.json` exactly when `EXPO_PUBLIC_API_URL` is set, so each build declares what it does.

### Why these answers

- **Collected, not "not collected".** Apple counts data as collected when it leaves the device and is kept longer than it takes to answer the request. Flight numbers are kept as cache keys, so the "real-time only" exemption does not clearly apply. Declaring is the honest default.
- **Other Data, not Location.** The route points are not a reading of the phone's position. The app computes them from the two airports (or last week's track), for a flight that may be days away, and sends them from wherever the phone happens to be. The phone's GPS never leaves the device. Apple's location types describe "the location of a user or device", so the closest honest fit is Other Data. The cautious alternative is to also tick **Coarse Location** (the points are rounded to 0.01°, below Apple's three-decimal "precise" threshold) with the same answers: App Functionality, not linked, no tracking. That costs a "Location" line on the label and nothing else. Choose it if App Review asks.
- **Not Search History.** *Find* is a search, but the server keeps no record of searches: the lookup body is not logged, and the cached row is the flight's public data with no requester. If you prefer the literal reading, add Search History with the same answers.
- **Not linked to the user.** There is no account, name, e-mail or advertising ID. The app's random installation code (`dev_…`) is sent with every request, but the flight and weather routes neither store nor log it, so no Identifiers are collected. The request logs hold IP addresses, but only with paths, never flight numbers or route points (query strings are dropped in `apps/backend/src/app.ts` and `nginx/conf.d/skyatlas.conf`), and they rotate at 5 × 10 MB per service. Apple has no data type for IP addresses, and we never use them to identify anyone.
- **No tracking.** Nothing is combined with other companies' data or shared with data brokers. The providers get flight numbers and coordinates from the server, not from the phone, and never see the passenger's IP address.

## When these answers change

- `EXPO_PUBLIC_SOCIAL=1`: the installation code becomes an account key (`X-Device-Id`), and discoveries, reviews and handles are stored per user. That adds at least Identifiers → User ID, User Content (reviews) and Usage Data → Product Interaction (discoveries), all **linked**.
- `EXPO_PUBLIC_RC_KEY` (purchases through RevenueCat): Purchases → Purchase History, and Identifiers → User ID or Device ID for the RevenueCat app user ID.
- `EXPO_PUBLIC_SENTRY_DSN`: Diagnostics → Crash Data and Performance Data.
- `EXPO_PUBLIC_POSTHOG_KEY`: Usage Data → Product Interaction, and Identifiers → Device ID for the random installation ID.
- The server starts storing request bodies, the installation code, or logs keyed to it: re-check "Linked to the user".

Update the Privacy Policy (both languages), this file and the privacy manifest in the same change.
