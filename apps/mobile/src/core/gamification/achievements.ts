import { calculateStreaks } from './streaks';

export interface LifetimeStats {
  totalFlights: number;
  countriesFlownOver: string[];
  poisDiscovered: number;
  longestFlightHours: number;
  totalDistanceKm: number;
  nightFlights: number;
  continentsVisited: string[];
  equatorCrossings: number;
  datelineCrossings: number;
  polarFlights: number;
  sunriseFlights: number;
  sunsetFlights: number;
  oceanCrossings: number;
  mountainRangesFlown: string[];
  firstFlightDate: string | null;
  monthlyFlightsHistory: string[];
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  check: (stats: LifetimeStats) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  // --- Volume ---
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
    id: 'legend',
    name: 'Legend of the Skies',
    description: 'Complete 100 flights',
    icon: '🏆',
    check: (s) => s.totalFlights >= 100
  },

  // --- Geographic ---
  {
    id: 'globetrotter',
    name: 'Globetrotter',
    description: 'Fly over 20 different countries',
    icon: '🌏',
    check: (s) => s.countriesFlownOver.length >= 20
  },
  {
    id: 'continent_hopper',
    name: 'Continent Hopper',
    description: 'Visit all 6 inhabited continents',
    icon: '🌐',
    check: (s) => s.continentsVisited.length >= 6
  },
  {
    id: 'atlantic_crosser',
    name: 'Atlantic Crosser',
    description: 'Fly over the Atlantic Ocean',
    icon: '🌊',
    check: (s) =>
      s.countriesFlownOver.some((c) =>
        ['United States', 'Canada', 'United Kingdom', 'Ireland'].includes(c)
      ) && s.totalDistanceKm >= 5000
  },

  // --- Special crossings ---
  {
    id: 'equator_crosser',
    name: 'Equator Crosser',
    description: 'Cross the equator in flight',
    icon: '〰️',
    check: (s) => s.equatorCrossings >= 1
  },
  {
    id: 'dateline_crosser',
    name: 'Date Jumper',
    description: 'Cross the International Date Line',
    icon: '📅',
    check: (s) => s.datelineCrossings >= 1
  },
  {
    id: 'polar_explorer',
    name: 'Polar Explorer',
    description: 'Fly above 60° latitude — into polar territory',
    icon: '🧊',
    check: (s) => s.polarFlights >= 1
  },

  // --- Time & sky moments ---
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
    id: 'dawn_patrol',
    name: 'Dawn Patrol',
    description: 'Watch a sunrise from 30,000 feet',
    icon: '🌅',
    check: (s) => s.sunriseFlights >= 1
  },

  // --- Discovery ---
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Discover 50 places from the air',
    icon: '🗺️',
    check: (s) => s.poisDiscovered >= 50
  },
  {
    id: 'scholar',
    name: 'Scholar',
    description: 'Discover 100 places from the air',
    icon: '📚',
    check: (s) => s.poisDiscovered >= 100
  },

  // --- Anniversaries ---
  {
    id: 'one_year',
    name: 'One Year Up Here',
    description: 'Use SkyAtlas for 1 full year',
    icon: '🎂',
    check: (s) => {
      if (!s.firstFlightDate) return false;
      const first = new Date(s.firstFlightDate);
      const now = new Date();
      const oneYear = new Date(first);
      oneYear.setFullYear(oneYear.getFullYear() + 1);
      return now >= oneYear;
    }
  },

  // --- Special routes ---
  {
    id: 'himalayan',
    name: 'Roof of the World',
    description: 'Fly over the Himalayas',
    icon: '⛰️',
    check: (s) => s.mountainRangesFlown.includes('Himalayas')
  },
  {
    id: 'alpine_flyer',
    name: 'Alpine Flyer',
    description: 'Soar over the Alps',
    icon: '🏔️',
    check: (s) => s.mountainRangesFlown.includes('Alps')
  },

  // --- Streaks ---
  {
    id: 'monthly_flyer',
    name: 'Monthly Flyer',
    description: 'Fly in 3 consecutive months',
    icon: '📆',
    check: (s) => {
      if (!s.monthlyFlightsHistory || s.monthlyFlightsHistory.length === 0) return false;
      const streaks = calculateStreaks(s.monthlyFlightsHistory.map(d => ({ date: d + '-01' })));
      return streaks.bestStreak >= 3;
    }
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
