import { Building2, Mountain, Waves, Flame, Palmtree, Landmark, Trees, MapPin, type LucideIcon } from 'lucide-react-native';
import type { POICategory } from '@skyatlas/shared';

const ICONS: Record<POICategory, LucideIcon> = {
  city: Building2,
  mountain: Mountain,
  lake: Waves,
  river: Waves,
  sea: Waves,
  volcano: Flame,
  island: Palmtree,
  historic: Landmark,
  park: Trees,
  landmark: MapPin
};

export function getCategoryIcon(category: POICategory): LucideIcon {
  return ICONS[category] ?? MapPin;
}
