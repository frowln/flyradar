import { Flight, RoutePoint } from './flight';
import { POI } from './poi';

export interface OfflinePackage {
  version: 1;
  flight: Flight;
  route: RoutePoint[];      // ~200 points sampled along great circle
  pois: POI[];
  mapTilesUrl?: string;     // Optional: pre-packaged map tiles
  generatedAt: string;
}
