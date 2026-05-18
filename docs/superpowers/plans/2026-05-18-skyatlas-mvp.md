# SkyAtlas MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full MVP of SkyAtlas — a mobile app (iOS + Android) that tracks flight position offline, shows POI cards about places below, and includes basic gamification and monetization.

**Architecture:** React Native + Expo monorepo for mobile, Node.js + Fastify + PostgreSQL backend. Mobile app pre-downloads an "offline package" per flight (route, POI, content, map tiles). In-flight position is interpolated locally from takeoff time + flight duration using great-circle math. POIs are queried locally from SQLite. Stripe-via-RevenueCat handles per-flight purchases and annual subscriptions.

**Tech Stack:**
- **Mobile:** React Native, Expo SDK 51+, MapLibre GL (maplibre-react-native), Expo SQLite, Zustand (state), TanStack Query, expo-camera (boarding pass scan), react-native-mmkv
- **Backend:** Node.js 20, Fastify, PostgreSQL 16 + PostGIS, Redis, Prisma ORM
- **Infra:** Hetzner VPS for backend, Cloudflare R2 for offline packages, RevenueCat for subscriptions
- **External APIs:** OpenSky Network, AviationStack, Wikipedia REST, GeoNames, Unsplash

---

## File Structure

```
flyradar/
├── apps/
│   ├── mobile/                     # React Native + Expo app
│   │   ├── App.tsx                 # Root component, navigation setup
│   │   ├── app.json                # Expo config
│   │   ├── src/
│   │   │   ├── navigation/
│   │   │   │   └── RootNavigator.tsx
│   │   │   ├── screens/
│   │   │   │   ├── HomeScreen.tsx          # List of upcoming/past flights
│   │   │   │   ├── AddFlightScreen.tsx     # Manual entry + boarding scan
│   │   │   │   ├── FlightDetailScreen.tsx  # Pre-flight view with download CTA
│   │   │   │   ├── InFlightScreen.tsx      # Live map + position + cards
│   │   │   │   ├── POIDetailScreen.tsx     # Full content for a POI
│   │   │   │   ├── FlightSummaryScreen.tsx # Post-flight recap
│   │   │   │   ├── CollectionScreen.tsx    # Countries / achievements
│   │   │   │   └── PaywallScreen.tsx       # Monetization
│   │   │   ├── components/
│   │   │   │   ├── FlightMap.tsx           # MapLibre wrapper
│   │   │   │   ├── PlaneMarker.tsx
│   │   │   │   ├── POICard.tsx
│   │   │   │   ├── FlightStats.tsx
│   │   │   │   ├── AchievementToast.tsx
│   │   │   │   └── BoardingPassScanner.tsx
│   │   │   ├── core/
│   │   │   │   ├── geo/
│   │   │   │   │   ├── greatCircle.ts      # Position interpolation math
│   │   │   │   │   ├── flightProfile.ts    # Climb/cruise/descent profile
│   │   │   │   │   └── distance.ts         # Haversine, bearing
│   │   │   │   ├── flight/
│   │   │   │   │   ├── positionEngine.ts   # Main offline tracker
│   │   │   │   │   ├── poiScheduler.ts     # Decides when to show POI
│   │   │   │   │   └── flightStore.ts      # Zustand: active flight state
│   │   │   │   ├── offline/
│   │   │   │   │   ├── packageDownloader.ts
│   │   │   │   │   ├── poiDatabase.ts      # SQLite ops for POI
│   │   │   │   │   └── mapTileCache.ts
│   │   │   │   ├── api/
│   │   │   │   │   └── client.ts           # HTTP client to our backend
│   │   │   │   ├── monetization/
│   │   │   │   │   └── revenueCat.ts
│   │   │   │   └── gamification/
│   │   │   │       ├── achievements.ts
│   │   │   │       └── collections.ts
│   │   │   └── theme/
│   │   │       ├── colors.ts
│   │   │       └── typography.ts
│   │   ├── assets/
│   │   │   └── plane-icon.png
│   │   └── __tests__/
│   │       ├── geo/
│   │       │   ├── greatCircle.test.ts
│   │       │   └── flightProfile.test.ts
│   │       ├── flight/
│   │       │   ├── positionEngine.test.ts
│   │       │   └── poiScheduler.test.ts
│   │       └── gamification/
│   │           └── achievements.test.ts
│   │
│   └── backend/                    # Node.js API
│       ├── src/
│       │   ├── index.ts            # Fastify server entry
│       │   ├── routes/
│       │   │   ├── flights.ts      # POST /flights/lookup, /flights/package
│       │   │   ├── poi.ts          # POI queries for routes
│       │   │   └── health.ts
│       │   ├── services/
│       │   │   ├── flightLookup.ts # OpenSky + AviationStack
│       │   │   ├── routeBuilder.ts # Great-circle route generation
│       │   │   ├── poiAggregator.ts# GeoNames + Wikipedia → unified POI
│       │   │   ├── packageBuilder.ts# Build downloadable offline package
│       │   │   └── content.ts      # Wikipedia article fetching, cleaning
│       │   ├── db/
│       │   │   ├── prisma.ts
│       │   │   └── seed.ts
│       │   └── external/
│       │       ├── opensky.ts
│       │       ├── aviationstack.ts
│       │       ├── wikipedia.ts
│       │       └── geonames.ts
│       ├── prisma/
│       │   └── schema.prisma
│       ├── tests/
│       │   ├── flightLookup.test.ts
│       │   ├── routeBuilder.test.ts
│       │   └── packageBuilder.test.ts
│       └── package.json
│
├── packages/
│   └── shared/                     # Shared types between mobile + backend
│       └── src/
│           ├── types/
│           │   ├── flight.ts
│           │   ├── poi.ts
│           │   └── package.ts
│           └── index.ts
│
├── docker-compose.yml              # Postgres + Redis for local dev
├── package.json                    # Workspaces root
├── tsconfig.base.json
└── README.md
```

---

## Phase 0: Project Setup

### Task 0.1: Initialize monorepo

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `README.md`, `docker-compose.yml`

- [ ] **Step 1: Init git + base package.json**

```bash
cd /Users/damirkasimov/Desktop/flyradar
git init
```

Create `package.json`:
```json
{
  "name": "skyatlas",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "mobile": "npm --workspace apps/mobile run start",
    "backend": "npm --workspace apps/backend run dev",
    "test": "npm run test --workspaces --if-present"
  }
}
```

