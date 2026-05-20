// Open-Meteo — free weather API, no key required
const OPEN_METEO = 'https://api.open-meteo.com/v1';

export interface WeatherForecast {
  temperature: number;     // celsius
  weatherCode: number;     // WMO code
  windSpeed: number;       // km/h
  precipitation: number;   // mm
  description: string;
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherForecast | null> {
  try {
    const url = `${OPEN_METEO}/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,precipitation&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json() as any;
    const c = j.current;
    return {
      temperature: Math.round(c.temperature_2m),
      weatherCode: c.weather_code,
      windSpeed: Math.round(c.wind_speed_10m),
      precipitation: c.precipitation,
      description: weatherDescription(c.weather_code)
    };
  } catch {
    return null;
  }
}

function weatherDescription(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  if (code <= 99) return 'Thunderstorm';
  return 'Unknown';
}

export function weatherIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '🌨️';
  if (code <= 99) return '⛈️';
  return '❓';
}

export function packingList(temp: number, code: number): string[] {
  const items: string[] = [];
  if (temp < 5) items.push('🧥 Warm jacket', '🧣 Scarf', '🧤 Gloves');
  else if (temp < 15) items.push('🧥 Light jacket', '👖 Long pants');
  else if (temp < 25) items.push('👕 Comfortable layers');
  else items.push('🩳 Shorts', '👕 T-shirts', '🕶️ Sunglasses');

  if (code >= 51 && code <= 67) items.push('☂️ Umbrella');
  if (code >= 71 && code <= 86) items.push('❄️ Snow boots');
  if (temp >= 25) items.push('🧴 Sunscreen', '💧 Water bottle');
  if (code === 0 && temp >= 20) items.push('🕶️ Sunglasses');

  items.push('🔌 Universal adapter', '📱 Power bank');
  return items;
}
