import { describe, it, expect, vi, beforeEach } from 'vitest';

// MMKV is native; an in-memory map behaves identically for these three calls.
const store = new Map<string, string | boolean>();
vi.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (k: string) => (typeof store.get(k) === 'string' ? (store.get(k) as string) : undefined),
    getBoolean: (k: string) => (typeof store.get(k) === 'boolean' ? (store.get(k) as boolean) : undefined),
    set: (k: string, v: string | boolean) => void store.set(k, v),
    remove: (k: string) => store.delete(k)
  })
}));

let storeSaysPro: boolean | null = false;
vi.mock('../../src/core/monetization/revenueCat', () => ({
  MONETIZATION_ENABLED: true,
  isPro: () => Promise.resolve(storeSaysPro)
}));

const {
  FREE_PLACES_PER_FLIGHT,
  canOpenPlace,
  notePlaceOpened,
  placesLeft,
  openedPlaces,
  isProCached,
  setPro,
  refreshPro,
  forgetFlight,
  fullAccess
} = await import('../../src/core/monetization/entitlement');

const FLIGHT = 'SQ322';

describe('free tier meter', () => {
  beforeEach(() => {
    store.clear();
    storeSaysPro = false;
  });

  it('allows exactly the advertised number of places', () => {
    for (let i = 0; i < FREE_PLACES_PER_FLIGHT; i++) {
      expect(canOpenPlace(FLIGHT, `poi-${i}`), `place ${i + 1}`).toBe(true);
      notePlaceOpened(FLIGHT, `poi-${i}`);
    }
    expect(canOpenPlace(FLIGHT, 'poi-one-too-many')).toBe(false);
  });

  /**
   * The case that turns a limit into a bug: walking back to a card already read
   * must not cost another slot, or the fifth place becomes unopenable.
   */
  it('lets an already-opened place be reopened at the limit', () => {
    for (let i = 0; i < FREE_PLACES_PER_FLIGHT; i++) notePlaceOpened(FLIGHT, `poi-${i}`);
    expect(canOpenPlace(FLIGHT, 'poi-0')).toBe(true);
    expect(canOpenPlace(FLIGHT, 'poi-4')).toBe(true);
    expect(canOpenPlace(FLIGHT, 'poi-new')).toBe(false);
  });

  it('does not spend a slot twice on the same place', () => {
    notePlaceOpened(FLIGHT, 'poi-a');
    notePlaceOpened(FLIGHT, 'poi-a');
    notePlaceOpened(FLIGHT, 'poi-a');
    expect(openedPlaces(FLIGHT)).toEqual(['poi-a']);
    expect(placesLeft(FLIGHT)).toBe(FREE_PLACES_PER_FLIGHT - 1);
  });

  it('meters each flight separately', () => {
    for (let i = 0; i < FREE_PLACES_PER_FLIGHT; i++) notePlaceOpened(FLIGHT, `poi-${i}`);
    expect(canOpenPlace(FLIGHT, 'poi-new')).toBe(false);
    expect(canOpenPlace('BA15', 'poi-new')).toBe(true);
    expect(placesLeft('BA15')).toBe(FREE_PLACES_PER_FLIGHT);
  });

  it('counts down and stops at zero', () => {
    expect(placesLeft(FLIGHT)).toBe(FREE_PLACES_PER_FLIGHT);
    notePlaceOpened(FLIGHT, 'poi-a');
    expect(placesLeft(FLIGHT)).toBe(FREE_PLACES_PER_FLIGHT - 1);
    for (let i = 0; i < 20; i++) notePlaceOpened(FLIGHT, `extra-${i}`);
    expect(placesLeft(FLIGHT)).toBe(0);
  });

  it('survives a corrupted record rather than crashing the card', () => {
    store.set(`opened:${FLIGHT}`, '{not json');
    expect(openedPlaces(FLIGHT)).toEqual([]);
    expect(canOpenPlace(FLIGHT, 'poi-a')).toBe(true);
  });

  it('clears a flight on request', () => {
    for (let i = 0; i < FREE_PLACES_PER_FLIGHT; i++) notePlaceOpened(FLIGHT, `poi-${i}`);
    forgetFlight(FLIGHT);
    expect(openedPlaces(FLIGHT)).toEqual([]);
    expect(canOpenPlace(FLIGHT, 'poi-new')).toBe(true);
  });
});

describe('pro entitlement', () => {
  beforeEach(() => {
    store.clear();
    storeSaysPro = false;
  });

  it('is off until something says otherwise', () => {
    expect(isProCached()).toBe(false);
  });

  it('lifts the limit entirely', () => {
    for (let i = 0; i < 50; i++) notePlaceOpened(FLIGHT, `poi-${i}`);
    expect(canOpenPlace(FLIGHT, 'poi-new')).toBe(false);
    setPro(true);
    expect(canOpenPlace(FLIGHT, 'poi-new')).toBe(true);
    expect(placesLeft(FLIGHT)).toBe(Infinity);
  });

  it('takes the entitlement from the store on refresh', async () => {
    storeSaysPro = true;
    await expect(refreshPro()).resolves.toBe(true);
    expect(isProCached()).toBe(true);
  });

  /** At cruise the store cannot be reached; that is not a cancellation. */
  it('keeps Pro when the store cannot be asked', async () => {
    setPro(true);
    storeSaysPro = null;
    await expect(refreshPro()).resolves.toBe(true);
    expect(isProCached()).toBe(true);
  });

  it('opens everything on the first flight', () => {
    expect(fullAccess(true)).toBe(true);
    expect(fullAccess(false)).toBe(false);
  });

  /** A lapsed or refunded subscription has to close the gate again. */
  it('revokes access when the store stops confirming it', async () => {
    setPro(true);
    storeSaysPro = false;
    await refreshPro();
    expect(isProCached()).toBe(false);
  });
});
