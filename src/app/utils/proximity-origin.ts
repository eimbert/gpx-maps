export interface ProximityOrigin { lat: number; lon: number; label: string; }

/** Decimal latitude, longitude, as copied from Google Maps. */
export function parseProximityCoordinates(value: string): ProximityOrigin | null {
  const match = value.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*[,;]\s*([+-]?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, label: `${lat}, ${lon}` };
}
