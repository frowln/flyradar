export interface GeoNamesEntry {
  geonameId: number;
  name: string;
  lat: string;
  lng: string;
  fcl: string;
  fcode: string;
  population?: number;
  elevation?: number;
}

export async function searchAround(
  lat: number,
  lon: number,
  radiusKm: number,
  featureCodes: string[]
): Promise<GeoNamesEntry[]> {
  const user = process.env['GEONAMES_USER'];
  if (!user) {
    console.warn('GEONAMES_USER not set, skipping GeoNames lookup');
    return [];
  }
  try {
    const codes = featureCodes.join(',');
    const url = `http://api.geonames.org/findNearbyJSON?lat=${lat}&lng=${lon}&radius=${radiusKm}&featureCode=${codes}&maxRows=50&username=${user}`;
    const r = await fetch(url);
    const j = await r.json() as any;
    return (j.geonames ?? []) as GeoNamesEntry[];
  } catch {
    return [];
  }
}
