/**
 * IATA Bar Coded Boarding Pass (Resolution 792), mandatory fields.
 *
 * The barcode carries everything a flight needs — both airports, carrier,
 * flight number, date and seat — which makes a scan the fastest way to add a
 * flight and the only one that knows which window the passenger will sit at.
 * The passenger's name is in there too; it is read past and never kept.
 *
 *   0      format code 'M'
 *   1      number of legs
 *   2–21   passenger name
 *   22     electronic ticket indicator
 *   23–29  booking reference
 *   30–32  from airport
 *   33–35  to airport
 *   36–38  operating carrier
 *   39–43  flight number
 *   44–46  date of flight, day of year
 *   47     compartment
 *   48–51  seat
 */

export interface BoardingPass {
  from: string;
  to: string;
  carrier: string;
  flightNumber: string;
  dayOfYear: number;
  /** Resolved calendar date, YYYY-MM-DD. */
  date: string;
  /** e.g. "23A"; undefined for passes issued before seat assignment. */
  seat?: string;
}

/**
 * The year a day-of-year belongs to. Passes carry no year, so pick the one
 * that puts the flight nearest to now, preferring the future: a pass scanned
 * in late December for day 5 is for January.
 */
export function dateFromDayOfYear(day: number, today: Date = new Date()): string | null {
  if (!Number.isInteger(day) || day < 1 || day > 366) return null;
  const y = today.getUTCFullYear();
  const todayUtc = Date.UTC(y, today.getUTCMonth(), today.getUTCDate());
  const candidates = [y - 1, y, y + 1]
    .map((year) => ({ year, ms: Date.UTC(year, 0, 1) + (day - 1) * 86_400_000 }))
    // Day 366 only exists in leap years; elsewhere it spills into January.
    .filter(({ year, ms }) => new Date(ms).getUTCFullYear() === year)
    .map(({ ms }) => ms);
  let best: number | null = null;
  let bestCost = Infinity;
  for (const ms of candidates) {
    const diffDays = (ms - todayUtc) / 86_400_000;
    // Past dates cost three times as much: flights are added before they happen.
    const cost = diffDays >= -2 ? Math.abs(diffDays) : Math.abs(diffDays) * 3;
    if (cost < bestCost) {
      bestCost = cost;
      best = ms;
    }
  }
  return best === null ? null : new Date(best).toISOString().slice(0, 10);
}

export function parseBCBP(raw: string, today: Date = new Date()): BoardingPass | null {
  const s = raw.replace(/\r?\n/g, '');
  if (s.length < 47 || s[0] !== 'M') return null;
  const from = s.slice(30, 33).trim().toUpperCase();
  const to = s.slice(33, 36).trim().toUpperCase();
  const carrier = s.slice(36, 39).trim().toUpperCase();
  const number = s.slice(39, 44).trim().replace(/^0+(?=\d)/, '');
  const dayOfYear = Number(s.slice(44, 47));
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || !/^[A-Z0-9]{2,3}$/.test(carrier)) return null;
  if (!/^\d{1,4}[A-Z]?$/.test(number)) return null;
  const date = dateFromDayOfYear(dayOfYear, today);
  if (!date) return null;
  const seatRaw = s.slice(48, 52).trim().replace(/^0+(?=\d)/, '');
  const seat = /^\d{1,3}[A-Z]$/.test(seatRaw) ? seatRaw : undefined;
  return { from, to, carrier, flightNumber: `${carrier}${number}`, dayOfYear, date, seat };
}

/**
 * Which window a seat letter sits at.
 *
 * A is a left window on every airliner. K (and L on a few layouts) is the
 * right window on wide-bodies; F is the right window on the narrow-bodies that
 * fly most routes, but a middle seat on many wide-bodies — so it is marked as
 * a guess and the passenger is asked to confirm.
 */
export function seatSide(seat: string | undefined): { side: 'left' | 'right' | 'middle' | 'unknown'; sure: boolean } {
  const letter = seat?.match(/[A-Z]$/)?.[0];
  if (!letter) return { side: 'unknown', sure: false };
  if (letter === 'A') return { side: 'left', sure: true };
  if (letter === 'K' || letter === 'L') return { side: 'right', sure: true };
  if (letter === 'F') return { side: 'right', sure: false };
  return { side: 'middle', sure: false };
}
