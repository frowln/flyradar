# SkyAtlas backend

Fastify 5 + Prisma 7 (Postgres) + Redis. Serves flight lookup, offline flight
packages and the social layer to the mobile app.

## Running locally

```bash
docker compose up -d                 # from the repo root: Postgres on :5555, Redis on :6381
cp apps/backend/.env.example apps/backend/.env   # then edit, see below
cd apps/backend
npx prisma generate                  # Prisma 7 does not generate on install
npx prisma migrate dev
npm run dev                          # http://localhost:3000
```

Tests, type-check and build (CI runs the same):

```bash
npx prisma generate && npx vitest run && npx tsc --noEmit && npm run build
```

## Environment variables

Everything the code reads (`grep -rn "process.env" src`). Only `DATABASE_URL`
is needed to start in development; production additionally requires
`AUTH_HMAC_SECRET`.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres connection string. Also read by `prisma.config.ts` and the scripts. |
| `NODE_ENV` | no | — | `production` turns on JSON logs, requires `AUTH_HMAC_SECRET`, and makes `TRUST_PROXY` default to one hop. |
| `PORT` | no | `3000` | HTTP port. |
| `LOG_LEVEL` | no | `info` | pino level. Production logs JSON to stdout; other environments pretty-print through pino-pretty. |
| `AUTH_HMAC_SECRET` | **production** | unset | Request-signing secret shared with the app (`EXPO_PUBLIC_AUTH_HMAC_SECRET`). The server refuses to start without it when `NODE_ENV=production`. **Not authentication**: see below. Unset in development means signatures are not checked. |
| `TRUST_PROXY` | no | `1` in production, else `false` | Which proxy hops to believe for the client address (rate limiting, logs). `true`, `false`, a hop count, or a comma-separated list of proxy IPs/CIDRs. Behind the bundled nginx, leave it at `1`; `true` would believe a client-written `X-Forwarded-For`. |
| `REDIS_URL` | no | unset | Package cache. Unset or unreachable means every package is built fresh; cache errors never fail a request. |
| `AERODATABOX_KEY` | no | unset | Flight lookup by number (preferred). See [Data providers](#data-providers). |
| `AERODATABOX_HOST` | no | `aerodatabox.p.rapidapi.com` | Which marketplace the key is from: the RapidAPI host, or `prod.api.market` for API.market. |
| `AVIATIONSTACK_KEY` | no | unset | Flight lookup fallback, used only when `AERODATABOX_KEY` is unset. With neither, lookup is in **demo mode**: invented flights on plausible routes, never written to `FlightCache`. |
| `FR24_API_KEY` | no | unset | Flightradar24 API token for `GET /flights/track`. Unset: the route answers 404 `{ reason: "not_configured" }`. |
| `OPEN_METEO_KEY` | no | unset | Open-Meteo commercial key for `POST /weather/clouds`. Unset uses the free host, which is **non-commercial use only**. |
| `OUTBOUND_PROXY_URL` | no | unset | `http://host:port` HTTP proxy (CONNECT) used for AviationStack only — for development machines whose IP AviationStack blocks. See `scripts/proxy-tunnel.sh`. |
| `REVENUECAT_SECRET_KEY` | no | unset | Server-side subscription check. Unset makes `/subscription/verify` answer `{ verified: false, reason: "not_configured" }`. |
| `APPLE_BUNDLE_ID` | no | `com.skyatlas.app` | Expected `aud` of Sign in with Apple identity tokens. |
| `METRICS_TOKEN` | no | unset | Bearer token for `GET /metrics`. Unset means the route answers 404. |
| `SKIP_MIGRATIONS` | no | `0` | Docker image only: `1` skips `prisma migrate deploy` on container start. |

`GEONAMES_USER`, still listed in the root README, is not read by anything at
runtime: places come from the local `POI` table loaded by
`scripts/load-places.mjs`. `SENTRY_DSN` is likewise not wired up yet.

## Data providers

Three paid services, each dormant until its key is set. The app works without
any of them (it prepares flights on the phone from bundled data); each one
makes a flight more accurate. Every provider call has a timeout, a 429 pauses
that provider for its `Retry-After` (answers come from cache meanwhile), and
keys never appear in logs.

**Cost scales with distinct flights, not users.** Every answer is cached per
flight number (and date) or per forecast cell and hour, in memory and in Redis
when configured, so a hundred passengers on one flight cost one lookup.

| Provider | Env | Endpoint | What it gives | Cache | Pricing (pointer) |
|---|---|---|---|---|---|
| [AeroDataBox](https://aerodatabox.com/pricing/) | `AERODATABOX_KEY`, `AERODATABOX_HOST` | `POST /flights/lookup` | Flight by number and local date, any date including months ahead: airports (IATA, time zones), scheduled and revised local times with offsets, aircraft model, status. Codeshare and cargo listings are ignored. | `FlightCache` (Postgres): 15 min around today, 24 h for later dates, forever once flown. An expired entry is still served if the provider is down or over quota. | From $0 (600 units/month) via RapidAPI or API.market |
| AviationStack | `AVIATIONSTACK_KEY` | `POST /flights/lookup` | Fallback when AeroDataBox is not configured. The free plan only covers the last few days. | as above | — |
| [Flightradar24 API](https://fr24api.flightradar24.com) | `FR24_API_KEY` | `GET /flights/track?number=SU1234` | The route the number actually flew most recently (last 7 days, completed, not diverted): `{ points: [[lon, lat, altM, tSec], …], flownOn, from, to }`, simplified to ≤ 150 points. 404 when there is none. | 24 h per flight number (6 h for "none this week"); failures are not cached. | From $9/month (Explorer, credits) |
| [Open-Meteo](https://open-meteo.com/en/pricing) | `OPEN_METEO_KEY` (optional) | `POST /weather/clouds` | Body `{ points: [{ lat, lon, at }] }` (≤ 60, `at` ISO with zone) → `{ points: [{ at, cloud, low, mid }] }`, percent at the forecast hour nearest to each `at`; `null` beyond the ~16-day forecast. 503 when the forecast cannot be fetched. | 1 h per 0.25° cell and hour. | Free host is **non-commercial only**; commercial from $29/month (`customer-api.open-meteo.com`) |

AeroDataBox is sold on two marketplaces with different addresses and headers:
RapidAPI (default; `X-RapidAPI-Key` + `X-RapidAPI-Host`) and API.market
(`AERODATABOX_HOST=prod.api.market`; `x-api-market-key`, path prefix
`/api/v1/aedbx/aerodatabox`). The FR24 client sends `Authorization: Bearer
$FR24_API_KEY` and `Accept-Version: v1`; its field mapping is isolated in
`src/external/fr24.ts` (`latestCompleted`, `trackPoints`, `toFlightTrack`).

### Request signing is anti-abuse, not auth

The HMAC secret ships inside the mobile app bundle, so anyone can extract it
and sign requests. Signing only raises the bar against casual scripting and
replays. Identity is the device token (`Authorization: Bearer …` /
`X-Device-Id`, self-issued and anonymous) and, for linked accounts, a verified
Apple identity token. Never authorise anything on the strength of a valid
signature.

## API notes

- **Offline packages are built asynchronously.** `POST /flights/package`
  answers `200` with the package when it is cached, otherwise `202
  { jobId, status: "pending" }` (plus `Location` and `Retry-After`). Poll `GET
  /flights/package/:jobId` → `{ status: "pending" | "done" | "error", package?,
  error? }`; finished jobs are kept for 10 minutes. Concurrent requests for the
  same flight, date and locale share one job. `POST /flights/package?sync=1`
  keeps the old behaviour of holding the request open until the build is done.
- **`locale`** is one of `en ru de fr es ja`; anything else is treated as `en`.
- **`POST /flights/lookup`** answers the shared `Flight`, which now may carry
  `status`, `revisedDeparture`/`revisedArrival` and `localDate`. A 404 carries
  `availableDates` and, when the provider failed, `reason` (`rate_limited`,
  `timeout`, `unauthorized`, `unknown_airport`, …).
- **Signatures cover the path without the query string** (`GET
  /flights/track?number=…` is signed as `/flights/track`); the app signs the
  same way.
- **`POST /social/link/apple`** takes `{ identityToken }` — the JWT from Sign in
  with Apple — and verifies it against Apple's published keys. A bare
  `appleSub` is no longer accepted.
- **`POST /social/discoveries`** accepts ids of places in the `POI` table or of
  places from the app's bundled datasets (`ne-xx-…`), at most 500 per user per
  UTC day.
- Server errors (5xx) answer with a generic message; details are in the logs.

## Docker

The image must be built with the **repository root** as context — the npm
workspace lockfile lives there, and the backend compiles against
`packages/shared`:

```bash
docker build -f apps/backend/Dockerfile -t skyatlas-backend .
```

`docker-compose.prod.yml` does this. The container runs `prisma migrate deploy`
before `node dist/index.js`. The prisma CLI is a devDependency, so the runtime
image keeps dev dependencies; moving `prisma` to `dependencies` would allow a
slimmer `--omit=dev` image.

`/metrics` is refused by nginx; scrape it on the internal network
(`http://backend:3000/metrics`) with `Authorization: Bearer $METRICS_TOKEN`.
