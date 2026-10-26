/** Tracketeo elevation v5. Keep the Java GpxElevationService in parity (see docs/elevation.md). */
export interface ElevationPoint {
  lat: number;
  lon: number;
  ele: number;
  distanceKm: number;
  segment: number;
}

export interface ElevationResult {
  version: 5;
  quality: 'A' | 'B' | 'C' | null;
  qualityMetrics: ElevationQualityMetrics;
  gain: number | null;
  loss: number | null;
  min: number | null;
  max: number | null;
  distanceKm: number;
  status: 'ok' | 'partial' | 'unavailable';
  profile: ElevationPoint[];
}

export interface ElevationInputPoint { lat: number; lon: number; ele: number | null; segment: number; }

const STEP_METERS = 10;
export interface ElevationQualityMetrics {
  coveragePercent: number;
  noiseMeters: number;
  retainedVariationRatio: number;
  sampleSpacingP90Meters: number;
  spatialNoiseMeters: number;
}

export function calculateGpxElevation(xml: string): ElevationResult {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.doctype || doc.documentElement.localName !== 'gpx') {
    throw new Error('GPX inválido');
  }
  const elements = (root: Document | Element, name: string): Element[] =>
    Array.from(root.getElementsByTagNameNS('*', name));
  let groups = elements(doc, 'trkseg');
  let pointName = 'trkpt';
  if (!groups.length) {
    groups = elements(doc, 'trk');
    if (!groups.length) { groups = elements(doc, 'rte'); pointName = 'rtept'; }
  }
  if (!groups.length) groups = [doc.documentElement];
  const number = (text: string | null | undefined): number | null => {
    if (!text?.trim()) return null;
    const value = Number(text.trim().replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  };
  const points: ElevationInputPoint[] = [];
  groups.forEach((group, segment) => {
    elements(group, pointName).forEach(node => points.push({
      lat: number(node.getAttribute('lat')) ?? NaN,
      lon: number(node.getAttribute('lon')) ?? NaN,
      ele: number(elements(node, 'ele')[0]?.textContent),
      segment
    }));
  });
  if (!points.length) throw new Error('El GPX no contiene puntos de ruta');
  return calculateElevation(points);
}

