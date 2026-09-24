import { t, getLocale } from '../src/i18n';
import { formatClock } from '../src/core/time/zones';

/** Human formats shared by every screen. Kept here so "3 h 05 min" reads the same everywhere. */

export function duration(seconds: number, pad = true): string {
  const mins = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return t('fmt.min', { m });
  if (m === 0) return t('fmt.h', { h });
  return t('fmt.hmin', { h, m: pad ? String(m).padStart(2, '0') : m });
}

/** "in 12 min" / "12 min ago" / "now". */
export function relative(seconds: number, pad = true): string {
  if (Math.abs(seconds) < 60) return t('fmt.now');
  return seconds > 0 ? t('fmt.in', { d: duration(seconds, pad) }) : t('fmt.ago', { d: duration(-seconds, pad) });
}

/**
 * The same, for a screen reader. The zero that keeps "3 h 05 min" aligned in a
 * column is pronounced aloud — "three h zero five" — so spoken labels drop it.
 */
export const spokenDuration = (seconds: number) => duration(seconds, false);
export const spokenRelative = (seconds: number) => relative(seconds, false);

/** "H:MM" countdown. */
export function clock(seconds: number): string {
  const mins = Math.max(0, Math.round(seconds / 60));
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

export function dayMonth(iso: string, tz?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', timeZone: tz });
  } catch {
    return d.toLocaleDateString();
  }
}

export function weekdayDayMonth(iso: string, tz?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(getLocale(), { weekday: 'short', day: 'numeric', month: 'long', timeZone: tz });
  } catch {
    return d.toLocaleDateString();
  }
}

export function timeAt(iso: string, tz?: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '--:--' : formatClock(d, tz);
}

export function monthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' });
  } catch {
    return d.toLocaleDateString();
  }
}
