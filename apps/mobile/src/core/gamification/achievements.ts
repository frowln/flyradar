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
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  check: (stats: LifetimeStats) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  // --- Existing 11 ---
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
    check: (s) =>
      s.countriesFlownOver.some((c) =>
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
  },

  // --- Volume milestones ---
  {
    id: 'quarter_century',
    name: 'Quarter Century',
    description: 'Complete 25 flights',
    icon: '🎯',
    check: (s) => s.totalFlights >= 25
  },
  {
    id: 'half_century',
    name: 'Half Century',
    description: 'Complete 50 flights',
    icon: '🥈',
    check: (s) => s.totalFlights >= 50
  },
  {
    id: 'road_warrior',
    name: 'Road Warrior',
    description: 'Log 5,000 km in the air',
    icon: '🛣️',
    check: (s) => s.totalDistanceKm >= 5_000
  },
  {
    id: 'circumnavigator',
    name: 'Circumnavigator',
    description: 'Log 10,000 km — enough to circle a quarter of the globe',
    icon: '🌀',
    check: (s) => s.totalDistanceKm >= 10_000
  },
  {
    id: 'around_the_world',
    name: 'Around the World',
    description: 'Log 100,000 km — more than twice around Earth',
    icon: '🌕',
    check: (s) => s.totalDistanceKm >= 100_000
  },

  // --- Continents ---
  {
    id: 'european',
    name: 'European',
    description: 'Fly over Europe',
    icon: '🏰',
    check: (s) => s.continentsVisited.includes('Europe')
  },
  {
    id: 'asian',
    name: 'Asian Odyssey',
    description: 'Fly over Asia',
    icon: '🏯',
    check: (s) => s.continentsVisited.includes('Asia')
  },
  {
    id: 'north_american',
    name: 'New World Flyer',
    description: 'Fly over North America',
    icon: '🗽',
    check: (s) => s.continentsVisited.includes('North America')
  },
  {
    id: 'south_american',
    name: 'South American',
    description: 'Fly over South America',
    icon: '🌿',
    check: (s) => s.continentsVisited.includes('South America')
  },
  {
    id: 'african',
    name: 'African Safari',
    description: 'Fly over Africa',
    icon: '🦁',
    check: (s) => s.continentsVisited.includes('Africa')
  },
  {
    id: 'oceanian',
    name: 'Down Under',
    description: 'Fly over Oceania',
    icon: '🦘',
    check: (s) => s.continentsVisited.includes('Oceania')
  },
  {
    id: 'antarctic',
    name: 'Ice Continent',
    description: 'Fly over Antarctica',
    icon: '🐧',
    check: (s) => s.continentsVisited.includes('Antarctica')
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
    id: 'dawn_patrol',
    name: 'Dawn Patrol',
    description: 'Watch a sunrise from 30,000 feet',
    icon: '🌅',
    check: (s) => s.sunriseFlights >= 1
  },
  {
    id: 'golden_hour',
    name: 'Golden Hour',
    description: 'Catch a sunset while airborne',
    icon: '🌄',
    check: (s) => s.sunsetFlights >= 1
  },
  {
    id: 'new_year_flyer',
    name: 'New Year in the Sky',
    description: 'Be in the air when the new year begins',
    icon: '🎆',
    check: (s) => {
      if (!s.firstFlightDate) return false;
      // Proxy: very long-haul flyer who has seen many sunrises and sunsets
      return s.sunriseFlights >= 5 && s.sunsetFlights >= 5 && s.totalFlights >= 20;
    }
  },

  // --- Mountain ranges ---
  {
    id: 'alpine_flyer',
    name: 'Alpine Flyer',
    description: 'Soar over the Alps',
    icon: '🏔️',
    check: (s) => s.mountainRangesFlown.includes('Alps')
  },
  {
    id: 'himalayan',
    name: 'Roof of the World',
    description: 'Fly over the Himalayas',
    icon: '⛰️',
    check: (s) => s.mountainRangesFlown.includes('Himalayas')
  },
  {
    id: 'andean',
    name: 'Andean Condor',
    description: 'Cross the Andes mountain range',
    icon: '🦅',
    check: (s) => s.mountainRangesFlown.includes('Andes')
  },
  {
    id: 'rocky_rider',
    name: 'Rocky Rider',
    description: 'Fly over the Rocky Mountains',
    icon: '🪨',
    check: (s) => s.mountainRangesFlown.includes('Rockies')
  },
  {
    id: 'caucasus_crosser',
    name: 'Caucasus Crosser',
    description: 'Fly over the Caucasus range',
    icon: '🗻',
    check: (s) => s.mountainRangesFlown.includes('Caucasus')
  },

  // --- Oceans ---
  {
    id: 'pacific_crosser',
    name: 'Pacific Crosser',
    description: 'Cross the vast Pacific Ocean',
    icon: '🐋',
    check: (s) => s.oceanCrossings >= 1 && s.datelineCrossings >= 1
  },
  {
    id: 'indian_ocean',
    name: 'Indian Ocean Drifter',
    description: 'Fly over the Indian Ocean',
    icon: '🐬',
    check: (s) =>
      s.continentsVisited.includes('Asia') &&
      s.continentsVisited.includes('Africa') &&
      s.totalDistanceKm >= 8_000
  },
  {
    id: 'arctic_explorer',
    name: 'Arctic Explorer',
    description: 'Fly over the Arctic Ocean',
    icon: '🌨️',
    check: (s) => s.polarFlights >= 3
  },

  // --- Landmarks ---
  {
    id: 'desert_fox',
    name: 'Desert Fox',
    description: 'Fly over the Sahara Desert',
    icon: '🏜️',
    check: (s) =>
      s.continentsVisited.includes('Africa') &&
      s.countriesFlownOver.some((c) =>
        ['Algeria', 'Libya', 'Egypt', 'Mali', 'Niger', 'Chad', 'Sudan', 'Morocco', 'Tunisia'].includes(c)
      )
  },
  {
    id: 'amazon_spirit',
    name: 'Amazon Spirit',
    description: 'Fly over the Amazon rainforest',
    icon: '🌳',
    check: (s) =>
      s.continentsVisited.includes('South America') &&
      s.countriesFlownOver.some((c) =>
        ['Brazil', 'Peru', 'Colombia', 'Venezuela', 'Ecuador', 'Bolivia'].includes(c)
      )
  },
  {
    id: 'grand_canyon',
    name: 'Grand Canyon Gazer',
    description: 'Spot the Grand Canyon from above',
    icon: '🏞️',
    check: (s) =>
      s.countriesFlownOver.includes('United States') &&
      s.mountainRangesFlown.includes('Rockies')
  },
  {
    id: 'reef_watcher',
    name: 'Reef Watcher',
    description: 'Fly over the Great Barrier Reef',
    icon: '🐠',
    check: (s) => s.countriesFlownOver.includes('Australia')
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
  {
    id: 'five_years',
    name: 'Five-Year Aviator',
    description: 'Use SkyAtlas for 5 years',
    icon: '🏅',
    check: (s) => {
      if (!s.firstFlightDate) return false;
      const first = new Date(s.firstFlightDate);
      const now = new Date();
      const fiveYears = new Date(first);
      fiveYears.setFullYear(fiveYears.getFullYear() + 5);
      return now >= fiveYears;
    }
  },

  // --- Streaks ---
  {
    id: 'monthly_flyer',
    name: 'Monthly Flyer',
    description: 'Take 3 or more flights in a single month',
    icon: '📆',
    check: (s) => s.totalFlights >= 3
  },
  {
    id: 'annual_aviator',
    name: 'Annual Aviator',
    description: 'Log 10 or more flights in a year',
    icon: '🗓️',
    check: (s) => s.totalFlights >= 10
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
