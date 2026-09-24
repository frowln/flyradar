import { createMMKV } from 'react-native-mmkv';

/**
 * Preferences that change behaviour. Nothing lives here that does not.
 *
 * The old settings screen had switches for a theme, a kids mode and sound
 * effects that no screen ever read. Every key below is read somewhere, and the
 * test for adding one is "what does the app do differently".
 *
 * The store id is kept from the previous version so language and device
 * identity survive the update.
 */

const storage = createMMKV({ id: 'skyatlas-collections' });

export type Units = 'metric' | 'imperial';
export type AlertLevel = 'off' | 'few' | 'more';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const settings = {
  getLanguage(): string | undefined {
    return storage.getString('language');
  },
  setLanguage(locale: string): void {
    storage.set('language', locale);
    notify();
  },

  getUnits(): Units {
    return storage.getString('units.v2') === 'imperial' ? 'imperial' : 'metric';
  },
  setUnits(u: Units): void {
    storage.set('units.v2', u);
    notify();
  },

  /** How many in-flight alerts: none, the best three, or up to six. */
  getAlerts(): AlertLevel {
    const v = storage.getString('alerts');
    return v === 'off' || v === 'more' ? v : 'few';
  },
  setAlerts(v: AlertLevel): void {
    storage.set('alerts', v);
    notify();
  },

  /** Refine position with the phone's GPS while the flight screen is open. */
  getUseGps(): boolean {
    return storage.getBoolean('use_gps') ?? true;
  },
  setUseGps(v: boolean): void {
    storage.set('use_gps', v);
    notify();
  },

  /** Read places aloud as they come abeam (system voice, works offline). */
  getNarration(): boolean {
    return storage.getBoolean('narration') ?? false;
  },
  setNarration(v: boolean): void {
    storage.set('narration', v);
    notify();
  },

  /** Offer "what is about to appear?" guesses in flight. */
  getGuessing(): boolean {
    return storage.getBoolean('guessing') ?? true;
  },
  setGuessing(v: boolean): void {
    storage.set('guessing', v);
    notify();
  },

  getDeviceToken(): string | undefined {
    return storage.getString('device_token');
  },
  setDeviceToken(token: string): void {
    storage.set('device_token', token);
  },

  getPendingDiscoveries(): string {
    return storage.getString('pending_discoveries') ?? '[]';
  },
  setPendingDiscoveries(json: string): void {
    storage.set('pending_discoveries', json);
  },

  markInstalled(): void {
    if (!storage.getString('install_date')) storage.set('install_date', new Date().toISOString());
  },
  getInstallDate(): Date | null {
    const raw = storage.getString('install_date');
    const d = raw ? new Date(raw) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};
