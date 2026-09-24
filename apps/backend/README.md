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
| `AVIATIONSTACK_KEY` | no | unset | Flight data. Unset puts lookup in **demo mode**: invented flights on plausible routes, never written to `FlightCache`. |
| `OUTBOUND_PROXY_URL` | no | unset | `http://host:port` HTTP proxy (CONNECT) used for AviationStack only — for development machines whose IP AviationStack blocks. See `scripts/proxy-tunnel.sh`. |
| `REVENUECAT_SECRET_KEY` | no | unset | Server-side subscription check. Unset makes `/subscription/verify` answer `{ verified: false, reason: "not_configured" }`. |
| `APPLE_BUNDLE_ID` | no | `com.skyatlas.app` | Expected `aud` of Sign in with Apple identity tokens. |
| `METRICS_TOKEN` | no | unset | Bearer token for `GET /metrics`. Unset means the route answers 404. |
| `SKIP_MIGRATIONS` | no | `0` | Docker image only: `1` skips `prisma migrate deploy` on container start. |

`GEONAMES_USER`, still listed in the root README, is not read by anything at
runtime: places come from the local `POI` table loaded by
`scripts/load-places.mjs`. `SENTRY_DSN` is likewise not wired up yet.

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
