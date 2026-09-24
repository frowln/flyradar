import { createMMKV } from 'react-native-mmkv';
import { isPro, MONETIZATION_ENABLED } from './revenueCat';

const storage = createMMKV({ id: 'skyatlas-entitlement' });

/**
 * The free tier, enforced.
 *
 * The paywall has always promised "five places per flight" in copy; nothing in
 * the app measured it, so every flight was effectively unlimited and the paywall
 * screen was unreachable. This module is the meter behind that sentence.
 */
export const FREE_PLACES_PER_FLIGHT = 5;

const KEY_PRO = 'pro';
const openedKey = (flightId: string) => `opened:${flightId}`;

/**
 * Places already unlocked on a flight, by id.
 *
 * Ids rather than a counter, because reopening a card the passenger has already
 * read must not cost another slot — otherwise walking back to place five makes
 * it unreadable, which reads as a bug, not as a limit.
 */
export function openedPlaces(flightId: string): string[] {
  const raw = storage.getString(openedKey(flightId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function notePlaceOpened(flightId: string, poiId: string): void {
  const list = openedPlaces(flightId);
  if (list.includes(poiId)) return;
  storage.set(openedKey(flightId), JSON.stringify([...list, poiId]));
}

/**
 * Whether this flight is fully open regardless of the meter.
 *
 * Everything is open when the build has no purchases configured, when the
 * passenger has Pro, and on their first flight — the one that decides whether
 * there will be a second, and the worst possible moment to hold back.
 */
export function fullAccess(isFirstFlight: boolean): boolean {
  return !MONETIZATION_ENABLED || isProCached() || isFirstFlight;
}

/** How many new places the free tier still allows on this flight. */
export function placesLeft(flightId: string): number {
  if (!MONETIZATION_ENABLED || isProCached()) return Infinity;
  return Math.max(0, FREE_PLACES_PER_FLIGHT - openedPlaces(flightId).length);
}

/** Whether this particular card may be opened right now. */
export function canOpenPlace(flightId: string, poiId: string): boolean {
  if (!MONETIZATION_ENABLED || isProCached()) return true;
  const list = openedPlaces(flightId);
  return list.includes(poiId) || list.length < FREE_PLACES_PER_FLIGHT;
}

/**
 * The cached entitlement.
 *
 * Read synchronously during render, so it cannot be an async call to the store.
 * The cache is authoritative for the UI; `refreshPro()` reconciles it with
 * RevenueCat — which itself verifies against our server — at launch and after a
 * purchase.
 */
export function isProCached(): boolean {
  return storage.getBoolean(KEY_PRO) ?? false;
}

export function setPro(value: boolean): void {
  storage.set(KEY_PRO, value);
}

/** Reconciles the cache with the store; an unanswered question leaves it as it was. */
export async function refreshPro(): Promise<boolean> {
  const pro = await isPro().catch(() => null);
  if (pro === null) return isProCached();
  setPro(pro);
  return pro;
}

/** Clears a flight's meter. Used when a flight is removed. */
export function forgetFlight(flightId: string): void {
  storage.remove(openedKey(flightId));
}
