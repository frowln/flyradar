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
  INFLIGHT_TUTORIAL_SEEN: 'inflight_tutorial_seen',
  THEME: 'theme',
  CATEGORY_INTERESTS: 'category_interests',
  NARRATOR: 'narrator',
  SOUND_ENABLED: 'sound_enabled',
  INSTALL_DATE: 'install_date',
  LEADERBOARD_EMAIL: 'leaderboard_email',
  DEVICE_TOKEN: 'device_token',
  DAILY_FACTS_ENABLED: 'daily_facts_enabled',
  FREEZE_TOKENS: 'freeze_tokens',
  FREEZE_USED_THIS_MONTH: 'freeze_used_this_month',
  PENDING_DISCOVERIES: 'pending_discoveries'
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
  firstFlightDate: null,
  monthlyFlightsHistory: []
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

  getTheme(): 'dark' | 'light' {
    const val = storage.getString(KEYS.THEME);
    return val === 'light' ? 'light' : 'dark';
  },

  setTheme(theme: 'dark' | 'light'): void {
    storage.set(KEYS.THEME, theme);
  },

  getCategoryInterests(): Record<string, number> {
    const raw = storage.getString(KEYS.CATEGORY_INTERESTS);
    return raw ? JSON.parse(raw) : {};
  },

  setCategoryInterests(map: Record<string, number>): void {
    storage.set(KEYS.CATEGORY_INTERESTS, JSON.stringify(map));
  },

  getNarrator(): 'default' | 'documentary' | 'casual' {
    const val = storage.getString(KEYS.NARRATOR);
    if (val === 'documentary' || val === 'casual') return val;
    return 'default';
  },

  setNarrator(style: 'default' | 'documentary' | 'casual'): void {
    storage.set(KEYS.NARRATOR, style);
  },

  getSoundEnabled(): boolean {
    return storage.getBoolean(KEYS.SOUND_ENABLED) ?? false;
  },

  setSoundEnabled(enabled: boolean): void {
    storage.set(KEYS.SOUND_ENABLED, enabled);
  },

  markInstalled(): void {
    if (!storage.getString(KEYS.INSTALL_DATE)) {
      storage.set(KEYS.INSTALL_DATE, new Date().toISOString());
    }
  },

  getInstallDate(): Date | null {
    const raw = storage.getString(KEYS.INSTALL_DATE);
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  },

  setLeaderboardEmail(email: string): void {
    storage.set(KEYS.LEADERBOARD_EMAIL, email);
  },

  getLeaderboardEmail(): string | undefined {
    return storage.getString(KEYS.LEADERBOARD_EMAIL);
  },

  getDeviceToken(): string | undefined {
    return storage.getString(KEYS.DEVICE_TOKEN);
  },

  setDeviceToken(token: string): void {
    storage.set(KEYS.DEVICE_TOKEN, token);
  },

  getDailyFactsEnabled(): boolean {
    return storage.getBoolean(KEYS.DAILY_FACTS_ENABLED) ?? true;
  },

  setDailyFactsEnabled(enabled: boolean): void {
    storage.set(KEYS.DAILY_FACTS_ENABLED, enabled);
  },

  /**
   * Discoveries made with no signal, kept until they can be sent.
   *
   * Most discoveries happen at cruise, offline. Dropping them would make the
   * global counters a sample of who had Wi-Fi rather than a count of who flew.
   */
  getPendingDiscoveries(): string {
    return storage.getString(KEYS.PENDING_DISCOVERIES) ?? '[]';
  },

  setPendingDiscoveries(json: string): void {
    storage.set(KEYS.PENDING_DISCOVERIES, json);
  },

  getFreezeTokens(): number {
    return storage.getNumber(KEYS.FREEZE_TOKENS) ?? 0;
  },

  setFreezeTokens(n: number): void {
    storage.set(KEYS.FREEZE_TOKENS, n);
  },

  getFreezeUsedThisMonth(): number {
    return storage.getNumber(KEYS.FREEZE_USED_THIS_MONTH) ?? 0;
  },

  setFreezeUsedThisMonth(n: number): void {
    storage.set(KEYS.FREEZE_USED_THIS_MONTH, n);
  },

  reset(): void {
    storage.set(KEYS.LIFETIME_STATS, JSON.stringify({ ...DEFAULT_STATS }));
    storage.set(KEYS.EARNED_ACHIEVEMENTS, JSON.stringify([]));
  }
};
