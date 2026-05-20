export const RANKS = [
  { id: 'newcomer', name: 'Newcomer', minLevel: 1, icon: '🌱', color: '#8B95B0' },
  { id: 'traveler', name: 'Traveler', minLevel: 10, icon: '✈️', color: '#3D8BFD' },
  { id: 'explorer', name: 'Explorer', minLevel: 25, icon: '🗺️', color: '#FFC857' },
  { id: 'pioneer', name: 'Pioneer', minLevel: 50, icon: '🚀', color: '#FF6B6B' },
  { id: 'legend', name: 'Legend of the Skies', minLevel: 80, icon: '🏆', color: '#9B51E0' }
];

export interface XPSources {
  flightsCompleted: number;     // 100 XP each
  poisDiscovered: number;       // 10 XP each
  achievementsEarned: number;   // 50 XP each
  countriesVisited: number;     // 25 XP each
  distanceKm: number;           // 1 XP per 100 km
}

export function calculateXP(sources: XPSources): number {
  return (
    sources.flightsCompleted * 100 +
    sources.poisDiscovered * 10 +
    sources.achievementsEarned * 50 +
    sources.countriesVisited * 25 +
    Math.floor(sources.distanceKm / 100)
  );
}

// Level uses progressive XP curve: lvl N needs N*200 XP (so lvl 10 needs 2000, lvl 100 needs 20000)
export function xpForLevel(level: number): number {
  return level * 200;
}

export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i <= level; i++) total += xpForLevel(i);
  return total;
}

export function levelFromXP(xp: number): { level: number; currentLevelXP: number; nextLevelXP: number; progress: number } {
  let level = 1;
  let accumulated = 0;
  while (accumulated + xpForLevel(level) <= xp && level < 100) {
    accumulated += xpForLevel(level);
    level++;
  }
  const currentLevelXP = xp - accumulated;
  const nextLevelXP = xpForLevel(level);
  return {
    level,
    currentLevelXP,
    nextLevelXP,
    progress: Math.min(currentLevelXP / nextLevelXP, 1)
  };
}

export function rankFromLevel(level: number) {
  return [...RANKS].reverse().find((r) => level >= r.minLevel) ?? RANKS[0];
}
