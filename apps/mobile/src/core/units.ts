import { settings } from './settings';

/** Distances and heights in the reader's units. Metric by default; feet and miles on request. */

export function km(value: number): { value: string; unit: 'km' | 'mi' } {
  if (settings.getUnits() === 'imperial') return { value: fmt(value * 0.621371), unit: 'mi' };
  return { value: fmt(value), unit: 'km' };
}

export function metres(value: number): { value: string; unit: 'm' | 'ft' } {
  if (settings.getUnits() === 'imperial') return { value: fmt(value * 3.28084), unit: 'ft' };
  return { value: fmt(value), unit: 'm' };
}

export function speed(kmh: number): { value: string; unit: 'kmh' | 'mph' } {
  if (settings.getUnits() === 'imperial') return { value: fmt(kmh * 0.621371), unit: 'mph' };
  return { value: fmt(kmh), unit: 'kmh' };
}

/** Degrees with a real minus sign: "−56 °C" reads as one value; a hyphen does not. */
export function temperature(c: number): { value: string; unit: 'c' | 'f' } {
  const v = Math.round(settings.getUnits() === 'imperial' ? c * 1.8 + 32 : c);
  return { value: v < 0 ? `\u2212${-v}` : String(v), unit: settings.getUnits() === 'imperial' ? 'f' : 'c' };
}

function fmt(n: number): string {
  // Thin space as the thousands separator reads as one number in every locale.
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatInt(n: number): string {
  return fmt(n);
}
