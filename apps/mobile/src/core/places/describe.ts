import type { POI } from '@skyatlas/shared';
import { t } from '../../i18n';
import { formatInt, km, metres } from '../units';

/**
 * A line about a place composed from data alone, for places with no article.
 *
 * It says only what the dataset knows — kind, height, population — so it can
 * never be wrong in the way an invented sentence can. The country is left out:
 * the card already shows it under the title.
 */
export function describePlace(poi: POI, _locale: string): string {
  const kind = t(`category.${poi.category}`);
  const parts: string[] = [];
  if (poi.category === 'city' && poi.population) {
    parts.push(t('describe.city', { pop: formatInt(poi.population) }));
  } else if ((poi.category === 'mountain' || poi.category === 'volcano') && poi.elevation) {
    const m = metres(poi.elevation);
    parts.push(t('describe.peak', { kind, height: m.value, unit: t(`unit.${m.unit}`) }));
  } else if (poi.extentKm) {
    const k = km(poi.extentKm * 2);
    parts.push(t('describe.area', { kind, size: k.value, unit: t(`unit.${k.unit}`) }));
  } else {
    parts.push(kind.charAt(0).toUpperCase() + kind.slice(1));
  }
  const text = parts.join(' ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
