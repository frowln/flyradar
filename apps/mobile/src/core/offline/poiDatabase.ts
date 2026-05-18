import * as SQLite from 'expo-sqlite';
import type { POI, OfflinePackage } from '@skyatlas/shared';

let db: SQLite.SQLiteDatabase;

function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('skyatlas.db');
  }
  return db;
}

export async function initDb(): Promise<void> {
  const database = getDb();
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS packages (
      flightId TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      downloadedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pois (
      id TEXT NOT NULL,
      flightId TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (id, flightId)
    );

    CREATE INDEX IF NOT EXISTS idx_pois_flight ON pois(flightId);
    CREATE INDEX IF NOT EXISTS idx_pois_location ON pois(flightId, lat, lon);
  `);
}

export async function savePackage(pkg: OfflinePackage): Promise<void> {
  const database = getDb();
  await database.runAsync(
    'INSERT OR REPLACE INTO packages(flightId, payload, downloadedAt) VALUES (?, ?, ?)',
    [pkg.flight.id, JSON.stringify(pkg), Date.now()]
  );
  for (const p of pkg.pois) {
    await database.runAsync(
      'INSERT OR REPLACE INTO pois(id, flightId, name, category, lat, lon, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [p.id, pkg.flight.id, p.name, p.category, p.lat, p.lon, JSON.stringify(p)]
    );
  }
}

export async function loadPackage(flightId: string): Promise<OfflinePackage | null> {
  const database = getDb();
  const row = await database.getFirstAsync<{ payload: string }>(
    'SELECT payload FROM packages WHERE flightId = ?',
    [flightId]
  );
  return row ? JSON.parse(row.payload) : null;
}

export async function listPackages(): Promise<Array<{ flightId: string; downloadedAt: number }>> {
  const database = getDb();
  return database.getAllAsync<{ flightId: string; downloadedAt: number }>(
    'SELECT flightId, downloadedAt FROM packages ORDER BY downloadedAt DESC'
  );
}

export async function nearbyPOIs(
  flightId: string,
  lat: number,
  lon: number,
  radiusKm = 200
): Promise<POI[]> {
  const database = getDb();
  // Approximate degree per km: 1 degree ≈ 111 km
  const degApprox = radiusKm / 111;
  const rows = await database.getAllAsync<{ data: string }>(
    `SELECT data FROM pois
     WHERE flightId = ?
     AND lat BETWEEN ? AND ?
     AND lon BETWEEN ? AND ?`,
    [flightId, lat - degApprox, lat + degApprox, lon - degApprox, lon + degApprox]
  );
  return rows.map((r) => JSON.parse(r.data) as POI);
}

export async function deletePackage(flightId: string): Promise<void> {
  const database = getDb();
  await database.runAsync('DELETE FROM pois WHERE flightId = ?', [flightId]);
  await database.runAsync('DELETE FROM packages WHERE flightId = ?', [flightId]);
}
