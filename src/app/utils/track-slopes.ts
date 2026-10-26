import { calculateElevation } from './gpx-elevation';

export interface SlopePoint {
  lat: number; lon: number; ele: number | null;
  segment?: number; sourceTrack?: number; estimatedElevation?: boolean;
}

export const SLOPE_SCALE = [
  { color: '#16a34a', label: '< 5 %' },
  { color: '#facc15', label: '5–<10 %' },
  { color: '#dc2626', label: '≥ 10 %' },
  { color: '#64748b', label: null }
] as const;

export function slopeColor(grade: number | null, baseColor: string): string {
  if (grade === null || !Number.isFinite(grade)) return SLOPE_SCALE[3].color;
  if (grade <= 0) return baseColor;
  const uphill = grade + 1e-7;
  return SLOPE_SCALE[uphill < 5 ? 0 : uphill < 10 ? 1 : 2].color;
}

/** Signed grade of each incoming edge. Null means insufficient elevation/distance.
 * Reuse the elevation noise/spike filter, then measure over 50 m of horizontal
 * travel. Never smooth across missing/estimated elevations or GPX boundaries.
 */
export function calculateTrackSlopes(points: readonly SlopePoint[]): (number | null)[] {
  const grades: (number | null)[] = points.map(() => null);
  let run: { index: number; distance: number }[] = [];
  const flush = (): void => {
    const length = run[run.length - 1]?.distance ?? 0;
    if (run.length >= 2 && length >= 20) {
      const profile = calculateElevation(run.map(sample => ({ ...points[sample.index], segment: 0 }))).profile;
      if (profile.length >= 2) {
        const elevationAt = (distance: number): number => {
          let lo = 0, hi = profile.length - 1;
          while (lo + 1 < hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (profile[mid].distanceKm * 1000 <= distance) lo = mid; else hi = mid;
          }
          const a = profile[lo], b = profile[hi];
          const ratio = Math.max(0, Math.min(1, (distance / 1000 - a.distanceKm) / (b.distanceKm - a.distanceKm)));
          return a.ele + (b.ele - a.ele) * ratio;
        };
        for (let i = 1; i < run.length; i++) {
          if (run[i].distance - run[i - 1].distance < 0.01) continue;
          const midpoint = (run[i].distance + run[i - 1].distance) / 2;
          const span = Math.min(50, length);
          const from = Math.max(0, Math.min(length - span, midpoint - span / 2));
          grades[run[i].index] = (elevationAt(from + span) - elevationAt(from)) / span * 100;
        }
      }
    }
    run = [];
  };
  points.forEach((point, index) => {
    const previous = points[index - 1];
    const valid = Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 &&
      Number.isFinite(point.lon) && Math.abs(point.lon) <= 180 && point.ele !== null &&
      Number.isFinite(point.ele) && point.ele >= -500 && point.ele <= 9000 && !point.estimatedElevation;
    if (!valid) { flush(); return; }
    const distance = previous ? horizontalDistance(previous, point) : 0;
    // Sparse samples cannot locate a local ramp reliably; draw those edges grey.
    if (previous && (point.segment !== previous.segment || point.sourceTrack !== previous.sourceTrack || distance > 100)) flush();
    run.push({ index, distance: run.length ? run[run.length - 1].distance + distance : 0 });
  });
  flush();
  return grades;
}

function horizontalDistance(a: SlopePoint, b: SlopePoint): number {
  const radians = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * radians / 2) ** 2 + Math.cos(a.lat * radians) *
    Math.cos(b.lat * radians) * Math.sin((b.lon - a.lon) * radians / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
