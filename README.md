# SkyAtlas

**Offline flight tracker + interactive world discovery app.**

Turn every flight into a journey of discovery. SkyAtlas tracks your position offline and reveals what's below — mountains, cities, lakes, historic landmarks — with photos, facts, and stories from Wikipedia.

---

## What the app does

- **Pre-flight**: Download a flight package (route, POIs along the path, weather forecast, packing suggestions) over Wi-Fi before boarding.
- **In-flight**: Real Apple Maps view with your plane on the route. POI cards appear automatically every few minutes as you overfly landmarks — photo, Wikipedia excerpt, distance.
- **Post-flight**: Summary screen showing discoveries made, achievements unlocked, stats (distance, duration, countries). Shareable as an image.
- **Collection**: 46 achievements, country stamps, level + rank system that grows across all flights.
- **Year Wrapped**: Annual recap of all flights, distance, POIs, and highlights.
- **Listen mode**: Text-to-speech narration of POI cards, hands-free.
- **6 languages**: English, Russian, German, French, Spanish, Japanese.

**Free tier**: Up to 5 POI discoveries per flight.
**SkyAtlas Pro**: Unlimited POIs, all achievements, full history.

---

## Architecture

```
flyradar/
├── apps/
│   ├── mobile/          # React Native + Expo (iOS + Android)
│   └── backend/         # Node.js + Fastify API
├── packages/
│   └── shared/          # Shared TypeScript types
├── docs/
│   └── legal/           # Privacy Policy + Terms of Service
├── landing/             # Static marketing page (single HTML file)
├── nginx/               # Nginx config for production reverse proxy
├── docker-compose.yml          # Local development
└── docker-compose.prod.yml     # Production deployment
```

### Mobile (`apps/mobile`)
- **React Native** + **Expo SDK 52** (New Architecture enabled)
- **MapKit** (Apple Maps) via `react-native-maps`
- **SQLite** via `expo-sqlite` for local flight + POI storage
- **MMKV** for fast key-value storage (achievements, settings)
- **RevenueCat** for in-app subscriptions
- **Sentry** for crash reporting
- **PostHog** for product analytics
- **Vitest** for unit tests

### Backend (`apps/backend`)
- **Node.js 20** + **Fastify 5**
- **PostgreSQL 16** + **PostGIS** (via `postgis/postgis:16-3.4` Docker image)
- **Prisma** ORM
- **Redis 7** for caching
- **TypeScript** with strict mode
- **Vitest** for tests

### Data sources
| Source | Used for |
|---|---|
| GeoNames | Place names, country data |
| Wikipedia / Wikimedia | POI descriptions and photos |
| AviationStack | Flight route + schedule data |
| OpenSky Network | Live flight position (pre-flight lookup) |

---

## Local development setup

### Prerequisites
- Node.js 20+
- Docker Desktop
- Expo CLI: `npm install -g expo-cli`
- EAS CLI: `npm install -g eas-cli`

### 1. Clone and install

```bash
git clone https://github.com/YOUR_ORG/flyradar.git
cd flyradar
npm install
```

### 2. Start infrastructure

```bash
docker compose up -d
# PostgreSQL on localhost:5555
# Redis on localhost:6380
```

### 3. Configure environment

```bash
cp apps/backend/.env.production.example apps/backend/.env
# Edit apps/backend/.env with your local values
```

Minimum `.env` for local development:
```
PORT=3000
DATABASE_URL=postgresql://skyatlas:dev@localhost:5555/skyatlas
REDIS_URL=redis://localhost:6380
GEONAMES_USER=your_geonames_username
AVIATIONSTACK_KEY=your_key
NODE_ENV=development
```

### 4. Set up the database

```bash
cd apps/backend
npx prisma migrate dev
npm run seed          # Optional: seed airports + sample POIs
```

### 5. Run backend

```bash
# From repo root
npm run backend
# Backend runs on http://localhost:3000
```

### 6. Run mobile

```bash
npm run mobile
# Opens Expo Go — scan QR with your iPhone/Android
```

---

## Environment variables

### Backend (`apps/backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | HTTP port (default: 3000) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `GEONAMES_USER` | Yes | GeoNames API username (free registration at geonames.org) |
| `AVIATIONSTACK_KEY` | Yes | AviationStack API key (aviationstack.com) |
| `NODE_ENV` | Yes | `development` or `production` |
| `SENTRY_DSN` | No | Sentry error tracking DSN |

### Mobile (`apps/mobile/.env` or EAS secrets)

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend API base URL (e.g. `https://api.skyatlas.app`) |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DSN for mobile |
| `EXPO_PUBLIC_POSTHOG_KEY` | PostHog project API key |
| `EXPO_PUBLIC_REVENUECAT_KEY` | RevenueCat iOS API key |

---

## How to add API keys

### GeoNames (free)
1. Register at https://www.geonames.org/login
2. Enable your free web services at https://www.geonames.org/manageaccount
3. Set `GEONAMES_USER=your_username` in `.env`

### AviationStack
1. Register at https://aviationstack.com/signup/free
2. Copy your API Access Key from the dashboard
3. Set `AVIATIONSTACK_KEY=your_key` in `.env`

### OpenSky Network
Used for live flight position lookups — no key required for anonymous access (rate limited). For higher limits, register at https://opensky-network.org/index.php?option=com_users&view=registration

### RevenueCat
1. Create a project at https://app.revenuecat.com
2. Add your iOS app with bundle ID `com.skyatlas.app`
3. Configure entitlements: `pro` → `skyatlas_pro`
4. Copy the iOS public SDK key → `EXPO_PUBLIC_REVENUECAT_KEY`