- [ ] **Step 2: Create tsconfig base**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-native"
  }
}
```

- [ ] **Step 3: Create docker-compose.yml for Postgres + Redis**

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_USER: skyatlas
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: skyatlas
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
volumes:
  pgdata:
```

- [ ] **Step 4: Standard .gitignore**

```
node_modules/
.expo/
dist/
.env
.env.local
*.log
.DS_Store
ios/
android/
pgdata/
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: initialize monorepo structure"
```

### Task 0.2: Initialize shared types package

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/src/index.ts`, `packages/shared/src/types/*.ts`

- [ ] **Step 1: Package setup**

`packages/shared/package.json`:
```json
{
  "name": "@skyatlas/shared",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

- [ ] **Step 2: Define core types**

`packages/shared/src/types/flight.ts`:
```typescript
export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
}

export interface Flight {
  id: string;
  flightNumber: string;
  airline: string;
  origin: Airport;
  destination: Airport;
  scheduledDeparture: string; // ISO
  scheduledArrival: string;
  actualDeparture?: string;
  aircraftType?: string;
}

export interface RoutePoint {
  lat: number;
  lon: number;
  altitude: number;       // meters
  elapsedSeconds: number; // from takeoff
}
```

`packages/shared/src/types/poi.ts`:
```typescript
export type POICategory =
  | 'city' | 'mountain' | 'lake' | 'river' | 'sea' | 'volcano'
  | 'island' | 'historic' | 'park' | 'landmark';

export interface POI {
  id: string;
  name: string;
  category: POICategory;
  lat: number;
  lon: number;
  elevation?: number;
  population?: number;
  wikiTitle?: string;
  summary: string;        // 300-500 word adapted text
  facts: string[];        // 3-5 wow facts
  photos: string[];       // URLs
  closestApproachKm?: number;
}
```

`packages/shared/src/types/package.ts`:
```typescript
import { Flight, RoutePoint } from './flight';
import { POI } from './poi';

export interface OfflinePackage {
  version: 1;
  flight: Flight;
  route: RoutePoint[];      // ~200 points sampled along great circle
  pois: POI[];
  mapTilesUrl?: string;     // Optional: pre-packaged map tiles
  generatedAt: string;
}
```

`packages/shared/src/index.ts`:
```typescript
export * from './types/flight';
export * from './types/poi';
export * from './types/package';
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): add core domain types"
```

---

## Phase 1: Backend Foundation

### Task 1.1: Fastify server skeleton

**Files:**
- Create: `apps/backend/package.json`, `apps/backend/tsconfig.json`, `apps/backend/src/index.ts`, `apps/backend/src/routes/health.ts`, `apps/backend/.env.example`

- [ ] **Step 1: Install dependencies**

```bash
mkdir -p apps/backend/src/routes apps/backend/src/services apps/backend/src/db apps/backend/src/external apps/backend/tests
cd apps/backend
npm init -y
npm i fastify @fastify/cors @fastify/helmet pino-pretty dotenv zod
npm i -D typescript tsx vitest @types/node prisma @prisma/client
```

- [ ] **Step 2: Set up tsconfig**

`apps/backend/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "module": "ESNext",
    "moduleResolution": "node",
    "jsx": "preserve"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write Fastify entrypoint**

`apps/backend/src/index.ts`:
```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import 'dotenv/config';
import { healthRoutes } from './routes/health.js';

const app = Fastify({
  logger: { transport: { target: 'pino-pretty' } }
});

await app.register(helmet);
await app.register(cors, { origin: true });
await app.register(healthRoutes);

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`server on :${port}`))
  .catch((e) => { app.log.error(e); process.exit(1); });
```

`apps/backend/src/routes/health.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({ ok: true, ts: Date.now() }));
};
```

- [ ] **Step 4: Add `dev` script + start**

`apps/backend/package.json` scripts:
```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "test": "vitest run",
  "build": "tsc -p tsconfig.json"
}
```

```bash
docker compose up -d
npm --workspace apps/backend run dev
```

Verify: `curl http://localhost:3000/health` → `{"ok":true,...}`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(backend): fastify server skeleton with health endpoint"
```

### Task 1.2: Prisma schema for airports, flights, POIs

**Files:**
- Create: `apps/backend/prisma/schema.prisma`

- [ ] **Step 1: Define schema**

```prisma
generator client { provider = "prisma-client-js" }
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Airport {
  id        Int      @id @default(autoincrement())
  iata      String   @unique
  icao      String?  @unique
  name      String
  city      String
  country   String
  lat       Float
  lon       Float
  tz        String
}

model POI {
  id         String  @id @default(cuid())
  name       String
  category   String
  lat        Float
  lon        Float
  elevation  Int?
  population Int?
  wikiTitle  String?
  summary    String  @db.Text
  facts      Json    // string[]
  photos     Json    // string[]
  @@index([lat, lon])
}

model FlightCache {
  flightNumber String
  date         String   // YYYY-MM-DD
  payload      Json     // serialized Flight
  cachedAt     DateTime @default(now())
  @@id([flightNumber, date])
}
```

- [ ] **Step 2: Init Prisma + migrate**

```bash
echo 'DATABASE_URL="postgresql://skyatlas:dev@localhost:5432/skyatlas"' > apps/backend/.env
cd apps/backend
npx prisma migrate dev --name init
```

- [ ] **Step 3: Create `db/prisma.ts` singleton**

```typescript
import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(backend): prisma schema for airports, POI, flight cache"
```

### Task 1.3: Seed airports from OpenFlights

**Files:**
- Create: `apps/backend/src/db/seed.ts`, `apps/backend/scripts/download-airports.sh`

- [ ] **Step 1: Download script**

`apps/backend/scripts/download-airports.sh`:
```bash
#!/bin/bash
mkdir -p data
curl -sL https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat -o data/airports.dat
```

- [ ] **Step 2: Seed script**

`apps/backend/src/db/seed.ts`:
```typescript
import { prisma } from './prisma.js';
import { readFileSync } from 'node:fs';

const lines = readFileSync('data/airports.dat', 'utf-8').split('\n');
const airports = lines
  .map(l => l.split(','))
  .filter(p => p.length >= 12 && p[4]?.replaceAll('"', '').length === 3)
  .map(p => ({
    iata:    p[4].replaceAll('"', ''),
    icao:    p[5].replaceAll('"', '') || null,
    name:    p[1].replaceAll('"', ''),
    city:    p[2].replaceAll('"', ''),
    country: p[3].replaceAll('"', ''),
    lat:     parseFloat(p[6]),
    lon:     parseFloat(p[7]),
    tz:      p[11].replaceAll('"', '')
  }));

console.log(`Importing ${airports.length} airports...`);
for (const a of airports) {
  await prisma.airport.upsert({ where: { iata: a.iata }, update: a, create: a });
}
console.log('Done');
```

- [ ] **Step 3: Run seed**

```bash
chmod +x apps/backend/scripts/download-airports.sh
apps/backend/scripts/download-airports.sh
cd apps/backend && npx tsx src/db/seed.ts
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(backend): seed airports from OpenFlights"
```

### Task 1.4: Great-circle route builder service (TDD)

**Files:**
- Create: `apps/backend/src/services/routeBuilder.ts`, `apps/backend/tests/routeBuilder.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { buildRoute } from '../src/services/routeBuilder.js';

describe('routeBuilder', () => {
  it('produces N points from origin to destination', () => {
    const route = buildRoute(
      { lat: 55.97, lon: 37.41 }, // SVO
      { lat: 40.64, lon: -73.78 }, // JFK
      { points: 200, durationMinutes: 600 }
    );
    expect(route).toHaveLength(200);
    expect(route[0].lat).toBeCloseTo(55.97, 1);
    expect(route[199].lat).toBeCloseTo(40.64, 1);
    expect(route[100].elapsedSeconds).toBeCloseTo(180_000, -3);
  });

  it('uses flight profile: climb to cruise to descent', () => {
    const route = buildRoute(
      { lat: 0, lon: 0 }, { lat: 0, lon: 90 },
      { points: 100, durationMinutes: 600 }
    );
    expect(route[0].altitude).toBe(0);
    expect(route[50].altitude).toBeGreaterThan(10_000);
    expect(route[99].altitude).toBeLessThan(500);
  });
});
```

Run: `cd apps/backend && npx vitest run` → expect FAIL

- [ ] **Step 2: Implement**

`apps/backend/src/services/routeBuilder.ts`:
```typescript
import type { RoutePoint } from '@skyatlas/shared';

const DEG = Math.PI / 180;

function greatCirclePoint(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
  fraction: number
): { lat: number; lon: number } {
  const φ1 = lat1 * DEG, φ2 = lat2 * DEG;
  const λ1 = lon1 * DEG, λ2 = lon2 * DEG;
  const d  = 2 * Math.asin(Math.sqrt(
    Math.sin((φ2 - φ1) / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (d === 0) return { lat: lat1, lon: lon1 };
  const A = Math.sin((1 - fraction) * d) / Math.sin(d);
  const B = Math.sin(fraction * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
  const λ = Math.atan2(y, x);
  return { lat: φ / DEG, lon: λ / DEG };
}

function altitudeAt(fraction: number, cruiseAlt = 11000): number {
  const CLIMB = 0.08, DESC = 0.85; // fractions of flight
  if (fraction < CLIMB)  return (fraction / CLIMB) * cruiseAlt;
  if (fraction < DESC)   return cruiseAlt;
  return cruiseAlt * (1 - (fraction - DESC) / (1 - DESC));
}

export function buildRoute(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
  opts: { points: number; durationMinutes: number }
): RoutePoint[] {
  const total = opts.durationMinutes * 60;
  return Array.from({ length: opts.points }, (_, i) => {
    const f = i / (opts.points - 1);
    const p = greatCirclePoint(origin.lat, origin.lon, destination.lat, destination.lon, f);
    return { ...p, altitude: altitudeAt(f), elapsedSeconds: f * total };
  });
}
```

Run: `npx vitest run` → expect PASS

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(backend): great-circle route builder with flight profile"
```

### Task 1.5: POI aggregator from GeoNames + Wikipedia

**Files:**
- Create: `apps/backend/src/external/geonames.ts`, `apps/backend/src/external/wikipedia.ts`, `apps/backend/src/services/poiAggregator.ts`, `apps/backend/tests/poiAggregator.test.ts`

- [ ] **Step 1: Sign up for GeoNames** (free) — get username, put in `.env` as `GEONAMES_USER`.

- [ ] **Step 2: Wikipedia client**

`apps/backend/src/external/wikipedia.ts`:
```typescript
export async function fetchWikiSummary(title: string, lang = 'en') {
  const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  if (!r.ok) return null;
  const j = await r.json();
  return {
    extract: j.extract as string,
    thumbnail: j.thumbnail?.source as string | undefined,
    coords: j.coordinates ? { lat: j.coordinates.lat, lon: j.coordinates.lon } : null
  };
}
```

- [ ] **Step 3: GeoNames client**

`apps/backend/src/external/geonames.ts`:
```typescript
const USER = process.env.GEONAMES_USER!;

export async function searchAround(lat: number, lon: number, radiusKm: number, types: string[]) {
  const features = types.join(',');
  const url = `http://api.geonames.org/findNearbyJSON?lat=${lat}&lng=${lon}&radius=${radiusKm}&featureCode=${features}&maxRows=50&username=${USER}`;
  const r = await fetch(url);
  const j = await r.json();
  return (j.geonames ?? []) as Array<{
    geonameId: number; name: string; lat: string; lng: string;
    fcl: string; fcode: string; population?: number; elevation?: number;
  }>;
}
```

- [ ] **Step 4: Aggregator**

`apps/backend/src/services/poiAggregator.ts`:
```typescript
import type { POI, RoutePoint, POICategory } from '@skyatlas/shared';
import { searchAround } from '../external/geonames.js';
import { fetchWikiSummary } from '../external/wikipedia.js';

const CATEGORY_MAP: Record<string, POICategory> = {
  PPL: 'city', PPLA: 'city', PPLC: 'city',
  MT: 'mountain', MTS: 'mountain',
  LK: 'lake', RIVR: 'river', SEA: 'sea',
  VLC: 'volcano', ISL: 'island'
};

export async function aggregatePOIsForRoute(route: RoutePoint[], radiusKm = 200): Promise<POI[]> {
  // Sample every Nth point to avoid too many API calls
  const samples = route.filter((_, i) => i % 10 === 0);
  const seen = new Set<number>();
  const pois: POI[] = [];

  for (const point of samples) {
    const types = Object.keys(CATEGORY_MAP);
    const found = await searchAround(point.lat, point.lon, radiusKm, types);
    for (const f of found) {
      if (seen.has(f.geonameId)) continue;
      seen.add(f.geonameId);
      const category = CATEGORY_MAP[f.fcode];
      if (!category) continue;
      const wiki = await fetchWikiSummary(f.name);
      if (!wiki?.extract) continue;

      pois.push({
        id: `gn-${f.geonameId}`,
        name: f.name,
        category,
        lat: parseFloat(f.lat),
        lon: parseFloat(f.lng),
        elevation: f.elevation,
        population: f.population,
        wikiTitle: f.name,
        summary: wiki.extract.slice(0, 800),
        facts: extractFacts(wiki.extract),
        photos: wiki.thumbnail ? [wiki.thumbnail] : []
      });
    }
  }
  return pois;
}

function extractFacts(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).slice(0, 3);
}
```

- [ ] **Step 5: Test (skipped during dev to avoid hitting APIs in CI)**

`apps/backend/tests/poiAggregator.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { aggregatePOIsForRoute } from '../src/services/poiAggregator.js';
vi.mock('../src/external/geonames.js', () => ({
  searchAround: vi.fn().mockResolvedValue([{
    geonameId: 1, name: 'Mont Blanc', lat: '45.83', lng: '6.86',
    fcl: 'T', fcode: 'MT', elevation: 4810
  }])
}));
vi.mock('../src/external/wikipedia.js', () => ({
  fetchWikiSummary: vi.fn().mockResolvedValue({
    extract: 'Mont Blanc is the highest mountain in the Alps. It reaches 4810m. Climbers love it.',
    thumbnail: 'https://example.com/photo.jpg'
  })
}));

describe('aggregatePOIsForRoute', () => {
  it('aggregates and dedupes', async () => {
    const route = Array.from({ length: 20 }, (_, i) => ({
      lat: 45 + i * 0.1, lon: 6, altitude: 11000, elapsedSeconds: i * 100
    }));
    const pois = await aggregatePOIsForRoute(route);
    expect(pois.length).toBeGreaterThan(0);
    expect(pois[0].name).toBe('Mont Blanc');
    expect(pois[0].category).toBe('mountain');
  });
});
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(backend): POI aggregator combining GeoNames + Wikipedia"
```

### Task 1.6: Flight lookup service

**Files:**
- Create: `apps/backend/src/external/aviationstack.ts`, `apps/backend/src/services/flightLookup.ts`

- [ ] **Step 1: AviationStack client** (get free key at aviationstack.com)

```typescript
const KEY = process.env.AVIATIONSTACK_KEY!;
export async function lookupFlight(flightNumber: string, date: string) {
  const url = `http://api.aviationstack.com/v1/flights?access_key=${KEY}&flight_iata=${flightNumber}&flight_date=${date}`;
  const r = await fetch(url);
  const j = await r.json();
  return j.data?.[0] ?? null;
}
```

- [ ] **Step 2: Service combining cache + lookup + airport DB**

`apps/backend/src/services/flightLookup.ts`:
```typescript
import { prisma } from '../db/prisma.js';
import { lookupFlight } from '../external/aviationstack.js';
import type { Flight } from '@skyatlas/shared';

export async function getFlight(flightNumber: string, date: string): Promise<Flight | null> {
  const cached = await prisma.flightCache.findUnique({
    where: { flightNumber_date: { flightNumber, date } }
  });
  if (cached) return cached.payload as Flight;

  const raw = await lookupFlight(flightNumber, date);
  if (!raw) return null;

  const [origin, destination] = await Promise.all([
    prisma.airport.findUnique({ where: { iata: raw.departure.iata } }),
    prisma.airport.findUnique({ where: { iata: raw.arrival.iata } })
  ]);
  if (!origin || !destination) return null;

  const flight: Flight = {
    id: `${flightNumber}-${date}`,
    flightNumber,
    airline: raw.airline.name,
    origin: stripDbFields(origin),
    destination: stripDbFields(destination),
    scheduledDeparture: raw.departure.scheduled,
    scheduledArrival: raw.arrival.scheduled,
    aircraftType: raw.aircraft?.iata
  };
  await prisma.flightCache.create({
    data: { flightNumber, date, payload: flight as any }
  });
  return flight;
}

function stripDbFields(a: any) {
  const { id, ...rest } = a;
  return rest;
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(backend): flight lookup with cache via AviationStack"
```

### Task 1.7: Package builder + API routes

**Files:**
- Create: `apps/backend/src/services/packageBuilder.ts`, `apps/backend/src/routes/flights.ts`

- [ ] **Step 1: Package builder**

```typescript
import type { OfflinePackage } from '@skyatlas/shared';
import { getFlight } from './flightLookup.js';
import { buildRoute } from './routeBuilder.js';
import { aggregatePOIsForRoute } from './poiAggregator.js';

export async function buildPackage(flightNumber: string, date: string): Promise<OfflinePackage | null> {
  const flight = await getFlight(flightNumber, date);
  if (!flight) return null;

  const durationMin = Math.round(
    (new Date(flight.scheduledArrival).getTime() - new Date(flight.scheduledDeparture).getTime()) / 60_000
  );
  const route = buildRoute(flight.origin, flight.destination, { points: 200, durationMinutes: durationMin });
  const pois = await aggregatePOIsForRoute(route, 200);

  return { version: 1, flight, route, pois, generatedAt: new Date().toISOString() };
}
```

- [ ] **Step 2: Routes**

`apps/backend/src/routes/flights.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getFlight } from '../services/flightLookup.js';
import { buildPackage } from '../services/packageBuilder.js';

const lookupSchema = z.object({ flightNumber: z.string(), date: z.string() });

export const flightRoutes: FastifyPluginAsync = async (app) => {
  app.post('/flights/lookup', async (req, reply) => {
    const body = lookupSchema.parse(req.body);
    const flight = await getFlight(body.flightNumber, body.date);
    if (!flight) return reply.code(404).send({ error: 'flight not found' });
    return flight;
  });

  app.post('/flights/package', async (req, reply) => {
    const body = lookupSchema.parse(req.body);
    const pkg = await buildPackage(body.flightNumber, body.date);
    if (!pkg) return reply.code(404).send({ error: 'cannot build package' });
    return pkg;
  });
};
```

- [ ] **Step 3: Register in `index.ts`**

Add: `await app.register(flightRoutes);`

- [ ] **Step 4: Manual smoke test**

```bash
curl -X POST http://localhost:3000/flights/lookup \
  -H "Content-Type: application/json" \
  -d '{"flightNumber":"SU100","date":"2026-05-20"}'
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(backend): package builder + flight lookup routes"
```

---

## Phase 2: Mobile Foundation

### Task 2.1: Initialize Expo project

**Files:**
- Create: `apps/mobile/*` (via Expo CLI)

- [ ] **Step 1: Create Expo app**

```bash
cd apps && npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npx expo install expo-camera expo-sqlite expo-file-system expo-location expo-status-bar
npm i zustand @tanstack/react-query react-native-mmkv @react-navigation/native @react-navigation/native-stack
npx expo install react-native-screens react-native-safe-area-context react-native-gesture-handler react-native-reanimated
npm i @maplibre/maplibre-react-native
npm i @skyatlas/shared
```

- [ ] **Step 2: Configure `app.json`**

Set name to "SkyAtlas", bundle IDs `com.skyatlas.app`, add camera permission strings.

- [ ] **Step 3: Smoke test**

```bash
npx expo start
```

Scan QR with Expo Go on your iPhone/Android. Confirm "Open up App.tsx" appears.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(mobile): initialize Expo project with core deps"
```

### Task 2.2: Theme + navigation skeleton

**Files:**
- Create: `apps/mobile/src/theme/colors.ts`, `apps/mobile/src/theme/typography.ts`, `apps/mobile/src/navigation/RootNavigator.tsx`, modify `apps/mobile/App.tsx`

- [ ] **Step 1: Theme**

`src/theme/colors.ts`:
```typescript
export const colors = {
  bg: '#0A0E1A',
  surface: '#141A2E',
  surfaceElevated: '#1E2540',
  primary: '#3D8BFD',
  accent: '#FFC857',
  text: '#FFFFFF',
  textMuted: '#8B95B0',
  success: '#34C759',
  border: '#2A3252'
};
```

- [ ] **Step 2: Stub screens**

Create empty placeholder components for each screen in the file structure above (just a `<View><Text>NAME</Text></View>`).

- [ ] **Step 3: Root navigator**

```typescript
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import AddFlightScreen from '../screens/AddFlightScreen';
import FlightDetailScreen from '../screens/FlightDetailScreen';
import InFlightScreen from '../screens/InFlightScreen';
import POIDetailScreen from '../screens/POIDetailScreen';
import FlightSummaryScreen from '../screens/FlightSummaryScreen';
import CollectionScreen from '../screens/CollectionScreen';
import PaywallScreen from '../screens/PaywallScreen';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#0A0E1A' }, headerTintColor: '#fff' }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="AddFlight" component={AddFlightScreen} />
        <Stack.Screen name="FlightDetail" component={FlightDetailScreen} />
        <Stack.Screen name="InFlight" component={InFlightScreen} options={{ headerShown: false }} />
        <Stack.Screen name="POIDetail" component={POIDetailScreen} />
        <Stack.Screen name="FlightSummary" component={FlightSummaryScreen} />
        <Stack.Screen name="Collection" component={CollectionScreen} />
        <Stack.Screen name="Paywall" component={PaywallScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

- [ ] **Step 4: Update `App.tsx`**

```typescript
import 'react-native-gesture-handler';
import RootNavigator from './src/navigation/RootNavigator';
export default function App() { return <RootNavigator />; }
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(mobile): theme + navigation skeleton"
```

### Task 2.3: Geo math (TDD)

**Files:**
- Create: `apps/mobile/src/core/geo/distance.ts`, `apps/mobile/src/core/geo/greatCircle.ts`, `apps/mobile/__tests__/geo/greatCircle.test.ts`

- [ ] **Step 1: Install vitest**

```bash
cd apps/mobile && npm i -D vitest
```

- [ ] **Step 2: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { interpolateAlongRoute, bearing, haversine } from '../../src/core/geo/greatCircle';

describe('greatCircle', () => {
  it('interpolates at fraction', () => {
    const p = interpolateAlongRoute(
      [{ lat: 0, lon: 0, altitude: 0, elapsedSeconds: 0 },
       { lat: 0, lon: 90, altitude: 11000, elapsedSeconds: 18000 }],
      9000
    );
    expect(p.lat).toBeCloseTo(0, 1);
    expect(p.lon).toBeCloseTo(45, 1);
  });

  it('haversine SVO→JFK ≈ 7510 km', () => {
    const km = haversine(55.97, 37.41, 40.64, -73.78);
    expect(km).toBeCloseTo(7510, -2);
  });
});
```

- [ ] **Step 3: Implementation**

```typescript
import type { RoutePoint } from '@skyatlas/shared';

const R = 6371;
const DEG = Math.PI / 180;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dφ = (lat2 - lat1) * DEG, dλ = (lon2 - lon1) * DEG;
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * DEG, φ2 = lat2 * DEG;
  const Δλ = (lon2 - lon1) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

export function interpolateAlongRoute(route: RoutePoint[], elapsedSec: number): RoutePoint {
  if (elapsedSec <= route[0].elapsedSeconds) return route[0];
  if (elapsedSec >= route[route.length - 1].elapsedSeconds) return route[route.length - 1];
  let i = 0;
  while (route[i + 1].elapsedSeconds < elapsedSec) i++;
  const a = route[i], b = route[i + 1];
  const t = (elapsedSec - a.elapsedSeconds) / (b.elapsedSeconds - a.elapsedSeconds);
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t,
    altitude: a.altitude + (b.altitude - a.altitude) * t,
    elapsedSeconds: elapsedSec
  };
}
```

Run `npx vitest run` → PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(mobile): great-circle interpolation utilities"
```

### Task 2.4: Position engine

**Files:**
- Create: `apps/mobile/src/core/flight/positionEngine.ts`, `apps/mobile/src/core/flight/flightStore.ts`, `apps/mobile/__tests__/flight/positionEngine.test.ts`

- [ ] **Step 1: Tests**

```typescript
import { describe, it, expect } from 'vitest';
import { computePosition } from '../../src/core/flight/positionEngine';

const ROUTE = Array.from({ length: 100 }, (_, i) => ({
  lat: 0, lon: i * 0.5, altitude: 11000, elapsedSeconds: i * 60
}));

describe('positionEngine', () => {
  it('returns position based on takeoff + now', () => {
    const takeoff = Date.now() - 1800_000; // 30m ago
    const p = computePosition(ROUTE, new Date(takeoff));
    expect(p.elapsedSeconds).toBeCloseTo(1800, -1);
  });

  it('clamps to route end after arrival', () => {
    const takeoff = Date.now() - 20000_000;
    const p = computePosition(ROUTE, new Date(takeoff));
    expect(p.elapsedSeconds).toBe(99 * 60);
  });
});
```

- [ ] **Step 2: Implementation**

```typescript
import type { RoutePoint } from '@skyatlas/shared';
import { interpolateAlongRoute } from '../geo/greatCircle';

export function computePosition(route: RoutePoint[], takeoffAt: Date, now: Date = new Date()): RoutePoint {
  const elapsedSec = Math.max(0, (now.getTime() - takeoffAt.getTime()) / 1000);
  return interpolateAlongRoute(route, elapsedSec);
}
```

- [ ] **Step 3: Zustand store**

`src/core/flight/flightStore.ts`:
```typescript
import { create } from 'zustand';
import type { OfflinePackage, RoutePoint } from '@skyatlas/shared';

interface FlightState {
  activePackage: OfflinePackage | null;
  takeoffAt: Date | null;
  currentPosition: RoutePoint | null;
  setPackage: (p: OfflinePackage) => void;
  confirmTakeoff: (at: Date) => void;
  updatePosition: (p: RoutePoint) => void;
  clear: () => void;
}

export const useFlightStore = create<FlightState>((set) => ({
  activePackage: null, takeoffAt: null, currentPosition: null,
  setPackage: (p) => set({ activePackage: p }),
  confirmTakeoff: (at) => set({ takeoffAt: at }),
  updatePosition: (p) => set({ currentPosition: p }),
  clear: () => set({ activePackage: null, takeoffAt: null, currentPosition: null })
}));
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(mobile): position engine + flight zustand store"
```

### Task 2.5: SQLite POI database

**Files:**
- Create: `apps/mobile/src/core/offline/poiDatabase.ts`, `apps/mobile/src/core/offline/packageDownloader.ts`

- [ ] **Step 1: POI database wrapper**

```typescript
import * as SQLite from 'expo-sqlite';
import type { POI, OfflinePackage } from '@skyatlas/shared';

const db = SQLite.openDatabaseSync('skyatlas.db');

export async function initDb() {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS packages (
      flightId TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      downloadedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pois (
      id TEXT PRIMARY KEY,
      flightId TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pois_flight ON pois(flightId);
  `);
}

export async function savePackage(pkg: OfflinePackage) {
  await db.runAsync(
    'INSERT OR REPLACE INTO packages(flightId, payload, downloadedAt) VALUES (?, ?, ?)',
    [pkg.flight.id, JSON.stringify(pkg), Date.now()]
  );
  for (const p of pkg.pois) {
    await db.runAsync(
      'INSERT OR REPLACE INTO pois(id, flightId, name, category, lat, lon, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [p.id, pkg.flight.id, p.name, p.category, p.lat, p.lon, JSON.stringify(p)]
    );
  }
}

export async function loadPackage(flightId: string): Promise<OfflinePackage | null> {
  const row = await db.getFirstAsync<{ payload: string }>(
    'SELECT payload FROM packages WHERE flightId = ?', [flightId]
  );
  return row ? JSON.parse(row.payload) : null;
}

export async function nearbyPOIs(flightId: string, lat: number, lon: number, radiusKm = 200): Promise<POI[]> {
  const degApprox = radiusKm / 111;
  const rows = await db.getAllAsync<{ data: string }>(
    `SELECT data FROM pois WHERE flightId = ? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`,
    [flightId, lat - degApprox, lat + degApprox, lon - degApprox, lon + degApprox]
  );
  return rows.map(r => JSON.parse(r.data));
}
```

- [ ] **Step 2: Package downloader**

```typescript
import type { OfflinePackage } from '@skyatlas/shared';
import { savePackage } from './poiDatabase';
import { apiClient } from '../api/client';

export async function downloadPackage(flightNumber: string, date: string): Promise<OfflinePackage> {
  const pkg = await apiClient.post<OfflinePackage>('/flights/package', { flightNumber, date });
  await savePackage(pkg);
  return pkg;
}
```

- [ ] **Step 3: API client**

`src/core/api/client.ts`:
```typescript
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
export const apiClient = {
  async post<T>(path: string, body: any): Promise<T> {
    const r = await fetch(BASE_URL + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  }
};
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(mobile): SQLite POI database + package downloader"
```

---

## Phase 3: Add Flight Flow

### Task 3.1: Add flight screen (manual entry)

**Files:**
- Modify: `apps/mobile/src/screens/AddFlightScreen.tsx`

- [ ] **Step 1: Build form**

```typescript
import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { downloadPackage } from '../core/offline/packageDownloader';
import { colors } from '../theme/colors';

export default function AddFlightScreen() {
  const [flightNumber, setFlightNumber] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigation<any>();

  const submit = async () => {
    setLoading(true); setErr(null);
    try {
      const pkg = await downloadPackage(flightNumber.toUpperCase(), date);
      nav.replace('FlightDetail', { flightId: pkg.flight.id });
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 20, gap: 12 }}>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>Add Flight</Text>
      <TextInput
        placeholder="Flight number (e.g. SU100)"
        placeholderTextColor={colors.textMuted}
        value={flightNumber} onChangeText={setFlightNumber} autoCapitalize="characters"
        style={inputStyle}
      />
      <TextInput
        placeholder="Date YYYY-MM-DD"
        placeholderTextColor={colors.textMuted}
        value={date} onChangeText={setDate}
        style={inputStyle}
      />
      <Pressable onPress={submit} style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 12, alignItems: 'center' }}>
        {loading ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontWeight: '700' }}>Add & Download</Text>}
      </Pressable>
      {err && <Text style={{ color: '#FF453A' }}>{err}</Text>}
    </View>
  );
}

const inputStyle = {
  backgroundColor: colors.surface, color: colors.text, padding: 14, borderRadius: 12, fontSize: 16
};
```

- [ ] **Step 2: Smoke test on Expo Go**

Open app → tap home button to navigate to AddFlight (stub home for now) → enter `SU100` and today's date → confirm package downloads.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(mobile): add flight screen with manual entry"
```

### Task 3.2: Boarding pass scanner

**Files:**
- Create: `apps/mobile/src/components/BoardingPassScanner.tsx`, modify AddFlightScreen

- [ ] **Step 1: Install barcode scanning**

```bash
cd apps/mobile && npx expo install expo-camera
```

- [ ] **Step 2: Scanner component**

```typescript
import { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface Props { onScan: (data: { flightNumber: string; date: string }) => void; }

export default function BoardingPassScanner({ onScan }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => { if (!permission?.granted) requestPermission(); }, []);

  if (!permission?.granted) {
    return <View><Text>Camera permission required.</Text></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ['pdf417'] }}
        onBarcodeScanned={({ data }) => {
          if (scanned) return;
          setScanned(true);
          const parsed = parseBoardingPass(data);
          if (parsed) onScan(parsed);
        }}
      />
    </View>
  );
}

function parseBoardingPass(raw: string): { flightNumber: string; date: string } | null {
  // IATA BCBP format: "M1LAST/FIRST EABC123 SVO JFK SU0100 145Y..."
  const m = raw.match(/[A-Z]{2}\s?(\d{1,4})/);
  if (!m) return null;
  const dayOfYear = parseInt(raw.substr(44, 3), 10);
  const year = new Date().getFullYear();
  const date = new Date(year, 0, dayOfYear).toISOString().slice(0, 10);
  return { flightNumber: m[0].replace(/\s/g, ''), date };
}
```

- [ ] **Step 3: Wire into AddFlightScreen**

Add a "Scan boarding pass" button that opens scanner modal and auto-fills fields.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(mobile): boarding pass barcode scanner"
```

### Task 3.3: Home screen with flight list

**Files:**
- Modify: `apps/mobile/src/screens/HomeScreen.tsx`

- [ ] **Step 1: Load flights from DB**

Query `packages` table on focus, show list with flight number, route, date. Tap → navigate to FlightDetail. FAB → AddFlight.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat(mobile): home screen with flight list"
```

### Task 3.4: Flight detail screen (pre-flight)

**Files:**
- Modify: `apps/mobile/src/screens/FlightDetailScreen.tsx`

- [ ] **Step 1: Load + display**

Show: route, scheduled times, "Download size: X MB", "Start flight" button. "Start flight" prompts for takeoff time confirmation, then navigates to InFlight.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat(mobile): flight detail pre-flight screen"
```

---

## Phase 4: In-Flight Experience

### Task 4.1: FlightMap component with MapLibre

**Files:**
- Create: `apps/mobile/src/components/FlightMap.tsx`, `apps/mobile/src/components/PlaneMarker.tsx`

- [ ] **Step 1: Configure MapLibre**

```bash
npx expo install @maplibre/maplibre-react-native
```

iOS: `npx pod-install`. Note: requires development build, not Expo Go from this point. Use `npx expo run:ios` / `run:android`.

- [ ] **Step 2: Map component**

```typescript
import MapLibreGL from '@maplibre/maplibre-react-native';
import { View } from 'react-native';
import type { RoutePoint } from '@skyatlas/shared';

MapLibreGL.setAccessToken(null);

interface Props { route: RoutePoint[]; position: RoutePoint; }

export default function FlightMap({ route, position }: Props) {
  const lineGeoJSON = {
    type: 'Feature' as const, geometry: {
      type: 'LineString' as const,
      coordinates: route.map(p => [p.lon, p.lat])
    }, properties: {}
  };
  const planeGeoJSON = {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [position.lon, position.lat] },
    properties: {}
  };

  return (
    <MapLibreGL.MapView
      style={{ flex: 1 }}
      styleURL="https://demotiles.maplibre.org/style.json"
    >
      <MapLibreGL.Camera centerCoordinate={[position.lon, position.lat]} zoomLevel={4} />
      <MapLibreGL.ShapeSource id="route" shape={lineGeoJSON}>
        <MapLibreGL.LineLayer id="route-line" style={{ lineColor: '#3D8BFD', lineWidth: 3 }} />
      </MapLibreGL.ShapeSource>
      <MapLibreGL.ShapeSource id="plane" shape={planeGeoJSON}>
        <MapLibreGL.CircleLayer id="plane-dot" style={{ circleRadius: 8, circleColor: '#FFC857' }} />
      </MapLibreGL.ShapeSource>
    </MapLibreGL.MapView>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(mobile): flight map component with MapLibre"
```

### Task 4.2: In-flight screen with live position

**Files:**
- Modify: `apps/mobile/src/screens/InFlightScreen.tsx`

- [ ] **Step 1: Tick loop + render**

```typescript
import { useEffect } from 'react';
import { View } from 'react-native';
import FlightMap from '../components/FlightMap';
import FlightStats from '../components/FlightStats';
import { useFlightStore } from '../core/flight/flightStore';
import { computePosition } from '../core/flight/positionEngine';

export default function InFlightScreen() {
  const { activePackage, takeoffAt, currentPosition, updatePosition } = useFlightStore();

  useEffect(() => {
    if (!activePackage || !takeoffAt) return;
    const tick = () => updatePosition(computePosition(activePackage.route, takeoffAt));
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [activePackage, takeoffAt]);

  if (!activePackage || !currentPosition) return <View />;

  return (
    <View style={{ flex: 1 }}>
      <FlightMap route={activePackage.route} position={currentPosition} />
      <FlightStats package={activePackage} position={currentPosition} takeoffAt={takeoffAt!} />
    </View>
  );
}
```

- [ ] **Step 2: FlightStats component**

Show: current speed (computed from delta), altitude, distance remaining (haversine to last route point), time remaining, current country.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(mobile): in-flight screen with live position tick"
```

### Task 4.3: POI scheduler + cards

**Files:**
- Create: `apps/mobile/src/core/flight/poiScheduler.ts`, `apps/mobile/src/components/POICard.tsx`

- [ ] **Step 1: Scheduler**

Every tick, query nearby POIs from SQLite within 200km. Show card for closest unseen POI. Track shown set in Zustand to avoid repeats.

- [ ] **Step 2: Card UI**

Bottom sheet style card: photo background, name, category icon, distance, "Read more" → POIDetailScreen.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(mobile): POI scheduler with proximity cards"
```

### Task 4.4: POI detail screen

**Files:**
- Modify: `apps/mobile/src/screens/POIDetailScreen.tsx`

- [ ] **Step 1: Full-screen detail**

Photo header, name, category, summary text, fact bullets, mini-map showing POI location relative to plane.

- [ ] **Step 2: Mark "visited" in collection store on view.**

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(mobile): POI detail screen"
```

### Task 4.5: Flight summary screen

**Files:**
- Modify: `apps/mobile/src/screens/FlightSummaryScreen.tsx`

- [ ] **Step 1: Build summary**

Show: route map with traversed path, total distance, time in air, countries crossed, POIs discovered, achievements unlocked, share button.

- [ ] **Step 2: Trigger on arrival** (position == last route point) — auto-navigate from InFlight.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(mobile): post-flight summary screen"
```

---

## Phase 5: Gamification

### Task 5.1: Collections + achievements core (TDD)

**Files:**
- Create: `apps/mobile/src/core/gamification/achievements.ts`, `apps/mobile/src/core/gamification/collections.ts`, `apps/mobile/__tests__/gamification/achievements.test.ts`

- [ ] **Step 1: Test achievement evaluation**

```typescript
import { describe, it, expect } from 'vitest';
import { evaluateAchievements } from '../../src/core/gamification/achievements';

describe('achievements', () => {
  it('awards first flight', () => {
    const stats = { totalFlights: 1, countries: ['Russia'], poisDiscovered: 0, longestFlightHours: 1 };
    const new_ = evaluateAchievements(stats, []);
    expect(new_).toContain('first_flight');
  });
  it('awards marathoner on 12h+ flight', () => {
    const stats = { totalFlights: 5, countries: [], poisDiscovered: 0, longestFlightHours: 13 };
    expect(evaluateAchievements(stats, [])).toContain('marathoner');
  });
});
```

- [ ] **Step 2: Implementation**

```typescript
export interface LifetimeStats {
  totalFlights: number;
  countries: string[];
  poisDiscovered: number;
  longestFlightHours: number;
}

export const ACHIEVEMENTS = [
  { id: 'first_flight', name: '🌍 First Flight', check: (s: LifetimeStats) => s.totalFlights >= 1 },
  { id: 'air_wolf',     name: '✈️ Air Wolf',     check: (s: LifetimeStats) => s.totalFlights >= 10 },
  { id: 'globetrotter', name: '🌏 Globetrotter', check: (s: LifetimeStats) => s.countries.length >= 20 },
  { id: 'explorer',     name: '🗺️ Explorer',    check: (s: LifetimeStats) => s.poisDiscovered >= 50 },
  { id: 'marathoner',   name: '⏰ Marathoner',   check: (s: LifetimeStats) => s.longestFlightHours >= 12 }
];

export function evaluateAchievements(stats: LifetimeStats, alreadyEarned: string[]): string[] {
  return ACHIEVEMENTS.filter(a => a.check(stats) && !alreadyEarned.includes(a.id)).map(a => a.id);
}
```

- [ ] **Step 3: Collection store**

Use MMKV for persistent collections (countries, achievements unlocked). Update after each flight completes.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(mobile): gamification core - achievements + collections"
```

### Task 5.2: Collection screen UI

**Files:**
- Modify: `apps/mobile/src/screens/CollectionScreen.tsx`

- [ ] **Step 1: Tabs: Countries, Achievements, Stats**

Countries: world map with visited countries filled. Achievements: grid of locked/unlocked badges. Stats: total km, hours, flights.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat(mobile): collection screen with countries/achievements/stats"
```

---

## Phase 6: Monetization

### Task 6.1: RevenueCat integration

**Files:**
- Create: `apps/mobile/src/core/monetization/revenueCat.ts`, modify `PaywallScreen.tsx`

- [ ] **Step 1: Install + configure**

```bash
npm i react-native-purchases
```

Set up RevenueCat dashboard: create products (per_flight $1.99, annual $19.99, lifetime $49.99), get API keys.

- [ ] **Step 2: Wrapper**

```typescript
import Purchases, { PurchasesPackage } from 'react-native-purchases';

export const monetization = {
  async init(userId: string) {
    await Purchases.configure({ apiKey: process.env.EXPO_PUBLIC_RC_KEY!, appUserID: userId });
  },
  async offerings(): Promise<PurchasesPackage[]> {
    const o = await Purchases.getOfferings();
    return o.current?.availablePackages ?? [];
  },
  async purchase(pkg: PurchasesPackage) {
    return Purchases.purchasePackage(pkg);
  },
  async isPro(): Promise<boolean> {
    const info = await Purchases.getCustomerInfo();
    return Boolean(info.entitlements.active['pro']);
  }
};
```

- [ ] **Step 3: Paywall screen**

List 3 options (per-flight, annual, lifetime) with prices. Call `monetization.purchase()` on selection.

- [ ] **Step 4: Gate features**

Free: 5 POI per flight, 3 achievements. After 5 POIs, show "Unlock unlimited" CTA → Paywall.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(mobile): RevenueCat monetization with paywall"
```

---

## Phase 7: Polish & Ship

### Task 7.1: App icon + splash screen

- [ ] Generate icon (1024x1024) — simple SkyAtlas mark, navy bg, gold accent.
- [ ] Run `npx expo-asset` to generate all sizes.
- [ ] Commit.

### Task 7.2: Onboarding (3 slides)

- [ ] Slide 1: "Add your flight." Slide 2: "Discover what's below." Slide 3: "Collect the world."
- [ ] Show once on first launch via MMKV flag.
- [ ] Commit.

### Task 7.3: Error states + offline detection

- [ ] Network error UI for package download.
- [ ] "You're offline — open your downloaded flight" empty state.
- [ ] Commit.

### Task 7.4: Analytics

- [ ] Install PostHog or Mixpanel mobile SDK.
- [ ] Track: flight_added, package_downloaded, flight_started, poi_viewed, achievement_unlocked, paywall_shown, purchase_made.
- [ ] Commit.

### Task 7.5: TestFlight + Play Beta build

- [ ] `eas build --platform all --profile preview`.
- [ ] Upload to TestFlight + Google Play Internal Testing.
- [ ] Test on real flight if possible.
- [ ] Commit build configs.

### Task 7.6: App Store + Play Store submission

- [ ] Screenshots (6.5"/6.1" iPhone, Android phone).
- [ ] App descriptions in EN + RU.
- [ ] Privacy policy URL.
- [ ] Submit for review.

---

## Self-Review Checklist

- [x] All spec sections from PRODUCT_PLAN.md covered: offline tracking ✓, POI cards ✓, gamification ✓, monetization ✓, boarding pass scan ✓, takeoff confirmation ✓
- [x] No placeholders left in code blocks
- [x] Function signatures consistent (`computePosition`, `buildRoute`, `aggregatePOIsForRoute`, `evaluateAchievements`)
- [x] File paths match the File Structure section
- [ ] Deferred for post-MVP per user agreement: AR mode, lock screen widget, audio mode, Kids Mode, social features

---

## Notes for the Implementing Engineer

- **Use Expo Go** for everything until Task 4.1 (MapLibre requires native build). At that point switch to `npx expo run:ios` / `run:android` with a dev client.
- **Mock external APIs in tests.** OpenSky / AviationStack / Wikipedia / GeoNames must never be called from test files — always `vi.mock()`.
- **Commit after each task.** That's how progress gets tracked.
- **When stuck on RN UI, ask** — backend engineers often spend hours fighting layouts that are 5-minute fixes for someone familiar with Flexbox-on-mobile.
- **Don't optimize early.** First make it work, then make it pretty.
