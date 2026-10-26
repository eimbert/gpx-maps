import { DiscoveryPoint, DiscoveryRoute, distanceMeters, sampleDiscoveryRoute } from './discovery-route';

export interface DiscoveryPlace extends DiscoveryPoint { id: string | number; name: string; radius: number; }
const cache = new Map<string, DiscoveryPlace[]>();

/** One bounded query per route, never a geocoding request during each frame. */
export function discoveryPlacesQuery(route: DiscoveryRoute): string {
  const segments = Math.max(1, Math.min(160, Math.ceil(route.total / 750)));
  const coordinates = Array.from({ length: segments + 1 }, (_, i) => {
    const point = sampleDiscoveryRoute(route, route.total * i / segments);
    return [Number(((((point.lon + 180) % 360 + 360) % 360) - 180).toFixed(5)), Number(point.lat.toFixed(5))];
  });
  const buffer = Math.ceil(1200 + Math.min(1800, route.total / segments / 2));
  return JSON.stringify({ coordinates, buffer });
}

/** Validate the small normalized response returned by our backend. */
export function parseDiscoveryPlaces(data: any): DiscoveryPlace[] {
  if (!Array.isArray(data)) return [];
  return data.slice(0, 500).filter((p: any) => p && ((typeof p.id === 'string' && p.id.length > 0) || Number.isFinite(p.id))
    && Number.isFinite(p.lat) && Math.abs(p.lat) <= 85 && Number.isFinite(p.lon) && Math.abs(p.lon) <= 180
    && typeof p.name === 'string' && p.name.trim() && [450, 700, 1000, 1200].includes(p.radius))
    .map((p: any) => ({ id: p.id, lat: p.lat, lon: p.lon, name: p.name.trim().slice(0, 120), radius: p.radius }));
}

/** Keep the current label through small distance changes between neighbouring villages. */
export function nearbyDiscoveryPlace(places: DiscoveryPlace[], point: DiscoveryPoint, current: DiscoveryPlace | null): DiscoveryPlace | null {
  const retained = current && distanceMeters(point, current) <= current.radius * 1.2 ? current : null;
  let nearest: DiscoveryPlace | null = null;
  let bestDistance = Infinity;
  for (const place of places) {
    const distance = distanceMeters(point, place);
    if (distance <= place.radius && distance < bestDistance) { nearest = place; bestDistance = distance; }
  }
  if (retained && (!nearest || nearest.id === retained.id || bestDistance + 250 >= distanceMeters(point, retained))) return retained;
  return nearest;
}

export async function loadDiscoveryPlaces(route: DiscoveryRoute, signal: AbortSignal, endpoint: string, token: string): Promise<DiscoveryPlace[]> {
  if (signal.aborted) throw new Error('Place lookup cancelled');
  const query = discoveryPlacesQuery(route);
  const cacheKey = endpoint + query;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 20000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: query,
      signal: controller.signal, credentials: 'omit'
    });
    if (!response.ok) throw new Error('Place lookup unavailable');
    const data = await response.json();
    if (signal.aborted || controller.signal.aborted) throw new Error('Place lookup cancelled');
    if (!Array.isArray(data)) throw new Error('Incomplete place lookup');
    const places = parseDiscoveryPlaces(data);
    if (cache.size >= 8) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, places);
    return places;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
