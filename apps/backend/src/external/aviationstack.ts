export interface AviationStackFlight {
  airline: { name: string; iata: string };
  flight: { iata: string };
  departure: { iata: string; scheduled: string; actual?: string };
  arrival: { iata: string; scheduled: string };
  aircraft?: { iata?: string };
}

export async function lookupFlight(
  flightNumber: string,
  date: string
): Promise<AviationStackFlight | null> {
  const key = process.env['AVIATIONSTACK_KEY'];
  if (!key) {
    console.warn('AVIATIONSTACK_KEY not set');
    return null;
  }
  try {
    const url = `http://api.aviationstack.com/v1/flights?access_key=${key}&flight_iata=${flightNumber}&flight_date=${date}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json() as any;
    return j.data?.[0] ?? null;
  } catch {
    return null;
  }
}
