import * as SQLite from 'expo-sqlite';
import type { OfflinePackage } from '@skyatlas/shared';

/**
 * Flights saved on the phone.
 *
 * One row per flight holding the whole package as JSON. A package is a few
 * hundred kilobytes and is always read whole, so there is nothing to gain from
 * normalising it into tables — and everything to lose in migrations.
 */

let db: SQLite.SQLiteDatabase | null = null;
let ready: Promise<void> | null = null;

function database(): SQLite.SQLiteDatabase {
  if (!db) db = SQLite.openDatabaseSync('skyatlas.db');
  return db;
}

export function initStore(): Promise<void> {
  if (!ready) {
    ready = database().execAsync(`
      CREATE TABLE IF NOT EXISTS packages (
        flightId TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        downloadedAt INTEGER NOT NULL
      );
    `);
  }
  return ready;
}

export async function savePackage(pkg: OfflinePackage): Promise<void> {
  await initStore();
  await database().runAsync(
    'INSERT OR REPLACE INTO packages(flightId, payload, downloadedAt) VALUES (?, ?, ?)',
    [pkg.flight.id, JSON.stringify(pkg), Date.now()]
  );
}

export async function loadPackage(flightId: string): Promise<OfflinePackage | null> {
  await initStore();
  const row = await database().getFirstAsync<{ payload: string }>(
    'SELECT payload FROM packages WHERE flightId = ?',
    [flightId]
  );
  return row ? (JSON.parse(row.payload) as OfflinePackage) : null;
}

export async function listPackages(): Promise<OfflinePackage[]> {
  await initStore();
  const rows = await database().getAllAsync<{ payload: string }>('SELECT payload FROM packages');
  const out: OfflinePackage[] = [];
  for (const r of rows) {
    try {
      out.push(JSON.parse(r.payload) as OfflinePackage);
    } catch {
      // A corrupt row must not take the whole list down with it.
    }
  }
  return out;
}

export async function deletePackage(flightId: string): Promise<void> {
  await initStore();
  await database().runAsync('DELETE FROM packages WHERE flightId = ?', [flightId]);
}
