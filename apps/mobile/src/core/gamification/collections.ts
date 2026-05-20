import { createMMKV } from 'react-native-mmkv';
import type { LifetimeStats } from './achievements';

const storage = createMMKV({ id: 'skyatlas-collections' });

const KEYS = {
  LIFETIME_STATS: 'lifetime_stats',
  EARNED_ACHIEVEMENTS: 'earned_achievements',
  COUNTRIES: 'countries_visited',
  KIDS_MODE: 'kids_mode',
  UNITS: 'units',
  LANGUAGE: 'language',
  INFLIGHT_TUTORIAL_SEEN: 'inflight_tutorial_seen'
} as const;

const DEFAULT_STATS: LifetimeStats = {
  totalFlights: 0,
  countriesFlownOver: [],
  poisDiscovered: 0,
  longestFlightHours: 0,
  totalDistanceKm: 0,
  nightFlights: 0,
  continentsVisited: [],
  equatorCrossings: 0,
  datelineCrossings: 0,
  polarFlights: 0,
  sunriseFlights: 0,
  sunsetFlights: 0,
  oceanCrossings: 0,
  mountainRangesFlown: [],
  firstFlightDate: null
};

export const collectionsStore = {
  getStats(): LifetimeStats {
    const raw = storage.getString(KEYS.LIFETIME_STATS);
    return raw ? JSON.parse(raw) : { ...DEFAULT_STATS };
  },

  updateStats(updates: Partial<LifetimeStats>): LifetimeStats {
    const current = this.getStats();
    const next = { ...current, ...updates };
    storage.set(KEYS.LIFETIME_STATS, JSON.stringify(next));
    return next;
  },

  addCountry(country: string): void {
    const stats = this.getStats();
    if (!stats.countriesFlownOver.includes(country)) {
      this.updateStats({
        countriesFlownOver: [...stats.countriesFlownOver, country]
      });
    }
  },

  getEarnedAchievements(): string[] {
    const raw = storage.getString(KEYS.EARNED_ACHIEVEMENTS);
    return raw ? JSON.parse(raw) : [];
  },

  addAchievements(ids: string[]): void {
    const current = this.getEarnedAchievements();
    const merged = Array.from(new Set([...current, ...ids]));
    storage.set(KEYS.EARNED_ACHIEVEMENTS, JSON.stringify(merged));
  },

  recordFlight(opts: {
    distanceKm: number;
    durationHours: number;
    poisSeen: number;
    isNight: boolean;
  }): void {
    const stats = this.getStats();
    this.updateStats({
      totalFlights: stats.totalFlights + 1,
      totalDistanceKm: stats.totalDistanceKm + opts.distanceKm,
      poisDiscovered: stats.poisDiscovered + opts.poisSeen,
      longestFlightHours: Math.max(stats.longestFlightHours, opts.durationHours),
      nightFlights: opts.isNight ? stats.nightFlights + 1 : stats.nightFlights
    });
  },

  isKidsMode(): boolean {
    return storage.getBoolean(KEYS.KIDS_MODE) ?? false;
  },

  setKidsMode(enabled: boolean): void {
    storage.set(KEYS.KIDS_MODE, enabled);
  },

  getUnits(): 'km' | 'miles' {
    const val = storage.getString(KEYS.UNITS);
    return val === 'miles' ? 'miles' : 'km';
  },

  setUnits(u: 'km' | 'miles'): void {
    storage.set(KEYS.UNITS, u);
  },

  getLanguage(): string | undefined {
    return storage.getString(KEYS.LANGUAGE);
  },

  setLanguage(locale: string): void {
    storage.set(KEYS.LANGUAGE, locale);
  },

  hasSeenInflightTutorial(): boolean {
    return storage.getBoolean(KEYS.INFLIGHT_TUTORIAL_SEEN) ?? false;
  },

  markInflightTutorialSeen(): void {
    storage.set(KEYS.INFLIGHT_TUTORIAL_SEEN, true);
  },

  reset(): void {
    storage.set(KEYS.LIFETIME_STATS, JSON.stringify({ ...DEFAULT_STATS }));
    storage.set(KEYS.EARNED_ACHIEVEMENTS, JSON.stringify([]));
  }
};
