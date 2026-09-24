import type { OfflinePackage, POI } from '@skyatlas/shared';
import { recognitionRangeKm } from './visibility';
import { t } from '../../i18n';
import { km, metres } from '../units';

/**
 * Facts about a place as seen from this flight — computed, not written.
 *
 * How far away it can be recognised, how long it stays in the window, how far
 * above a summit the aircraft passes. They are true for this route by
 * construction, and they are what a window seat actually wants to know.
 */

export function inViewSeconds(poi: POI): number | null {
  if (poi.overFrom != null && poi.overTo != null && poi.overTo > poi.overFrom) return poi.overTo - poi.overFrom;
  if (poi.visibleFrom != null && poi.visibleTo != null && poi.visibleTo > poi.visibleFrom) return poi.visibleTo - poi.visibleFrom;
  return null;
}

export function placeFacts(poi: POI, pkg: OfflinePackage): string[] {
  const out: string[] = [];
  const kind = poi.category === 'historic' || poi.category === 'park' ? 'landmark' : poi.category;
  const range = recognitionRangeKm({ k: kind as never, r: poi.rank ?? 5, pop: poi.population, el: poi.elevation, ext: poi.extentKm });

  // Time in view is already a cell on the card; the facts say what a cell cannot.
  if (poi.category === 'city') {
    const dist = km(Math.min(180, range * 1.4));
    out.push(t('facts.cityLights', { dist: dist.value, unit: t(`unit.${dist.unit}`) }));
  } else {
    const dist = km(range);
    out.push(t('facts.recognise', { dist: dist.value, unit: t(`unit.${dist.unit}`) }));
  }

  if ((poi.category === 'mountain' || poi.category === 'volcano') && poi.elevation) {
    const cruise = Math.max(...pkg.route.map((p) => p.altitude));
    const diff = cruise - poi.elevation;
    if (diff > 0) {
      const h = metres(diff);
      out.push(t('facts.aboveSummit', { h: h.value, unit: t(`unit.${h.unit}`) }));
    }
  }
  return out;
}
