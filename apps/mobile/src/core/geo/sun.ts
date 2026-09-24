/**
 * Where the sun is, for a position and a moment.
 *
 * Used to decide whether a window will show anything at all — the single
 * largest factor in whether a flight is worth watching — and to mark sunrise
 * and sunset on board, which at cruise come minutes earlier and later than on
 * the ground because the horizon sits lower.
 *
 * NOAA's simplified solar position algorithm; accurate to a fraction of a
 * degree, which is far below what matters here.
 */

const DEG = Math.PI / 180;

export function solarElevation(lat: number, lon: number, when: Date): number {
  const d = when.getTime() / 86_400_000 + 2440587.5 - 2451545.0; // days since J2000
  const g = (357.529 + 0.98560028 * d) * DEG; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * DEG; // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));

  const gmst = (18.697374558 + 24.06570982441908 * d) % 24; // hours
  const lst = (gmst * 15 + lon) * DEG; // local sidereal time, radians
  const ha = lst - ra; // hour angle

  const φ = lat * DEG;
  const sinAlt = Math.sin(φ) * Math.sin(dec) + Math.cos(φ) * Math.cos(dec) * Math.cos(ha);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / DEG;
}

/**
 * Elevation below which the sun is set for someone at this height.
 *
 * On the ground sunset is at −0.83° (refraction plus the sun's radius). At
 * cruise the horizon itself dips by √(2h/R) — about 3.4° at 11 km — so the sun
 * stays up that much longer.
 */
export function sunsetThreshold(altitudeM: number): number {
  const dip = Math.sqrt((2 * Math.max(0, altitudeM)) / 6_371_000) / DEG;
  return -0.83 - dip;
}

/** Light enough to see the ground: sun above the horizon or within civil twilight. */
export function isDaylight(lat: number, lon: number, when: Date, altitudeM = 0): boolean {
  return solarElevation(lat, lon, when) > sunsetThreshold(altitudeM) - 3;
}

/** Compass bearing of the sun, degrees clockwise from north. */
export function solarAzimuth(lat: number, lon: number, when: Date): number {
  const d = when.getTime() / 86_400_000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * DEG;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const e = (23.439 - 0.00000036 * d) * DEG;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = (gmst * 15 + lon) * DEG - ra;
  const φ = lat * DEG;
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(φ) - Math.tan(dec) * Math.cos(φ));
  return ((az / DEG + 180) % 360 + 360) % 360;
}

/** Which window the sun is out of, for a heading. */
export function sunSide(lat: number, lon: number, when: Date, headingDeg: number): 'left' | 'right' | 'ahead' | 'behind' {
  const rel = ((solarAzimuth(lat, lon, when) - headingDeg) % 360 + 360) % 360;
  if (rel < 25 || rel > 335) return 'ahead';
  if (rel > 155 && rel < 205) return 'behind';
  return rel < 180 ? 'right' : 'left';
}