### Sentry
1. Create a project at https://sentry.io (type: React Native)
2. Copy DSN → `EXPO_PUBLIC_SENTRY_DSN`
3. For backend: create a Node.js project, copy DSN → `SENTRY_DSN`

### PostHog
1. Create a project at https://app.posthog.com
2. Copy the project API key → `EXPO_PUBLIC_POSTHOG_KEY`

---

## Backend deployment

### Production with Docker Compose

**Prerequisites on the server:**
- Docker + Docker Compose v2
- Domain pointed at the server IP (`api.skyatlas.app`)

**Step 1: Set up secrets**

```bash
# On the server
cp apps/backend/.env.production.example apps/backend/.env.production
nano apps/backend/.env.production
# Fill in POSTGRES_PASSWORD, AVIATIONSTACK_KEY, etc.

# Create .env file at repo root for compose variable substitution
echo "POSTGRES_PASSWORD=your_strong_password" > .env
```

**Step 2: Obtain SSL certificate**

```bash
# Start nginx without SSL first (comment out the 443 server block temporarily)
docker compose -f docker-compose.prod.yml up -d nginx

# Obtain cert via Certbot
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path /var/www/certbot \
  -d api.skyatlas.app \
  --email admin@skyatlas.app \
  --agree-tos

# Restore full nginx config, restart
docker compose -f docker-compose.prod.yml restart nginx
```

**Step 3: Deploy**

```bash
docker compose -f docker-compose.prod.yml up -d --build

# Run migrations
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

**Step 4: Verify**

```bash
curl https://api.skyatlas.app/health
# {"status":"ok"}
```

### SSL certificate renewal

Certbot renews automatically via the container's built-in loop. Nginx reloads are handled by a cron job:

```bash
# Add to server crontab
0 0 * * 0 docker compose -f /path/to/flyradar/docker-compose.prod.yml exec nginx nginx -s reload
```

---

## Mobile build with EAS

### Setup

```bash
npm install -g eas-cli
eas login   # Login with your Expo account
eas build:configure   # First time only
```

### Development build

```bash
cd apps/mobile
eas build --platform ios --profile development
```

### Preview build (TestFlight / internal)

```bash
eas build --platform ios --profile preview
eas submit --platform ios --profile production   # Submit to TestFlight
```

### Production build + App Store submission

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

`autoIncrement: true` in `eas.json` means EAS automatically bumps the build number on each production build.

### Required Apple Developer setup (one-time)
1. Enroll at https://developer.apple.com/programs/ ($99/year)
2. Create an App ID: `com.skyatlas.app`
3. Create the app record in App Store Connect
4. Upload at least one build before submitting metadata
5. Complete App Store metadata using files in `apps/mobile/store-metadata/`

---

## CI/CD overview

GitHub Actions runs on every push and pull request (`.github/workflows/ci.yml`):

| Job | Steps |
|---|---|
| `backend` | `npm ci` → `npm test` → `tsc --noEmit` |
| `mobile` | `npm ci` → `tsc --noEmit` → `vitest run` |

**Production deploy** is intentionally manual (run `docker compose -f docker-compose.prod.yml up -d --build` on the server after CI passes). To automate, add a deploy step to the workflow using SSH action after the `main` branch push.

---

## Testing strategy

### Backend tests (`apps/backend/tests/`)
- **Unit tests**: Route handlers, service functions, data transformations
- **Integration tests**: Prisma queries against a test database
- Run: `npm test --workspace apps/backend`

### Mobile tests (`apps/mobile/__tests__/`)
- **Unit tests**: Achievement engine, gamification logic, collection utils
- **Component tests**: Vitest + React Native Testing Library
- Run: `cd apps/mobile && npx vitest run`

### Current status
- Total: 55 passing tests
- Coverage: Achievements, gamification, POI filtering, analytics events

---

## Tech stack

| Layer | Technology |
|---|---|
| Mobile framework | React Native 0.76 + Expo SDK 52 |
| Language | TypeScript 5 (strict) |
| Navigation | Expo Router (file-based) |
| Maps | react-native-maps (MapKit on iOS) |
| Local DB | expo-sqlite (SQLite) |
| Fast storage | react-native-mmkv |
| Monetization | RevenueCat |
| Crash tracking | Sentry |
| Analytics | PostHog |
| Backend runtime | Node.js 20 |
| Backend framework | Fastify 5 |
| ORM | Prisma 7 |
| Database | PostgreSQL 16 + PostGIS |
| Cache | Redis 7 |
| Reverse proxy | Nginx 1.25 |
| Containerization | Docker + Docker Compose |
| CI | GitHub Actions |
| Mobile CI/CD | EAS Build + EAS Submit |
| Testing | Vitest |

---

## Roadmap

- [ ] Android release (Google Play)
- [ ] Widget (iOS Live Activity showing current POI)
- [ ] Apple Watch companion (altitude + next POI)
- [ ] Social: share flight paths with friends
- [ ] Airline partnerships: branded flight experiences
- [ ] Web dashboard: full flight history and map
- [ ] Offline map tiles for route corridor
- [ ] AI-generated commentary based on flight context

---

## Contributing

1. Fork the repo and create a feature branch
2. Write tests for new behavior
3. Ensure `npm test --workspace apps/backend` and `cd apps/mobile && npx vitest run` both pass
4. Open a pull request — CI must be green before review

---

## License

Proprietary. All rights reserved. Source is shared for reference; redistribution requires written permission.
