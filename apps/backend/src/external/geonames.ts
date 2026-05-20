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
    // Bounding box approx — each deg lat is 111 km
    const dLat = radiusKm / 111;
    const dLon = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
    const params = new URLSearchParams({
      north: String(lat + dLat),
      south: String(lat - dLat),
      east: String(lon + dLon),
      west: String(lon - dLon),
      maxRows: '50',
      orderby: 'population',
      username: user
    });
    for (const code of featureCodes) params.append('featureCode', code);
    const url = `http://api.geonames.org/searchJSON?${params}`;
    const r = await fetch(url);
    const j = await r.json() as any;
    return (j.geonames ?? []) as GeoNamesEntry[];
  } catch {
    return [];
  }
}