/** Pure function, also tested against the Java implementation with identical fixtures. */
export function calculateElevation(input: ElevationInputPoint[]): ElevationResult {
  const runs: ElevationPoint[][] = [];
  let run: ElevationPoint[] = [];
  let previous: ElevationInputPoint | null = null;
  let distanceKm = 0;
  let missing = false;
  let segment = 0;
  const flush = (): void => { if (run.length) runs.push(run); run = []; segment++; };
  for (const point of input) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) {
      missing = true; flush(); previous = null; continue;
    }
    if (previous && previous.segment !== point.segment) { flush(); previous = null; }
    if (previous) distanceKm += distanceMeters(previous, point) / 1000;
    previous = point;
    if (point.ele === null || !Number.isFinite(point.ele) || point.ele < -500 || point.ele > 9000) {
      missing = true; flush(); continue;
    }
    // Holding position must not turn GPS/barometer drift into ascent. Keep the first sample.
    if (run.length && (distanceKm - run[run.length - 1].distanceKm) * 1000 < 1) continue;
    run.push({ ...point, ele: point.ele, distanceKm, segment });
  }
  flush();

  // Assess original samples before filtering. This is signal quality, not sensor identification.
  const assessment = assessElevationQuality(runs, input, missing);
  const quality = assessment.quality;
  const reversal = assessment.correlatedNoise
    ? Math.max(8, Math.min(20, 3 * assessment.metrics.spatialNoiseMeters))
    : quality === 'A' ? 1 : quality === 'C' ? 8 : 5;
  const halfWindow = assessment.correlatedNoise ? 100 : quality === 'C' ? 20 : 10;

  let gain = 0;
  let loss = 0;
  let min = Infinity;
  let max = -Infinity;
  const profile: ElevationPoint[] = [];
  for (const raw of runs) {
    if (raw.length < 2) { missing = true; continue; }
    // Remove only isolated implausible spikes, before interpolation can spread them out.
    const clean = raw.map(point => ({ ...point }));
    for (let i = 1; i < raw.length - 1; i++) {
      const a = raw[i - 1], b = raw[i], c = raw[i + 1];
      const left = (b.distanceKm - a.distanceKm) * 1000;
      const right = (c.distanceKm - b.distanceKm) * 1000;
      const expected = a.ele + (c.ele - a.ele) * left / (left + right);
      if ((b.ele - a.ele) * (c.ele - b.ele) < 0 &&
          Math.abs(b.ele - expected) > Math.max(20, Math.min(left, right) * 0.5) &&
          Math.abs(c.ele - a.ele) <= left + right) clean[i].ele = expected;
    }
    const sampled: ElevationPoint[] = [];
    const start = clean[0].distanceKm;
    const lengthMeters = (clean[clean.length - 1].distanceKm - start) * 1000;
    const distances = clean.map(point => (point.distanceKm - start) * 1000);
    const integral = [0];
    for (let i = 1; i < clean.length; i++) integral.push(integral[i - 1] +
      (clean[i - 1].ele + clean[i].ele) / 2 * (distances[i] - distances[i - 1]));
    const integralAt = (distance: number): number => {
      let left = 0, right = clean.length - 1;
      while (left + 1 < right) {
        const middle = Math.floor((left + right) / 2);
        if (distances[middle] <= distance) left = middle; else right = middle;
      }
      const offset = distance - distances[left];
      const slope = (clean[right].ele - clean[left].ele) / (distances[right] - distances[left]);
      return integral[left] + clean[left].ele * offset + slope * offset * offset / 2;
    };
    // Bound pathological routes to 200k resampled points per continuous run.
    const step = Math.max(STEP_METERS, lengthMeters / 199999);
    let index = 0;
    for (let offset = 0; offset < lengthMeters; offset += step) {
      const target = start + offset / 1000;
      while (index < clean.length - 2 && clean[index + 1].distanceKm < target) index++;
      const a = clean[index], b = clean[index + 1];
      const ratio = Math.max(0, Math.min(1, (target - a.distanceKm) / (b.distanceKm - a.distanceKm)));
      // Anti-alias filter: average over distance BEFORE decimation, independent of recording density.
      const from = Math.max(0, offset - halfWindow), to = Math.min(lengthMeters, offset + halfWindow);
      const ele = offset === 0 ? clean[0].ele : (integralAt(to) - integralAt(from)) / (to - from);
      sampled.push({ lat: a.lat + (b.lat - a.lat) * ratio, lon: a.lon + (b.lon - a.lon) * ratio,
        ele, distanceKm: target, segment: a.segment });
    }
    sampled.push({ ...clean[clean.length - 1] });
    const median = sampled.map((point, i) => quality === 'A' || i === 0 || i === sampled.length - 1 ? point.ele :
      [sampled[i - 1].ele, point.ele, sampled[i + 1].ele].sort((a, b) => a - b)[1]);
    const smooth = sampled.map((point, i) => ({ ...point, ele:
      quality === 'A' || i === 0 || i === sampled.length - 1 ? median[i] : (median[i - 1] + 2 * median[i] + median[i + 1]) / 4 }));
    const totals = accumulateExtrema(smooth.map(point => point.ele), reversal);
    gain += totals.gain; loss += totals.loss;
    for (const point of smooth) { min = Math.min(min, point.ele); max = Math.max(max, point.ele); profile.push(point); }
  }
  const available = profile.length >= 2;
  return { version: 5, quality: available ? quality : null, qualityMetrics: assessment.metrics,
    gain: available ? Math.round(gain) : null, loss: available ? Math.round(loss) : null,
    min: available ? min : null, max: available ? max : null, distanceKm,
    status: !available ? 'unavailable' : missing ? 'partial' : 'ok', profile };
}

/** Confirm a change of direction after the selected threshold; count the whole climb/descent. */
function accumulateExtrema(values: number[], reversal: number): { gain: number; loss: number } {
  let pivot = values[0], extreme = pivot, direction = 0, gain = 0, loss = 0;
  let low = pivot, high = pivot;
  for (let i = 1; i < values.length; i++) {
    const value = values[i];
    if (direction === 0) {
      low = Math.min(low, value); high = Math.max(high, value);
      if (value - low >= reversal) { pivot = low; direction = 1; extreme = value; }
      else if (high - value >= reversal) { pivot = high; direction = -1; extreme = value; }
    } else if (direction === 1) {
      if (value > extreme) extreme = value;
      else if (extreme - value >= reversal) { gain += extreme - pivot; pivot = extreme; extreme = value; direction = -1; }
    } else {
      if (value < extreme) extreme = value;
      else if (value - extreme >= reversal) { loss += pivot - extreme; pivot = extreme; extreme = value; direction = 1; }
    }
  }
  if (direction === 1) gain += extreme - pivot;
  if (direction === -1) loss += pivot - extreme;
  return { gain, loss };
}

