export interface LifetimeStats {
  totalFlights: number;
  countriesFlownOver: string[];
  poisDiscovered: number;
  longestFlightHours: number;
  totalDistanceKm: number;
  nightFlights: number;
  continentsVisited: string[];
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  check: (stats: LifetimeStats) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_flight',
    name: 'First Flight',
    description: 'Track your first flight with SkyAtlas',
    icon: '🌍',
    check: (s) => s.totalFlights >= 1
  },
  {
    id: 'air_wolf',
    name: 'Air Wolf',
    description: 'Complete 10 flights',
    icon: '✈️',
    check: (s) => s.totalFlights >= 10
  },
  {
    id: 'globetrotter',
    name: 'Globetrotter',
    description: 'Fly over 20 different countries',
    icon: '🌏',
    check: (s) => s.countriesFlownOver.length >= 20
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Discover 50 places from the air',
    icon: '🗺️',
    check: (s) => s.poisDiscovered >= 50
  },
  {
    id: 'marathoner',
    name: 'Marathoner',
    description: 'Take a flight longer than 12 hours',
    icon: '⏰',
    check: (s) => s.longestFlightHours >= 12
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Complete 5 night flights',
    icon: '🌙',
    check: (s) => s.nightFlights >= 5
  },
  {
    id: 'atlantic_crosser',
    name: 'Atlantic Crosser',
    description: 'Fly over the Atlantic Ocean',
    icon: '🌊',
    check: (s) => s.countriesFlownOver.some((c) =>
      ['United States', 'Canada', 'United Kingdom', 'Ireland'].includes(c)
    ) && s.totalDistanceKm >= 5000
  },
  {
    id: 'continent_hopper',
    name: 'Continent Hopper',
    description: 'Visit all 6 inhabited continents',
    icon: '🌐',
    check: (s) => s.continentsVisited.length >= 6
  },
  {
    id: 'legend',
    name: 'Legend of the Skies',
    description: 'Complete 100 flights',
    icon: '🏆',
    check: (s) => s.totalFlights >= 100
  },
  {
    id: 'scholar',
    name: 'Scholar',
    description: 'Discover 100 places from the air',
    icon: '📚',
    check: (s) => s.poisDiscovered >= 100
  },
  {
    id: 'frequent_flyer',
    name: 'Frequent Flyer',
    description: 'Log 50,000 km in the air',
    icon: '🚀',
    check: (s) => s.totalDistanceKm >= 50_000
  }
];

export function evaluateAchievements(
  stats: LifetimeStats,
  alreadyEarned: string[]
): string[] {
  return ACHIEVEMENTS
    .filter((a) => a.check(stats) && !alreadyEarned.includes(a.id))
    .map((a) => a.id);
}
