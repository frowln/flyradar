export interface FlightLog {
  date: string;  // ISO date YYYY-MM-DD
}

export interface StreakState {
  currentStreak: number;
  bestStreak: number;
  freezesAvailable: number;
  usedFreezesThisMonth: number;
}

export function calculateStreaksWithFreezes(
  flights: FlightLog[],
  freezes: number,
  usedFreezes: number
): StreakState {
  const base = calculateStreaks(flights);
  return {
    currentStreak: base.currentStreak,
    bestStreak: base.bestStreak,
    freezesAvailable: Math.max(0, freezes - usedFreezes),
    usedFreezesThisMonth: usedFreezes
  };
}

export function calculateStreaks(flights: FlightLog[]): {
  currentStreak: number;   // months
  bestStreak: number;
  totalMonthsFlown: number;
} {
  if (flights.length === 0) return { currentStreak: 0, bestStreak: 0, totalMonthsFlown: 0 };
  // Group flights by month
  const months = new Set(flights.map((f) => f.date.slice(0, 7)));
  const monthsArr = Array.from(months).sort();
  // Compute longest consecutive run
  let bestStreak = 1, current = 1;
  for (let i = 1; i < monthsArr.length; i++) {
    const prev = monthsArr[i - 1].split('-').map(Number);
    const curr = monthsArr[i].split('-').map(Number);
    const monthsApart = (curr[0] - prev[0]) * 12 + (curr[1] - prev[1]);
    if (monthsApart === 1) {
      current++;
      if (current > bestStreak) bestStreak = current;
    } else {
      current = 1;
    }
  }
  // Current streak: count back from most recent month
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let currentStreak = 0;
  if (months.has(thisMonthKey)) {
    currentStreak = 1;
    const cursor = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    while (months.has(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)) {
      currentStreak++;
      cursor.setMonth(cursor.getMonth() - 1);
    }
  }
  return { currentStreak, bestStreak, totalMonthsFlown: months.size };
}