function assessElevationQuality(runs: ElevationPoint[][], input: ElevationInputPoint[], missing: boolean):
    { quality: 'A' | 'B' | 'C'; metrics: ElevationQualityMetrics; correlatedNoise: boolean } {
  const residuals: number[] = [], spacings: number[] = [], spatialResiduals: number[] = [];
  let variation = 0, retained = 0, count = 0, length = 0, spikes = 0, triples = 0;
  for (const run of runs) {
    count += run.length;
    if (run.length < 2) continue;
    length += (run[run.length - 1].distanceKm - run[0].distanceKm) * 1000;
    // A small adjacent-point residual is not proof of a clean signal: smooth
    // oscillations can span many samples. Measure a fixed spatial scale too.
    const start = run[0].distanceKm;
    const distances = run.map(p => (p.distanceKm - start) * 1000);
    const end = distances[distances.length - 1];
    const elevationAt = (distance: number): number | null => {
      let left = 0, right = run.length - 1;
      while (left + 1 < right) {
        const middle = Math.floor((left + right) / 2);
        if (distances[middle] <= distance) left = middle; else right = middle;
      }
      const gap = distances[right] - distances[left];
      if (gap > 100) return null;
      return run[left].ele + (run[right].ele - run[left].ele) * (distance - distances[left]) / gap;
    };
    for (let offset = 50; offset <= end - 50; offset += Math.max(10, end / 199999)) {
      const a = elevationAt(offset - 50), b = elevationAt(offset), c = elevationAt(offset + 50);
      if (a !== null && b !== null && c !== null) spatialResiduals.push(Math.abs(b - (a + c) / 2));
    }
    const totals = accumulateExtrema(run.map(p => p.ele), 5);
    retained += totals.gain + totals.loss;
    for (let i = 1; i < run.length; i++) {
      spacings.push((run[i].distanceKm - run[i - 1].distanceKm) * 1000);
      variation += Math.abs(run[i].ele - run[i - 1].ele);
    }
    for (let i = 1; i < run.length - 1; i++) {
      const a = run[i - 1], b = run[i], c = run[i + 1];
      const left = (b.distanceKm - a.distanceKm) * 1000, right = (c.distanceKm - b.distanceKm) * 1000;
      if (left > 100 || right > 100) continue;
      const residual = Math.abs(b.ele - (a.ele + (c.ele - a.ele) * left / (left + right)));
      residuals.push(residual); triples++;
      if (residual > Math.max(20, Math.min(left, right) * 0.5)) spikes++;
    }
  }
  const percentile90 = (values: number[]): number => {
    if (!values.length) return 0;
    values.sort((a, b) => a - b);
    return values[Math.ceil(values.length * 0.9) - 1];
  };
  const valid = input.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && p.ele !== null && Number.isFinite(p.ele) && p.ele >= -500 && p.ele <= 9000).length;
  const metrics: ElevationQualityMetrics = {
    coveragePercent: input.length ? 100 * valid / input.length : 0,
    noiseMeters: percentile90(residuals),
    retainedVariationRatio: variation > 0.01 ? Math.min(1, retained / variation) : 1,
    sampleSpacingP90Meters: percentile90(spacings),
    spatialNoiseMeters: percentile90(spatialResiduals)
  };
  // Require both substantial spatial oscillation and lost short reversals.
  // Curvature alone would misclassify genuine rolling/steep terrain as noise.
  const correlatedNoise = spatialResiduals.length >= 100 && metrics.spatialNoiseMeters > 3 &&
    metrics.retainedVariationRatio < 0.85 && metrics.sampleSpacingP90Meters <= 30;
  if (correlatedNoise || metrics.coveragePercent < 95 || (triples >= 20 && metrics.noiseMeters > 3) || (triples > 0 && spikes / triples > 0.01)) {
    return { quality: 'C', metrics, correlatedNoise };
  }
  if (!missing && count >= 20 && triples >= 18 && length >= 100 && metrics.noiseMeters <= 1 &&
      metrics.sampleSpacingP90Meters <= 30 && metrics.retainedVariationRatio >= 0.8 && spikes === 0) {
    return { quality: 'A', metrics, correlatedNoise };
  }
  return { quality: 'B', metrics, correlatedNoise };
}

function distanceMeters(a: ElevationInputPoint, b: ElevationInputPoint): number {
  const radians = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * radians / 2) ** 2 +
    Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin((b.lon - a.lon) * radians / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
