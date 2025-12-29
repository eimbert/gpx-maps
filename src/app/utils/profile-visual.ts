export interface TrackPointWithElevation {
  lat: number;
  lon: number;
  ele: number;
}

export interface ProfileVisual {
  points: string;
  gridLinesY: number[];
  stats: {
    initialElevation: number;
    maxElevation: number;
    distanceKm: number;
  };
}

export function buildCumulativeDistances(points: TrackPointWithElevation[]): number[] {
  const distances: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const current = points[i];
    const delta = calculateDistance(prev.lat, prev.lon, current.lat, current.lon);
    distances.push(distances[i - 1] + delta);
  }
  return distances;
}

export function buildProfileVisual(
  points: TrackPointWithElevation[],
  width: number,
  height: number
): ProfileVisual | null {
  if (!points.length) return null;

  const elevations = points.map(p => p.ele ?? 0);
  const distances = buildCumulativeDistances(points);
  const initialEle = elevations[0];
  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);
  const eleRange = Math.max(1, maxEle - minEle);
  const totalDistance = distances[distances.length - 1];
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  const pointsStr = elevations
    .map((ele, idx) => {
      const x = (distances[idx] / Math.max(1, totalDistance)) * safeWidth;
      const y = safeHeight - ((ele - minEle) / eleRange) * safeHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const gridLinesY = [0.25, 0.5, 0.75].map(ratio => safeHeight - ratio * safeHeight);

  return {
    points: pointsStr,
    gridLinesY,
    stats: {
      initialElevation: initialEle,
      maxElevation: maxEle,
      distanceKm: totalDistance / 1000
    }
  };
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = Math.PI / 180;
  const φ1 = lat1 * toRad;
  const φ2 = lat2 * toRad;
  const dφ = (lat2 - lat1) * toRad;
  const dλ = (lon2 - lon1) * toRad;
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
