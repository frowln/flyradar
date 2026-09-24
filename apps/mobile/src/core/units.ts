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

function fmt(n: number): string {
  // Thin space as the thousands separator reads as one number in every locale.
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatInt(n: number): string {
  return fmt(n);
}
