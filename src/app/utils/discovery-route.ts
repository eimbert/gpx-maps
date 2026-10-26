import type { CamaraDescubrir, VelocidadDescubrir } from '../interfaces/estructuras';

/** Distance-based playback: GPX timestamps never change the geometry or the pace. */
export interface DiscoveryPoint { lat: number; lon: number; ele?: number | null; segment?: number; }
export interface DiscoveryRoute { points: DiscoveryPoint[]; distances: number[]; total: number; }

/** A delayed frame must not fast-forward the flight across an unseen section.
 * Normal playback remains time-based down to 15 fps; discard longer stalls.
 */
export function discoveryFrameSeconds(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, Math.min(1 / 15, seconds)) : 0;
}

/** DEM tile arrivals and changes of detail must not snap the camera up/down.
 * Missing samples hold the last altitude; zero and negative elevations are valid.
 */
export function advanceDiscoveryElevation(current: number, target: number | null, dt: number): number {
  if (target === null || !Number.isFinite(target)) return current;
  const seconds = discoveryFrameSeconds(dt);
  const change = (target - current) * (1 - Math.exp(-seconds / 0.8));
  return current + Math.max(-60 * seconds, Math.min(60 * seconds, change));
}

/** At normal speed, short routes take 60 s; longer routes retain the pace of a 10 km flight.
 * The 3 s intro and 4 s outro stay fixed, so only travel time scales with distance.
 * Double speed halves travel time, preserving those opening and closing views.
 * Do not cap the duration: a cap would accelerate long tracks again.
 */
export function discoveryDuration(distanceMeters: number, speed: VelocidadDescubrir = 1): number {
  const normalDuration = !Number.isFinite(distanceMeters) || distanceMeters <= 0
    ? 60 : Math.max(60, Math.ceil(7 + distanceMeters / 10000 * 53));
  return 7 + (normalDuration - 7) / (speed === 2 ? 2 : 1);
}

/** Narrow screens need a closer view, with a more overhead angle for the terrain. */
export function discoveryFlightFraming(route: DiscoveryRoute, duration: number, width: number,
  camera: CamaraDescubrir = 'actual'): { zoom: number; pitch: number } {
  const narrow = Math.max(0, Math.min(1, (900 - width) / 500));
  const visibleMeters = Math.max(700, route.total / Math.max(1, duration - 7) * 7);
  const zoom = Math.log2(78271 * Math.cos((route.points[0]?.lat ?? 0) * Math.PI / 180)
    * Math.max(1, width) / visibleMeters) - 0.3 + narrow * 1.1;
  const currentZoom = Math.max(10 + narrow * 2.8, Math.min(15.7, zoom));
  // Close mode magnifies the route by about 1.7x on desktop and 2x on narrow screens.
  // Apply it after the existing limits so even short routes have two distinct views.
  const flightZoom = camera === 'cercana' ? Math.min(16.7, currentZoom + 0.75 + narrow * 0.25) : currentZoom;
  return { zoom: flightZoom, pitch: 50 - narrow * 4 };
}

export function prepareDiscoveryRoute(input: DiscoveryPoint[]): DiscoveryRoute {
  const points: DiscoveryPoint[] = [];
  const distances: number[] = [];
  let total = 0;
  for (const point of input) {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)
      || Math.abs(point.lat) > 85 || Math.abs(point.lon) > 180) continue;
    const previous = points[points.length - 1];
    // Unwrap longitude so a route crossing the date line does not fly around the world.
    const lon = previous ? point.lon + 360 * Math.round((previous.lon - point.lon) / 360) : point.lon;
    const clean = { lat: point.lat, lon, ele: point.ele };
    if (previous) {
      const distance = distanceMeters(previous, clean);
      if (distance < 0.1) continue;
      total += distance;
    }
    points.push(clean);
    distances.push(total);
  }
  return { points, distances, total };
}

export function distanceMeters(a: DiscoveryPoint, b: DiscoveryPoint): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function sampleDiscoveryRoute(route: DiscoveryRoute, distance: number): DiscoveryPoint {
  if (!route.points.length) return { lat: 0, lon: 0 };
  if (distance <= 0) return { ...route.points[0] };
  if (distance >= route.total) return { ...route.points[route.points.length - 1] };
  const d = Math.max(0, Math.min(route.total, distance));
  let low = 0, high = route.distances.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (route.distances[mid] < d) low = mid + 1; else high = mid;
  }
  const a = route.points[Math.max(0, low - 1)], b = route.points[low];
  const start = route.distances[Math.max(0, low - 1)];
  const ratio = (d - start) / (route.distances[low] - start || 1);
  return { lat: a.lat + (b.lat - a.lat) * ratio, lon: a.lon + (b.lon - a.lon) * ratio };
}

export function routeBearing(a: DiscoveryPoint, b: DiscoveryPoint): number {
  const rad = Math.PI / 180;
  const d = (b.lon - a.lon) * rad;
  return Math.atan2(Math.sin(d) * Math.cos(b.lat * rad),
    Math.cos(a.lat * rad) * Math.sin(b.lat * rad)
    - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos(d)) / rad;
}

export function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360 + 360) % 360 - 180;
}

export interface DiscoveryHeading {
  bearing: number;
  target: number;
  candidate: number | null;
  candidateSeconds: number;
}

/** Read the overall direction over several seconds of travel, not each bend. */
export function discoveryHeadingAt(route: DiscoveryRoute, distance: number, duration: number): number | null {
  const window = Math.min(route.total * 0.3, Math.max(100, Math.min(1000, route.total / Math.max(1, duration - 7) * 2)));
  const from = Math.max(0, distance - window / 2);
  const to = Math.min(route.total, distance + window / 2);
  const a = sampleDiscoveryRoute(route, from), b = sampleDiscoveryRoute(route, to);
  // On tight loops / hairpins the endpoints almost coincide: there is no reliable heading yet.
  if (distanceMeters(a, b) < Math.max(1, (to - from) * 0.25)) return null;
  return routeBearing(a, b);
}

/** Hold the chosen heading until a substantial, sustained change is confirmed. */
export function advanceDiscoveryHeading(state: DiscoveryHeading, desired: number | null, dt: number): DiscoveryHeading {
  let { bearing, target, candidate, candidateSeconds } = state;
  const seconds = Math.max(0, dt);
  if (desired === null || Math.abs(angleDelta(target, desired)) < 20) {
    candidate = null;
    candidateSeconds = 0;
  } else if (candidate === null || Math.abs(angleDelta(candidate, desired)) > 12) {
    candidate = desired;
    candidateSeconds = 0;
  } else {
    // A stalled frame must not count as multiple observations of a new direction.
    candidateSeconds += Math.min(seconds, 0.1);
    if (candidateSeconds >= 0.6) {
      target = desired;
      candidate = null;
      candidateSeconds = 0;
    }
  }
  const delta = angleDelta(bearing, target);
  bearing += Math.max(-18 * seconds, Math.min(18 * seconds, delta * (1 - Math.exp(-seconds / 1.25))));
  return { bearing, target, candidate, candidateSeconds };
}

export function discoveryTimeline(elapsed: number, duration: number): {
  phase: 'intro' | 'route' | 'outro'; progress: number; transition: number;
} {
  const intro = 3, outro = 4, travel = Math.max(1, duration - intro - outro);
  if (elapsed < intro) return { phase: 'intro', progress: 0, transition: Math.max(0, elapsed / intro) };
  if (elapsed < intro + travel) return { phase: 'route', progress: (elapsed - intro) / travel, transition: 0 };
  return { phase: 'outro', progress: 1, transition: Math.min(1, (elapsed - intro - travel) / outro) };
}
